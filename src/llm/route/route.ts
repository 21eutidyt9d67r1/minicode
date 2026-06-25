import { Effect, Stream } from "effect"
import { ProtocolError, type LLMError } from "../errors"
import type { LLMEvent, LLMRequest } from "../schema"
import type { Auth } from "./auth"
import type { Endpoint } from "./endpoint"
import type { Protocol } from "./protocol"
import type { Transport } from "./transport"

export type RouteInput<Body, Prepared, Frame, ProviderEvent, State> = {
  id: string
  endpoint: Endpoint<Body>
  auth: Auth
  protocol: Protocol<Body, Frame, ProviderEvent, State>
  transport: Transport<Body, Prepared, Frame>
}

export type CompiledRoute<Body, Prepared> = {
  request: LLMRequest
  body: Body
  bodyText: string
  endpoint: URL
  prepared: Prepared
}

export type Route<Body, Prepared, Frame, ProviderEvent, State> = RouteInput<
  Body,
  Prepared,
  Frame,
  ProviderEvent,
  State
> & {
  compile(request: LLMRequest): Effect.Effect<CompiledRoute<Body, Prepared>, LLMError>
  stream(request: LLMRequest): Stream.Stream<LLMEvent, LLMError>
}

function encodeBody(body: unknown): Effect.Effect<string, LLMError> {
  return Effect.gen(function* () {
    const value = yield* Effect.try({
      try: () => JSON.stringify(body),
      catch: () => new ProtocolError("Failed to encode request body as JSON"),
    })
    if (value === undefined) return yield* Effect.fail(new ProtocolError("Request body must be JSON-encodable"))
    return value
  })
}

export function make<Body, Prepared, Frame, ProviderEvent, State>(
  input: RouteInput<Body, Prepared, Frame, ProviderEvent, State>,
): Route<Body, Prepared, Frame, ProviderEvent, State> {
  const compile = Effect.fn("Route.compile")(function* (request: LLMRequest) {
    const body = yield* input.protocol.body.from(request)
    const endpoint = yield* input.endpoint.render({ request, body })
    const bodyText = yield* encodeBody(body)
    const headers = yield* input.auth.apply({
      request,
      url: endpoint,
      bodyText,
      headers: new Headers({
        accept: "text/event-stream",
        "content-type": "application/json",
      }),
    })
    const prepared = yield* input.transport.prepare({ request, endpoint, body, bodyText, headers })
    return { request, body, bodyText, endpoint, prepared }
  })

  const stream = (request: LLMRequest) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const compiled = yield* compile(request)
        let state = input.protocol.stream.initial(compiled.request)
        const events = input.transport.frames(compiled.prepared).pipe(
          Stream.mapEffect((frame) =>
            Effect.gen(function* () {
              const event = yield* input.protocol.stream.decode(frame)
              const next = yield* input.protocol.stream.step(state, event)
              state = next[0]
              return next[1]
            }),
          ),
          Stream.flatMap((items) => Stream.fromIterable(items)),
        )

        if (!input.protocol.stream.onHalt) return events

        return events.pipe(
          Stream.concat(Stream.suspend(() => Stream.fromIterable(input.protocol.stream.onHalt?.(state) ?? []))),
        )
      }),
    )

  return { ...input, compile, stream }
}
