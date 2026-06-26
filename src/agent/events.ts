import type {
  FinishPayload,
  TextDeltaPayload,
  ToolCallPayload,
  ToolInputDeltaPayload,
  ToolInputStartPayload,
  ToolResult,
} from "../llm/schema"
import type { Settlement } from "./settlement"

type Turn = { turn: number }

export type RunEvent =
  | { type: "run-start"; model: string }
  | ({ type: "turn-start" } & Turn)
  | ({ type: "text-delta" } & Turn & TextDeltaPayload)
  | ({ type: "tool-input-start" } & Turn & ToolInputStartPayload)
  | ({ type: "tool-input-delta" } & Turn & ToolInputDeltaPayload)
  | ({ type: "tool-call" } & Turn & ToolCallPayload)
  | ({ type: "tool-result" } & Turn & ToolInputStartPayload & { result: ToolResult })
  | ({ type: "turn-finish" } & Turn & FinishPayload)
  | { type: "run-settled"; settlement: Settlement }

export type RunEventSink = (event: RunEvent) => void

export function emit(sink: RunEventSink | undefined, event: RunEvent): void {
  sink?.(event)
}

