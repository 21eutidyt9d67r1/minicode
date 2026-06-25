import { Effect } from "effect"
import { ConfigError, type LLMError } from "../errors"
import type { LLMRequest } from "../schema"

export type AuthInput = {
  request: LLMRequest
  url: URL
  bodyText: string
  headers: Headers
}

export type Auth = {
  apply(input: AuthInput): Effect.Effect<Headers, LLMError>
}

export const none: Auth = {
  apply: (input) => Effect.succeed(new Headers(input.headers)),
}

export function bearerEnv(name: string): Auth {
  return {
    apply: (input) =>
      Effect.gen(function* () {
        const value = process.env[name]
        if (!value) return yield* Effect.fail(new ConfigError(`${name} is required`))

        const headers = new Headers(input.headers)
        headers.set("authorization", `Bearer ${value}`)
        return headers
      }),
  }
}
