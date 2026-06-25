import { Effect, Stream } from "effect"
import { route as deepseekRoute } from "./deepseek"
import type { LLMError } from "./errors"
import type { LLMEvent, LLMRequest } from "./schema"

export type LLMResponse = {
  text: string
  events: LLMEvent[]
}

export function stream(request: LLMRequest): Stream.Stream<LLMEvent, LLMError> {
  return deepseekRoute.stream(request)
}

export const generate = Effect.fn("LLMClient.generate")(function* (request: LLMRequest) {
  return yield* stream(request).pipe(
    Stream.runFold((): LLMResponse => ({ text: "", events: [] }), (response, event) => {
      response.events.push(event)
      if (event.type === "text-delta") response.text += event.text
      return response
    }),
  )
})
