import { Effect } from "effect"
import { Agent } from ".."
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
    const result = yield* Agent.run({
      model: process.env.MINICODE_MODEL ?? DEFAULT_MODEL,
      messages,
      registry: tools,
    })
    messages.splice(0, messages.length, ...result.messages)
    if (result.text.trim()) {
      process.stdout.write(`\nassistant> ${result.text.trim()}\n\n`)
      continue
    }
    process.stdout.write("\nassistant> (no text response)\n\n")
  }
})

function printBanner() {
  process.stdout.write("minicode TUI\n")
  process.stdout.write("Commands: /help, /exit\n\n")
}

function printHelp() {
  process.stdout.write("\n")
  process.stdout.write("/help  show this help\n")
  process.stdout.write("/exit  quit\n")
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
