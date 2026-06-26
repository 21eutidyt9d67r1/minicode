import { Effect, Stream } from "effect"
import * as LLMClient from "../llm/client"
import type { LLMError } from "../llm/errors"
import type { Message } from "../llm/schema"
import { text } from "../llm/schema"
import type { Usage } from "../agent/settlement"
import { settleStream } from "../agent/settlement"

const CONTEXT_WINDOWS: Record<string, number> = {
  "deepseek-v4-flash": 128_000,
}

const DEFAULT_CONTEXT_WINDOW = 128_000
const RESERVED = 8_000
const TAIL_TURNS = 2
const SUMMARY_MAX_TOKENS = 4096

export function contextWindow(model: string): number {
  return CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW
}

export function isOverflow(usage: Usage | undefined, model: string): boolean {
  if (!usage) return false
  return usage.total >= contextWindow(model) - RESERVED
}

const SUMMARY_SYSTEM = [
  "You are an anchored context summarization assistant for coding sessions.",
  "Summarize only the conversation history you are given. The newest turns may be kept verbatim outside your summary, so focus on the older context that still matters for continuing the work.",
  "Always follow the exact output structure requested by the user prompt. Keep every section, preserve exact file paths and identifiers when known, and prefer terse bullets over paragraphs.",
  "Do not answer the conversation itself. Do not mention that you are summarizing, compacting, or merging context.",
].join("\n\n")

const SUMMARY_TEMPLATE = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
- [completed and in-progress work, or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Files
- [file path: why it matters, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.`

export type CompactionResult = {
  turns: Message[]
  summarized: number
  kept: number
}

// A "turn" starts at a user message and runs until the next user message.
function turnStarts(turns: Message[]): number[] {
  const starts: number[] = []
  for (let i = 0; i < turns.length; i++) {
    if (turns[i]!.role === "user") starts.push(i)
  }
  return starts
}

export function isSummary(message: Message): boolean {
  return message.role === "user" && message.content.some((part) => part.type === "text" && part.summary === true)
}

export const compact = Effect.fn("Compaction.compact")(function* (input: { turns: Message[]; model: string }) {
  const starts = turnStarts(input.turns)
  // Keep the last TAIL_TURNS user-turns verbatim; summarize everything before.
  if (starts.length <= TAIL_TURNS) {
    return { turns: input.turns, summarized: 0, kept: input.turns.length } satisfies CompactionResult
  }
  const splitAt = starts[starts.length - TAIL_TURNS]!
  const head = input.turns.slice(0, splitAt)
  const tail = input.turns.slice(splitAt)
  if (head.length === 0) return { turns: input.turns, summarized: 0, kept: input.turns.length }
  // Idempotence: if the head is nothing but an already-produced summary, there is no new
  // history to compact — skip (mirrors opencode excluding completed compactions).
  if (head.every(isSummary)) return { turns: input.turns, summarized: 0, kept: input.turns.length }

  const summaryText = yield* summarize(head, input.model)
  if (!summaryText) return { turns: input.turns, summarized: 0, kept: input.turns.length }

  const summaryMessage = makeSummaryMessage(summaryText)
  return {
    turns: [summaryMessage, ...tail],
    summarized: head.length,
    kept: tail.length,
  } satisfies CompactionResult
})

function makeSummaryMessage(summary: string): Message {
  return {
    role: "user",
    content: [{ type: "text", text: `<conversation-summary>\n${summary}\n</conversation-summary>`, summary: true }],
  }
}

function summarize(head: Message[], model: string): Effect.Effect<string, LLMError> {
  const prompt = [
    "Create an anchored summary from the conversation history below.",
    SUMMARY_TEMPLATE,
    "<conversation-history>",
    serializeMessages(head),
    "</conversation-history>",
  ].join("\n\n")

  const messages: Message[] = [
    { role: "system", content: [text(SUMMARY_SYSTEM)] },
    { role: "user", content: [text(prompt)] },
  ]

  return settleStream(LLMClient.stream({ model, messages, maxTokens: SUMMARY_MAX_TOKENS }), 0).pipe(
    Effect.map((settlement) => settlement.text.trim()),
  )
}

function serializeMessages(messages: Message[]): string {
  return messages
    .map((message) => {
      const body = message.content
        .map((part) => {
          if (part.type === "text") return part.text
          if (part.type === "tool-call") return `[tool-call ${part.name} ${JSON.stringify(part.input)}]`
          if (part.type === "tool-result") {
            const value = part.result.type === "success" ? JSON.stringify(part.result.value) : part.result.message
            return `[tool-result ${part.name} ${value}]`
          }
          return ""
        })
        .filter((line) => line !== "")
        .join("\n")
      return `### ${message.role}\n${body}`
    })
    .join("\n\n")
}
