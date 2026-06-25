import type { Effect, Stream } from "effect"
import type { LLMError } from "../errors"
import type { LLMRequest } from "../schema"

export type PreparedRequest = {
  url: string
  init: RequestInit
}

export type TransportPrepareInput<Body> = {
  request: LLMRequest
  endpoint: URL
  body: Body
  bodyText: string
  headers: Headers
}

export type Transport<Body, Prepared, Frame> = {
  id: string

  prepare(input: TransportPrepareInput<Body>): Effect.Effect<Prepared, LLMError>

  frames(prepared: Prepared): Stream.Stream<Frame, LLMError>
}
