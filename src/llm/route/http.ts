import { Effect, Stream } from "effect"
import type { LLMError } from "../errors"
import { fetchExecutor, type Executor } from "./executor"
import * as Sse from "./sse"
import type { PreparedRequest, Transport, TransportPrepareInput } from "./transport"

export function sseJson<Body>(executor: Executor = fetchExecutor): Transport<Body, PreparedRequest, string> {
  return {
    id: "http-sse-json",
    prepare: (input) => Effect.succeed(prepareRequest(input)),
    frames: (prepared) => Stream.unwrap(executor.execute(prepared).pipe(Effect.map(Sse.frames))),
  }
}

function prepareRequest<Body>(input: TransportPrepareInput<Body>): PreparedRequest {
  return {
    url: input.endpoint.toString(),
    init: {
      method: "POST",
      headers: input.headers,
      body: input.bodyText,
    },
  }
}

export function decodeJsonFrame(frame: string): Effect.Effect<unknown, LLMError> {
  return Sse.decodeJson(frame)
}
