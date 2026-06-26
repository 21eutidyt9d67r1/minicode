import { renderEnv, renderInstructions, type WorkspaceFacts } from "./workspace"

export type SourceId = "base" | "env" | "instructions" | "tools" | "mcp" | "skills"

export type ContextSource = {
  id: SourceId
  build(): string | undefined
}

export type ManifestTool = { name: string; description: string }

export function baseSource(text: string): ContextSource {
  return { id: "base", build: () => text.trim() }
}

export function envSource(facts: WorkspaceFacts): ContextSource {
  return { id: "env", build: () => renderEnv(facts) }
}

export function instructionsSource(facts: WorkspaceFacts): ContextSource {
  return { id: "instructions", build: () => renderInstructions(facts) }
}

export function toolsSource(tools: ManifestTool[]): ContextSource {
  return { id: "tools", build: () => renderManifest(tools) }
}

export function renderManifest(tools: ManifestTool[]): string {
  const sorted = [...tools].toSorted((a, b) => a.name.localeCompare(b.name))
  return ["<tools>", ...sorted.map((tool) => `  ${tool.name}: ${tool.description}`), "</tools>"].join("\n")
}
