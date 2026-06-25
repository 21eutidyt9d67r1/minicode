import { Effect } from "effect"
import type { LLMError } from "../llm/errors"
import type { Tool } from "../tool"
import { staticProvider, type ToolProvider } from "../tool"

export type Skill = {
  name: string
  description: string
  content: string
  tools?: Tool[]
}

export type SkillRegistry = {
  list(): Effect.Effect<Skill[], LLMError>
  get(name: string): Effect.Effect<Skill | undefined, LLMError>
}

export function memoryRegistry(skills: Skill[]): SkillRegistry {
  return {
    list: () => Effect.succeed(skills),
    get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
  }
}

export function provider(registry: SkillRegistry): ToolProvider {
  return {
    name: "skills",
    catalog: () =>
      registry.list().pipe(
        Effect.map((skills) =>
          skills.map((skill) => ({
            name: `skill_${skill.name}`,
            description: skill.description,
            source: "skill" as const,
          })),
        ),
      ),
    resolve: (name) =>
      Effect.gen(function* () {
        if (!name.startsWith("skill_")) return undefined
        const skill = yield* registry.get(name.slice("skill_".length))
        if (!skill) return undefined
        return {
          name,
          description: `Load skill context: ${skill.description}`,
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          execute: () =>
            Effect.succeed({
              type: "success" as const,
              value: {
                name: skill.name,
                content: skill.content,
                tools: skill.tools?.map((tool) => ({ name: tool.name, description: tool.description })) ?? [],
              },
            }),
        } satisfies Tool
      }),
  }
}

export function toolsProvider(skill: Skill): ToolProvider {
  return staticProvider(`skill:${skill.name}`, "skill", skill.tools ?? [])
}
