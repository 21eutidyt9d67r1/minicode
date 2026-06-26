import type { ContentPart, Message } from "../schema"

export type CacheProvider = "deepseek"

export function applyCaching(messages: Message[], _provider: CacheProvider): Message[] {
  const selected = new Set<Message>()
  const system = messages.filter((message) => message.role === "system").slice(0, 2)
  const tail = messages.filter((message) => message.role !== "system").slice(-2)
  for (const message of system) selected.add(message)
  for (const message of tail) selected.add(message)

  return messages.map((message) => (selected.has(message) ? mark(message) : message))
}

function mark(message: Message): Message {
  const content = message.content
  if (content.length === 0) return message
  const lastIndex = content.length - 1
  const marked = content.map((part, index) =>
    index === lastIndex ? ({ ...part, cacheControl: "ephemeral" } as ContentPart) : part,
  )
  return { ...message, content: marked } as Message
}
