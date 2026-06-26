import type { Message } from "../llm/schema"
import type { Context } from "./index"

export type ContextSnapshot = {
  epoch: number
  turnCount: number
  context: Context
}

export type ContextDelta = {
  epochChanged: boolean
  turnsAdded: number
  turnsRemoved: number
  changed: boolean
}

// Mirrors opencode's acp/session.ts snapshot(): return an immutable copy so the captured
// value never aliases the live mutable Context. Callers compare snapshots by value.
export function snapshot(ctx: Context): ContextSnapshot {
  const copy: Context = {
    baseline: ctx.baseline,
    turns: ctx.turns.map(cloneMessage),
  }
  return {
    epoch: ctx.baseline.epoch,
    turnCount: ctx.turns.length,
    context: Object.freeze(copy),
  }
}

export function cloneMessage(message: Message): Message {
  return structuredClone(message)
}

export function equals(a: ContextSnapshot, b: ContextSnapshot): boolean {
  if (a.epoch !== b.epoch) return false
  if (a.turnCount !== b.turnCount) return false
  return serializeTurns(a) === serializeTurns(b)
}

export function diff(a: ContextSnapshot, b: ContextSnapshot): ContextDelta {
  const delta = b.turnCount - a.turnCount
  return {
    epochChanged: a.epoch !== b.epoch,
    turnsAdded: Math.max(0, delta),
    turnsRemoved: Math.max(0, -delta),
    changed: !equals(a, b),
  }
}

function serializeTurns(snapshot: ContextSnapshot): string {
  return JSON.stringify(snapshot.context.turns)
}
