import { Effect } from "effect"
import { HttpError, TransportError, type LLMError } from "../errors"
import type { PreparedRequest } from "./transport"

const BODY_LIMIT = 8_192

export type Executor = {
  execute(request: PreparedRequest): Effect.Effect<Response, LLMError>
}

export const fetchExecutor: Executor = {
  execute: (request) =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () => fetch(request.url, request.init),
        catch: (error) => new TransportError("HTTP request failed", error),
      })

      if (response.ok) return response

      const body = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) => new TransportError("Failed to read error response body", error),
      })
      const clipped = body.length > BODY_LIMIT ? body.slice(0, BODY_LIMIT) : body
      return yield* Effect.fail(new HttpError(`HTTP ${response.status}: ${clipped || response.statusText}`, response.status, clipped))
    }),
}
