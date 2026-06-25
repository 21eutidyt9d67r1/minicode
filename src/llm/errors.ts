export class ConfigError extends Error {
  readonly _tag = "ConfigError" as const
  override name = "ConfigError"

  constructor(message: string) {
    super(message)
  }
}

export class HttpError extends Error {
  readonly _tag = "HttpError" as const
  override name = "HttpError"

  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message)
  }
}

export class ProtocolError extends Error {
  readonly _tag = "ProtocolError" as const
  override name = "ProtocolError"

  constructor(message: string) {
    super(message)
  }
}

export class TransportError extends Error {
  readonly _tag = "TransportError" as const
  override name = "TransportError"

  constructor(message: string, readonly detail?: unknown) {
    super(message)
  }
}

export type LLMError = ConfigError | HttpError | ProtocolError | TransportError
