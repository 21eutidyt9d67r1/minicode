import { Effect } from "effect"
import { Agent } from ".."
import type { RunEvent } from "../agent/events"
import type { Message } from "../llm/schema"
import { text } from "../llm/schema"
import { registry } from "../tool"
import { Builtin } from "../tool"

const DEFAULT_MODEL = "deepseek-v4-flash"

export const run = Effect.fn("Tui.run")(function* () {
  const tools = registry([Builtin.provider(process.cwd())])
  const messages: Message[] = [
    {
      role: "system",
      content: [
        text(
          [
            "You are minicode, a small terminal coding assistant.",
            "Use tools when useful. Tools are disclosed progressively: list tools first, then reveal specific tools before calling them.",
            "Keep answers concise.",
          ].join("\n"),
        ),
      ],
    },
  ]

  let active: AbortController | undefined
  process.on("SIGINT", () => {
    if (active) active.abort()
    else {
      process.stdout.write("\n")
      process.exit(0)
    }
  })

  printBanner()
  while (true) {
    const input = yield* prompt("you> ")
    const trimmed = input.trim()
    if (!trimmed) continue
    if (["/exit", "/quit", "q"].includes(trimmed)) break
    if (trimmed === "/help") {
      printHelp()
      continue
    }

    messages.push({ role: "user", content: [text(input)] })

    const controller = new AbortController()
    active = controller
    const outcome = yield* Effect.promise(() =>
      Effect.runPromise(
        Agent.run({
          model: process.env.MINICODE_MODEL ?? DEFAULT_MODEL,
          messages,
          registry: tools,
          onEvent: render,
        }),
        { signal: controller.signal },
      ).then(
        (result) => ({ ok: true as const, result }),
        (error) => ({ ok: false as const, error }),
      ),
    )
    const aborted = controller.signal.aborted
    active = undefined

    if (!outcome.ok) {
      if (aborted) process.stdout.write("\n[cancelled]\n\n")
      else process.stdout.write(`\n[error] ${describeError(outcome.error)}\n\n`)
      continue
    }

    const result = outcome.result
    messages.splice(0, messages.length, ...result.messages)
    if (result.cancelled) {
      process.stdout.write("\n[cancelled]\n\n")
      continue
    }
    process.stdout.write("\n\n")
  }
})

let streaming = false

function render(event: RunEvent): void {
  switch (event.type) {
    case "turn-start":
      streaming = false
      return
    case "text-delta":
      if (!streaming) {
        process.stdout.write("\nassistant> ")
        streaming = true
      }
      process.stdout.write(event.text)
      return
    case "tool-input-start":
      streaming = false
      process.stdout.write(`\n  ▸ calling ${event.name}\n`)
      return
    case "tool-result": {
      const mark = event.result.type === "error" ? "✗" : "✓"
      process.stdout.write(`  ${mark} ${event.name}\n`)
      return
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function printBanner() {
  process.stdout.write("minicode TUI\n")
  process.stdout.write("Commands: /help, /exit  (Ctrl-C cancels a running turn)\n\n")
}

function printHelp() {
  process.stdout.write("\n")
  process.stdout.write("/help  show this help\n")
  process.stdout.write("/exit  quit\n")
  process.stdout.write("Ctrl-C cancels the current turn; press again at the prompt to quit.\n")
  process.stdout.write("\n")
  process.stdout.write("Environment:\n")
  process.stdout.write("DEEPSEEK_API_KEY is required for model calls.\n")
  process.stdout.write("MINICODE_MODEL overrides the default model deepseek-v4-flash.\n\n")
}

function prompt(label: string): Effect.Effect<string> {
  return Effect.promise(
    () =>
      new Promise<string>((resolve) => {
        process.stdout.write(label)
        const onData = (chunk: Buffer) => {
          process.stdin.off("data", onData)
          resolve(chunk.toString("utf8").replace(/\r?\n$/, ""))
        }
        process.stdin.once("data", onData)
      }),
  )
}
