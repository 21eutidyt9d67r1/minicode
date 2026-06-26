import { Effect } from "effect"
import { Agent } from ".."
import type { RunEvent } from "../agent/events"
import * as Context from "../context"
import type { Message } from "../llm/schema"
import { text } from "../llm/schema"
import { registry } from "../tool"
import { Builtin } from "../tool"

const DEFAULT_MODEL = "deepseek-v4-flash"

const BASE_PROMPT = [
  "You are minicode, a small terminal coding assistant.",
  "Use tools when useful. Tools are disclosed progressively: list tools first, then reveal specific tools before calling them.",
  "Keep answers concise.",
].join("\n")

export const run = Effect.fn("Tui.run")(function* () {
  const tools = registry([Builtin.provider(process.cwd())])
  const catalog = yield* tools.catalog()
  const facts = yield* Context.gatherWorkspace(process.cwd())
  const baseline = Context.buildBaseline([
    Context.baseSource(BASE_PROMPT),
    Context.envSource(facts),
    Context.instructionsSource(facts),
    Context.toolsSource(catalog.map((item) => ({ name: item.name, description: item.description }))),
  ])
  let ctx = Context.make(baseline, [])

  let active: AbortController | undefined
  process.on("SIGINT", () => {
    if (active) active.abort()
    else {
      process.stdout.write("\n")
      process.exit(0)
    }
  })

  printBanner()
  const model = process.env.MINICODE_MODEL ?? DEFAULT_MODEL
  while (true) {
    const input = yield* prompt("you> ")
    const trimmed = input.trim()
    if (!trimmed) continue
    if (["/exit", "/quit", "q"].includes(trimmed)) break
    if (trimmed === "/help") {
      printHelp()
      continue
    }
    if (trimmed === "/compact") {
      ctx = yield* runCompaction(ctx, model)
      continue
    }

    const before = Context.snapshot(ctx)
    ctx = Context.appendTurn(ctx, { role: "user", content: [text(input)] })

    const controller = new AbortController()
    active = controller
    const outcome = yield* Effect.promise(() =>
      Effect.runPromise(
        Agent.run({
          model,
          messages: Context.build(ctx),
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
    ctx = Context.replaceTurns(ctx, stripSystem(result.messages))
    logContextDelta(before, Context.snapshot(ctx))
    if (result.cancelled) {
      process.stdout.write("\n[cancelled]\n\n")
      continue
    }
    process.stdout.write("\n\n")

    if (Context.isOverflow(result.usage, model)) {
      process.stdout.write(`(context ${result.usage?.total} tokens near limit — compacting)\n`)
      ctx = yield* runCompaction(ctx, model)
    }
  }
})

const runCompaction = Effect.fn("Tui.compact")(function* (ctx: Context.Context, model: string) {
  const result = yield* Effect.catch(Context.compact({ turns: ctx.turns, model }), (error) => {
    process.stdout.write(`\n[compact failed] ${describeError(error)}\n`)
    return Effect.succeed({ turns: ctx.turns, summarized: 0, kept: ctx.turns.length })
  })
  if (result.summarized === 0) {
    process.stdout.write("∑ nothing to compact\n")
    return ctx
  }
  process.stdout.write(`∑ compacted ${result.summarized}→1 summary, kept ${result.kept} recent\n`)
  return Context.replaceTurns(ctx, result.turns)
})

function stripSystem(messages: Message[]): Message[] {
  return messages.filter((message) => message.role !== "system")
}

function logContextDelta(before: Context.ContextSnapshot, after: Context.ContextSnapshot): void {
  const delta = Context.diff(before, after)
  if (!delta.changed) {
    process.stdout.write(`\n= context unchanged (epoch ${after.epoch})\n`)
    return
  }
  const parts: string[] = [`turns ${before.turnCount}→${after.turnCount}`]
  if (delta.epochChanged) parts.push(`epoch ${before.epoch}→${after.epoch}`)
  else parts.push(`epoch ${after.epoch}`)
  process.stdout.write(`\nΔ context changed (${parts.join(", ")})\n`)
}

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
  process.stdout.write("/compact  summarize older history to free context\n")
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
