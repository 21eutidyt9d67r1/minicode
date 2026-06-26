import type { Message, SystemMessage } from "../llm/schema"
import { text } from "../llm/schema"
import type { Baseline } from "./baseline"

export type Context = {
  baseline: Baseline
  turns: Message[]
}

export function make(baseline: Baseline, turns: Message[] = []): Context {
  return { baseline, turns }
}

export function build(ctx: Context): Message[] {
  const system: SystemMessage[] = [
    { role: "system", content: [text(ctx.baseline.header)] },
    { role: "system", content: [text(ctx.baseline.rest)] },
  ]
  return [...system, ...ctx.turns]
}

export function appendTurn(ctx: Context, message: Message): Context {
  return { ...ctx, turns: [...ctx.turns, message] }
}

export function replaceTurns(ctx: Context, turns: Message[]): Context {
  return { ...ctx, turns }
}

export * from "./baseline"
export * from "./compaction"
export * from "./snapshot"
export * from "./source"
export * from "./workspace"
