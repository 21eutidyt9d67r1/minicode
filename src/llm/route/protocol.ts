import { Effect } from "effect"
import type { LLMError } from "../errors"
import type { LLMEvent, LLMRequest } from "../schema"

export type Protocol<Body, Frame, ProviderEvent, State> = {
  id: string

  body: {
    from(request: LLMRequest): Effect.Effect<Body, LLMError>
  }

  stream: {
    decode(frame: Frame): Effect.Effect<ProviderEvent, LLMError>

    initial(request: LLMRequest): State

    step(state: State, event: ProviderEvent): Effect.Effect<readonly [State, LLMEvent[]], LLMError>

    onHalt?(state: State): LLMEvent[]
  }
}

export function make<Body, Frame, ProviderEvent, State>(
  input: Protocol<Body, Frame, ProviderEvent, State>,
): Protocol<Body, Frame, ProviderEvent, State> {
  return input
}
