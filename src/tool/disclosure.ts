import { Effect } from "effect"
import type { LLMError } from "../llm/errors"
import type { ToolDefinition, ToolResult } from "../llm/schema"
import { definition, type Tool, type ToolCatalogItem, type ToolRegistry } from "."

const emptyObjectSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const

export type DisclosureState = {
  revealed: Set<string>
  loadedSkills: Set<string>
}

export type DisclosureView = {
  state: DisclosureState
  tools: ToolDefinition[]
}

export function initialState(): DisclosureState {
  return {
    revealed: new Set(),
    loadedSkills: new Set(),
  }
}

export function view(registry: ToolRegistry, state: DisclosureState): Effect.Effect<DisclosureView, LLMError> {
  return Effect.gen(function* () {
    const tools = yield* Effect.forEach(discoveryTools(registry, state), (tool) => Effect.succeed(definition(tool)))
    const revealed = yield* Effect.forEach([...state.revealed], (name) =>
      registry.resolve(name).pipe(Effect.map((tool) => (tool ? definition(tool) : undefined))),
    )
    return {
      state,
      tools: [...tools, ...revealed.filter((item): item is ToolDefinition => item !== undefined)],
    }
  })
}

export function resolveTool(
  registry: ToolRegistry,
  state: DisclosureState,
  name: string,
): Effect.Effect<Tool | undefined, LLMError> {
  const discovery = discoveryTools(registry, state).find((tool) => tool.name === name)
  if (discovery) return Effect.succeed(discovery)
  if (!state.revealed.has(name)) return Effect.succeed(undefined)
  return registry.resolve(name)
}

function discoveryTools(registry: ToolRegistry, state: DisclosureState): Tool[] {
  return [
    {
      name: "list_tools",
      description:
        "List available tools without exposing their full schemas. Use this before requesting a specific tool.",
      parameters: emptyObjectSchema,
      execute: () =>
        registry.catalog().pipe(
          Effect.map((items) => ({
            type: "success" as const,
            value: renderCatalog(items),
          })),
        ),
    },
    {
      name: "reveal_tools",
      description:
        "Reveal full schemas for the named tools. Use only for tools that are needed for the current task.",
      parameters: {
        type: "object",
        properties: {
          names: {
            type: "array",
            items: { type: "string" },
            description: "Tool names to reveal",
          },
        },
        required: ["names"],
        additionalProperties: false,
      },
      execute: (input) =>
        Effect.gen(function* () {
          const names = readNames(input)
          const catalog = yield* registry.catalog()
          const available = new Set(catalog.map((item) => item.name))
          const revealed = names.filter((name) => available.has(name))
          for (const name of revealed) state.revealed.add(name)
          return {
            type: "success" as const,
            value: {
              revealed,
              missing: names.filter((name) => !available.has(name)),
            },
          }
        }),
    },
    {
      name: "list_skills",
      description: "List available skills. Skills are loaded on demand and then may reveal more task-specific tools.",
      parameters: emptyObjectSchema,
      execute: () =>
        registry.catalog().pipe(
          Effect.map((items) => ({
            type: "success" as const,
            value: items.filter((item) => item.source === "skill"),
          })),
        ),
    },
  ]
}

function renderCatalog(items: ToolCatalogItem[]) {
  return items.map((item) => ({ name: item.name, description: item.description, source: item.source }))
}

function readNames(input: unknown) {
  if (typeof input !== "object" || input === null || !("names" in input)) return []
  const value = input.names
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

export function toolResultText(result: ToolResult) {
  if (result.type === "error") return result.message
  if (typeof result.value === "string") return result.value
  return JSON.stringify(result.value)
}
