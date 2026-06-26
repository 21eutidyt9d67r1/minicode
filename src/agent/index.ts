import { Effect } from "effect"
import * as LLMClient from "../llm/client"
import * as Disclosure from "../tool/disclosure"
import type { AssistantMessage, Message, ToolCallPart } from "../llm/schema"
import { resultPart, unknownTool, type ToolContext, type ToolRegistry } from "../tool"
import { emit, type RunEvent, type RunEventSink } from "./events"
import { settleStream, type SettledToolCall, type Settlement } from "./settlement"

export * from "./events"
export * from "./settlement"


export type AgentInput = {
  model: string
  messages: Message[]
  registry: ToolRegistry
  maxTurns?: number
  temperature?: number
  maxTokens?: number
  onEvent?: RunEventSink
}

export type AgentResult = {
  messages: Message[]
  events: RunEvent[]
  text: string
  cancelled: boolean
}

export const run = Effect.fn("Agent.run")(function* (input: AgentInput) {
  const state = Disclosure.initialState()
  const maxTurns = input.maxTurns ?? 8
  const events: RunEvent[] = []
  const messages: Message[] = [...input.messages]
  let text = ""

  const sink: RunEventSink = (event) => {
    events.push(event)
    input.onEvent?.(event)
  }

  emit(sink, { type: "run-start", model: input.model })

  for (let turn = 0; turn < maxTurns; turn++) {
    emit(sink, { type: "turn-start", turn })

    const view = yield* Disclosure.view(input.registry, state)
    const stream = LLMClient.stream({
      model: input.model,
      messages,
      tools: view.tools,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    })
    const settlement = yield* settleStream(stream, turn, sink)

    if (settlement.text) text += settlement.text

    if (settlement.cancelled || settlement.toolCalls.length === 0) {
      emit(sink, { type: "run-settled", settlement })
      return { messages, events, text, cancelled: settlement.cancelled }
    }

    messages.push(assistantMessage(settlement))
    messages.push({
      role: "tool",
      content: yield* Effect.forEach(settlement.toolCalls, (call) =>
        executeTool(input.registry, state, turn, call, sink),
      ),
    })
  }

  const settlement: Settlement = { text, toolCalls: [], finishReason: "length", cancelled: false }
  emit(sink, { type: "run-settled", settlement })
  return { messages, events, text, cancelled: false }
})

function assistantMessage(settlement: Settlement): AssistantMessage {
  return {
    role: "assistant",
    content: [
      ...(settlement.text ? [{ type: "text" as const, text: settlement.text }] : []),
      ...settlement.toolCalls.map((call) => ({
        type: "tool-call" as const,
        id: call.id,
        name: call.name,
        input: call.input,
      })),
    ],
  }
}

function executeTool(
  registry: ToolRegistry,
  state: Disclosure.DisclosureState,
  turn: number,
  call: SettledToolCall,
  sink: RunEventSink,
) {
  const part: ToolCallPart = { type: "tool-call", id: call.id, name: call.name, input: call.input }
  return Effect.gen(function* () {
    const context: ToolContext = {}
    const tool = yield* Disclosure.resolveTool(registry, state, call.name)
    const resolved = tool ? resultPart(part, yield* tool.execute(call.input, context)) : resultPart(part, unknownTool(part))
    emit(sink, { type: "tool-result", turn, id: call.id, name: call.name, result: resolved.result })
    return resolved
  })
}
