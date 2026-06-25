import { Effect } from "effect"
import { ProtocolError, type LLMError } from "../errors"
import type {
  AssistantMessage,
  FinishReason,
  LLMEvent,
  LLMRequest,
  Message,
  ToolDefinition,
  ToolResult,
  UserMessage,
} from "../schema"
import type { ToolAccumulator } from "../../tool"
import { Protocol } from "../route"

type DeepSeekUserContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

type DeepSeekMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | DeepSeekUserContent[] }
  | { role: "assistant"; content?: string; tool_calls?: DeepSeekAssistantToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }

type DeepSeekAssistantToolCall = {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

type DeepSeekTool = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type DeepSeekChatBody = {
  model: string
  messages: DeepSeekMessage[]
  stream: true
  tools?: DeepSeekTool[]
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } }
  temperature?: number
  max_tokens?: number
}

type DeepSeekToolCallDelta = {
  index?: number
  id?: string
  function?: {
    name?: string
    arguments?: string
  }
}

type DeepSeekChunk = {
  choices?: Array<{
    delta?: {
      content?: string
      tool_calls?: DeepSeekToolCallDelta[]
    }
    finish_reason?: string | null
  }>
}

type ParserState = {
  tools: Record<number, ToolAccumulator>
  finishReason?: FinishReason
}

const from = Effect.fn("DeepSeekChat.body.from")(function* (request: LLMRequest) {
  return {
    model: request.model,
    messages: yield* Effect.forEach(request.messages, lowerMessage).pipe(Effect.map((items) => items.flat())),
    stream: true as const,
    tools: request.tools?.map(lowerTool),
    tool_choice: request.toolChoice ? lowerToolChoice(request.toolChoice) : undefined,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
  } satisfies DeepSeekChatBody
})

function lowerTool(tool: ToolDefinition): DeepSeekTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}

function lowerToolChoice(toolChoice: NonNullable<LLMRequest["toolChoice"]>): DeepSeekChatBody["tool_choice"] {
  if (typeof toolChoice === "string") return toolChoice
  return { type: "function", function: { name: toolChoice.name } }
}

function lowerMessage(message: Message): Effect.Effect<DeepSeekMessage[], LLMError> {
  if (message.role === "system") return Effect.succeed([{ role: "system", content: joinText(message.content) }])
  if (message.role === "user") return Effect.succeed([lowerUserMessage(message)])
  if (message.role === "assistant") return Effect.succeed([lowerAssistantMessage(message)])
  return Effect.succeed(
    message.content.map((part) => ({
      role: "tool" as const,
      tool_call_id: part.id,
      content: toolResultText(part.result),
    })),
  )
}

function lowerUserMessage(message: UserMessage): DeepSeekMessage {
  const content = message.content.map((part): DeepSeekUserContent => {
    if (part.type === "text") return { type: "text", text: part.text }
    return {
      type: "image_url",
      image_url: {
        url: part.source.type === "url" ? part.source.url : `data:${part.mime};base64,${part.source.data}`,
      },
    }
  })

  if (content.every((part) => part.type === "text")) {
    return { role: "user", content: content.map((part) => part.text).join("") }
  }
  return { role: "user", content }
}

function lowerAssistantMessage(message: AssistantMessage): DeepSeekMessage {
  const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n")
  const toolCalls = message.content
    .filter((part) => part.type === "tool-call")
    .map((part) => ({
      id: part.id,
      type: "function" as const,
      function: {
        name: part.name,
        arguments: JSON.stringify(part.input),
      },
    }))

  return {
    role: "assistant",
    content: text || undefined,
    tool_calls: toolCalls.length ? toolCalls : undefined,
  }
}

function joinText(parts: Array<{ text: string }>) {
  return parts.map((part) => part.text).join("\n")
}

function toolResultText(result: ToolResult) {
  if (result.type === "error") return result.message
  if (typeof result.value === "string") return result.value
  return JSON.stringify(result.value)
}

const decode = Effect.fn("DeepSeekChat.stream.decode")(function* (frame: string) {
  const value = yield* Effect.try({
    try: () => JSON.parse(frame) as unknown,
    catch: () => new ProtocolError(`Invalid DeepSeek stream JSON: ${frame}`),
  })
  if (!isRecord(value)) return yield* Effect.fail(new ProtocolError("DeepSeek stream event must be an object"))
  return value as DeepSeekChunk
})

const step = Effect.fn("DeepSeekChat.stream.step")(function* (state: ParserState, event: DeepSeekChunk) {
  const events: LLMEvent[] = []
  const choice = event.choices?.[0]
  const delta = choice?.delta
  const finishReason = choice?.finish_reason ? mapFinishReason(choice.finish_reason) : state.finishReason
  const tools = { ...state.tools }

  if (delta?.content) events.push({ type: "text-delta", text: delta.content })

  for (const item of delta?.tool_calls ?? []) {
    const index = item.index ?? 0
    const existing = tools[index]
    const id = item.id ?? existing?.id
    const name = item.function?.name ?? existing?.name
    const text = item.function?.arguments ?? ""
    if (!id || !name) return yield* Effect.fail(new ProtocolError("DeepSeek tool call delta is missing id or name"))

    if (!existing?.started) events.push({ type: "tool-input-start", id, name })
    if (text) events.push({ type: "tool-input-delta", id, name, text })
    tools[index] = {
      id,
      name,
      inputText: (existing?.inputText ?? "") + text,
      started: true,
    }
  }

  if (finishReason === "tool-calls") events.push(...finishToolCalls(tools))
  if (choice?.finish_reason) events.push({ type: "finish", reason: finishReason ?? "unknown" })

  return [{ tools, finishReason }, events] as const
})

function finishToolCalls(tools: Record<number, ToolAccumulator>): LLMEvent[] {
  return Object.values(tools).flatMap((tool) => {
    const input = parseToolInput(tool)
    return [
      { type: "tool-input-end" as const, id: tool.id, name: tool.name },
      { type: "tool-call" as const, id: tool.id, name: tool.name, input },
    ]
  })
}

function parseToolInput(tool: ToolAccumulator) {
  try {
    return JSON.parse(tool.inputText || "{}") as unknown
  } catch {
    throw new ProtocolError(`Invalid JSON input for tool call ${tool.name}`)
  }
}

function mapFinishReason(reason: string): FinishReason {
  if (reason === "stop") return "stop"
  if (reason === "length") return "length"
  if (reason === "tool_calls" || reason === "function_call") return "tool-calls"
  if (reason === "content_filter") return "content-filter"
  return "unknown"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const protocol = Protocol.make({
  id: "deepseek-chat",
  body: { from },
  stream: {
    decode,
    initial: () => ({ tools: {} }),
    step,
  },
})
