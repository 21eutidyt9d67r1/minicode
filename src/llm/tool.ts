export type ToolAccumulator = {
  id: string
  name: string
  inputText: string
}

export type ToolCallParserState = {
  tools: Record<number, ToolAccumulator>
}