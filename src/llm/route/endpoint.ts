import { Effect } from "effect"
import { ConfigError, type LLMError } from "../errors"
import type { LLMRequest } from "../schema"

export type Endpoint<Body> = {
  render(input: { request: LLMRequest; body: Body }): Effect.Effect<URL, LLMError>
}

export function make<Body>(url: string): Endpoint<Body> {
  return {
    render: () =>
      Effect.try({
        try: () => new URL(url),
        catch: () => new ConfigError(`Invalid endpoint URL: ${url}`),
      }),
  }
}
