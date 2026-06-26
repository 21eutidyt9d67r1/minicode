export type CacheControl = "ephemeral"

export type TextPart = {
  type: "text"
  text: string
  cacheControl?: CacheControl
  summary?: boolean
}

export type ImagePart = {
  type: "image"
  mime: "image/png" | "image/jpeg" | "image/webp"
  source: { type: "url"; url: string } | { type: "base64"; data: string }
  filename?: string
  cacheControl?: CacheControl
}

export type ToolCallPart = {
  type: "tool-call"
  id: string
  name: string
  input: unknown
  cacheControl?: CacheControl
}

export type ToolResult =
  | { type: "success"; value: unknown }
  | { type: "error"; message: string }

export type ToolResultPart = {
  type: "tool-result"
  id: string
  name: string
  result: ToolResult
  cacheControl?: CacheControl
}

export type ContentPart =
  | TextPart
  | ImagePart
  | ToolCallPart
  | ToolResultPart

export type SystemMessage = { role: "system"; content: TextPart[] }

export type UserMessage = { role: "user"; content: Array<TextPart | ImagePart> }

export type AssistantMessage = { role: "assistant"; content: Array<TextPart | ToolCallPart> }

export type ToolMessage = { role: "tool"; content: ToolResultPart[] }

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage

export function text(value: string): TextPart {
  return { type: "text", text: value }
}

export function user(value: string): UserMessage {
  return { role: "user", content: [text(value)] }
}

export type LLMRequest = {
  model: string
  messages: Message[]
  tools?: ToolDefinition[]
  toolChoice?: "auto" | "none" | "required" | { type: "tool"; name: string }
  temperature?: number
  maxTokens?: number
}
export type JsonSchema = Record<string, unknown>

export type ToolDefinition = {
  name: string
  description: string
  parameters: JsonSchema
}

export type ToolResultMessage = {
  role: "tool"
  content: ToolResultPart[]
}

export type FinishReason = "stop" | "length" | "tool-calls" | "content-filter" | "unknown"

export type TextDeltaPayload = { text: string }
export type ToolInputStartPayload = { id: string; name: string }
export type ToolInputDeltaPayload = { id: string; name: string; text: string }
export type ToolInputEndPayload = { id: string; name: string }
export type ToolCallPayload = { id: string; name: string; input: unknown }
export type FinishPayload = { reason: FinishReason }
export type UsagePayload = { input: number; output: number; total: number }

export type LLMEvent =
  | ({ type: "text-delta" } & TextDeltaPayload)
  | ({ type: "tool-input-start" } & ToolInputStartPayload)
  | ({ type: "tool-input-delta" } & ToolInputDeltaPayload)
  | ({ type: "tool-input-end" } & ToolInputEndPayload)
  | ({ type: "tool-call" } & ToolCallPayload)
  | ({ type: "finish" } & FinishPayload)
  | ({ type: "usage" } & UsagePayload)
