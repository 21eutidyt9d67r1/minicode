import { Effect, Stream } from "effect"
import type { LLMError } from "../llm/errors"
import type { FinishReason, LLMEvent, ToolCallPayload } from "../llm/schema"
import { emit, type RunEventSink } from "./events"

export type SettledToolCall = ToolCallPayload

export type Usage = { input: number; output: number; total: number }

export type Settlement = {
  text: string
  toolCalls: SettledToolCall[]
  finishReason: FinishReason
  cancelled: boolean
  usage?: Usage
}

export const settleStream = (
  stream: Stream.Stream<LLMEvent, LLMError>,
  turn: number,
  sink?: RunEventSink,
): Effect.Effect<Settlement, LLMError> =>
  Effect.suspend(() => {
    const settlement: Settlement = {
      text: "",
      toolCalls: [],
      finishReason: "unknown",
      cancelled: false,
    }

    const consume = Stream.runForEach(stream, (event: LLMEvent) =>
      Effect.sync(() => {
        absorb(settlement, event)
        forward(sink, turn, event)
      }),
    )

    return consume.pipe(
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          settlement.cancelled = true
        }),
      ),
      Effect.map(() => settlement),
    )
  })

function absorb(settlement: Settlement, event: LLMEvent): void {
  if (event.type === "text-delta") settlement.text += event.text
  else if (event.type === "tool-call") {
    settlement.toolCalls.push({ id: event.id, name: event.name, input: event.input })
  } else if (event.type === "finish") settlement.finishReason = event.reason
  else if (event.type === "usage") {
    settlement.usage = { input: event.input, output: event.output, total: event.total }
  }
}

function forward(sink: RunEventSink | undefined, turn: number, event: LLMEvent): void {
  if (!sink) return
  switch (event.type) {
    case "text-delta":
    case "tool-input-start":
    case "tool-input-delta":
    case "tool-call":
      return emit(sink, { ...event, turn })
    case "finish":
      return emit(sink, { type: "turn-finish", turn, reason: event.reason })
    case "usage":
      return emit(sink, { type: "usage", turn, input: event.input, output: event.output, total: event.total })
    case "tool-input-end":
      return
  }
}
