import { Effect } from "effect"
import * as LLMClient from "../llm/client"
import * as Disclosure from "../tool/disclosure"
import type { AssistantMessage, LLMEvent, LLMRequest, Message, ToolCallPart } from "../llm/schema"
import { resultPart, unknownTool, type ToolRegistry } from "../tool"

export type AgentInput = LLMRequest & {
  registry: ToolRegistry
  maxTurns?: number
}

export type AgentResult = {
  messages: Message[]
  events: LLMEvent[]
  text: string
}

export const run = Effect.fn("Agent.run")(function* (input: AgentInput) {
  const state = Disclosure.initialState()
  const maxTurns = input.maxTurns ?? 8
  const events: LLMEvent[] = []
  const messages: Message[] = [...input.messages]
  let text = ""

  for (let turn = 0; turn < maxTurns; turn++) {
    const view = yield* Disclosure.view(input.registry, state)
    const response = yield* LLMClient.generate({
      ...input,
      messages,
      tools: view.tools,
    })
    events.push(...response.events)
    text += response.text

    const calls = response.events.filter((event): event is Extract<LLMEvent, { type: "tool-call" }> =>
      event.type === "tool-call",
    )
    if (calls.length === 0) return { messages, events, text }

    messages.push(assistantMessage(response.text, calls))
    messages.push({
      role: "tool",
      content: yield* Effect.forEach(calls, (call) => executeTool(input.registry, state, call)),
    })
  }

  return { messages, events, text }
})

function assistantMessage(text: string, calls: Array<Extract<LLMEvent, { type: "tool-call" }>>): AssistantMessage {
  return {
    role: "assistant",
    content: [
      ...(text ? [{ type: "text" as const, text }] : []),
      ...calls.map((call) => ({ type: "tool-call" as const, id: call.id, name: call.name, input: call.input })),
    ],
  }
}

function executeTool(
  registry: ToolRegistry,
  state: Disclosure.DisclosureState,
  call: Extract<LLMEvent, { type: "tool-call" }>,
) {
  const part: ToolCallPart = { type: "tool-call", id: call.id, name: call.name, input: call.input }
  return Effect.gen(function* () {
    const tool = yield* Disclosure.resolveTool(registry, state, call.name)
    if (!tool) return resultPart(part, unknownTool(part))
    const result = yield* tool.execute(call.input, {})
    return resultPart(part, result)
  })
}
