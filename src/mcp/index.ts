import { Effect } from "effect"
import type { LLMError } from "../llm/errors"
import type { JsonSchema } from "../llm/schema"
import type { Tool, ToolProvider } from "../tool"

export type McpTool = {
  name: string
  description?: string
  inputSchema: JsonSchema
}

export type McpClient = {
  listTools(): Effect.Effect<McpTool[], LLMError>
  callTool(name: string, input: unknown): Effect.Effect<unknown, LLMError>
}

export type McpServer = {
  name: string
  client: McpClient
}

export function provider(servers: McpServer[]): ToolProvider {
  const names = new Map<string, { server: string; tool: string }>()
  return {
    name: "mcp",
    catalog: () =>
      Effect.forEach(servers, (server) =>
        server.client.listTools().pipe(
          Effect.map((tools) =>
            tools.map((tool) => {
              const name = toolName(server.name, tool.name)
              names.set(name, { server: server.name, tool: tool.name })
              return {
                name,
                description: tool.description ?? `MCP tool ${tool.name} from ${server.name}`,
                source: "mcp" as const,
              }
            }),
          ),
        ),
      ).pipe(Effect.map((items) => items.flat())),
    resolve: (name) =>
      Effect.gen(function* () {
        const parsed = names.get(name)
        if (!parsed) return undefined
        const server = servers.find((server) => server.name === parsed.server)
        if (!server) return undefined
        const tools = yield* server.client.listTools()
        const found = tools.find((tool) => tool.name === parsed.tool)
        if (!found) return undefined
        return {
          name,
          description: found.description ?? `MCP tool ${parsed.tool} from ${parsed.server}`,
          parameters: found.inputSchema,
          execute: (input) =>
            server.client.callTool(parsed.tool, input).pipe(
              Effect.map((value) => ({
                type: "success" as const,
                value,
              })),
            ),
        } satisfies Tool
      }),
  }
}

function toolName(server: string, tool: string) {
  return `mcp_${sanitize(server)}_${sanitize(tool)}`
}

function sanitize(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_")
}
