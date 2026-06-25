import { Effect } from "effect"
import type { LLMError } from "../llm/errors"
import type { JsonSchema, ToolCallPart, ToolDefinition, ToolResult, ToolResultPart } from "../llm/schema"

export type ToolAccumulator = {
  id: string
  name: string
  inputText: string
  started: boolean
}

export type ToolCallParserState = {
  tools: Record<number, ToolAccumulator>
}

export type ToolContext = {
  signal?: AbortSignal
}

export type Tool = {
  name: string
  description: string
  parameters: JsonSchema
  execute(input: unknown, context: ToolContext): Effect.Effect<ToolResult, LLMError>
}

export type ToolCatalogItem = {
  name: string
  description: string
  source: "builtin" | "mcp" | "skill" | "discovery"
}

export type ToolProvider = {
  name: string
  catalog(): Effect.Effect<ToolCatalogItem[], LLMError>
  resolve(name: string): Effect.Effect<Tool | undefined, LLMError>
}

export type ToolRegistry = {
  catalog(): Effect.Effect<ToolCatalogItem[], LLMError>
  resolve(name: string): Effect.Effect<Tool | undefined, LLMError>
}

export function definition(tool: Tool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }
}

export function resultPart(call: ToolCallPart, result: ToolResult): ToolResultPart {
  return {
    type: "tool-result",
    id: call.id,
    name: call.name,
    result,
  }
}

export function registry(providers: ToolProvider[]): ToolRegistry {
  return {
    catalog: () =>
      Effect.forEach(providers, (provider) => provider.catalog()).pipe(Effect.map((items) => items.flat())),
    resolve: (name) =>
      Effect.gen(function* () {
        for (const provider of providers) {
          const tool = yield* provider.resolve(name)
          if (tool) return tool
        }
        return undefined
      }),
  }
}

export function staticProvider(name: string, source: ToolCatalogItem["source"], tools: Tool[]): ToolProvider {
  return {
    name,
    catalog: () =>
      Effect.succeed(
        tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          source,
        })),
      ),
    resolve: (toolName) => Effect.succeed(tools.find((tool) => tool.name === toolName)),
  }
}

export const unknownTool = (call: ToolCallPart): ToolResult => ({
  type: "error",
  message: `Unknown tool: ${call.name}`,
})

export * as Builtin from "./builtin"
