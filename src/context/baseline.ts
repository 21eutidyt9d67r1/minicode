import type { ContextSource, SourceId } from "./source"

export type BaselineBlock = { source: SourceId; text: string }

export type Baseline = {
  epoch: number
  blocks: BaselineBlock[]
  header: string
  rest: string
  systemText: string
}

export function buildBaseline(sources: ContextSource[]): Baseline {
  const blocks: BaselineBlock[] = []
  for (const source of sources) {
    const text = source.build()
    if (text !== undefined && text !== "") blocks.push({ source: source.id, text })
  }

  const header = blocks[0]?.text ?? ""
  const rest = blocks
    .slice(1)
    .map((block) => block.text)
    .join("\n\n")
  const systemText = [header, rest].filter((part) => part !== "").join("\n\n")

  return { epoch: epochOf(systemText), blocks, header, rest, systemText }
}

export function epochOf(systemText: string): number {
  return Number(BigInt(Bun.hash(systemText)) & 0xffffffffn)
}
