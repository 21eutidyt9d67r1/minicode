import { Effect, Stream } from "effect"
import { ProtocolError, TransportError, type LLMError } from "../errors"

export function frames(response: Response): Stream.Stream<string, LLMError> {
  if (!response.body) return Stream.fail(new TransportError("Response body is empty"))
  return Stream.fromAsyncIterable(readFrames(response.body), (error) =>
    error instanceof TransportError ? error : new TransportError("Failed to read SSE stream", error),
  )
}

async function* readFrames(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.value) buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      if (chunk.done) buffer += decoder.decode()

      const result = takeFrames(buffer)
      buffer = result.rest
      for (const frame of result.frames) yield frame
      if (chunk.done) return
    }
  } catch (error) {
    throw new TransportError("Failed to read response stream", error)
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function takeFrames(input: string) {
  const normalized = input.replaceAll("\r\n", "\n")
  const blocks = normalized.split("\n\n")
  const rest = blocks.pop() ?? ""
  const frames = blocks.flatMap(readBlock)
  return { frames, rest }
}

function readBlock(block: string) {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n")
    .trim()

  if (!data || data === "[DONE]") return []
  return [data]
}

export function decodeJson(input: string): Effect.Effect<unknown, LLMError> {
  return Effect.try({
    try: () => JSON.parse(input) as unknown,
    catch: () => new ProtocolError(`Invalid SSE JSON frame: ${input}`),
  })
}
