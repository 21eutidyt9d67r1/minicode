import { Effect } from "effect"
import { join } from "node:path"
import { TransportError, type LLMError } from "../llm/errors"

export type WorkspaceFacts = {
  directory: string
  isGitRepo: boolean
  gitBranch?: string
  platform: string
  date: string
  agents?: string
}

export const gatherWorkspace = Effect.fn("Context.gatherWorkspace")(function* (root: string = process.cwd()) {
  const git = yield* gitInfo(root)
  const agents = yield* readAgents(root)
  return {
    directory: root,
    isGitRepo: git.isGitRepo,
    gitBranch: git.branch,
    platform: process.platform,
    date: new Date().toDateString(),
    agents,
  } satisfies WorkspaceFacts
})

function gitInfo(root: string): Effect.Effect<{ isGitRepo: boolean; branch?: string }, LLMError> {
  return Effect.tryPromise({
    try: async () => {
      const inside = await Bun.$`git rev-parse --is-inside-work-tree`.cwd(root).nothrow().quiet()
      if (inside.exitCode !== 0 || inside.stdout.toString().trim() !== "true") return { isGitRepo: false }
      const head = await Bun.$`git rev-parse --abbrev-ref HEAD`.cwd(root).nothrow().quiet()
      const branch = head.exitCode === 0 ? head.stdout.toString().trim() : undefined
      return { isGitRepo: true, branch: branch || undefined }
    },
    catch: (error) => new TransportError("Failed to read git info", error),
  })
}

function readAgents(root: string): Effect.Effect<string | undefined, LLMError> {
  return Effect.tryPromise({
    try: async () => {
      const file = Bun.file(join(root, "AGENTS.md"))
      if (!(await file.exists())) return undefined
      const text = (await file.text()).trim()
      return text || undefined
    },
    catch: (error) => new TransportError("Failed to read AGENTS.md", error),
  })
}

export function renderEnv(facts: WorkspaceFacts): string {
  return [
    "Here is some useful information about the environment you are running in:",
    "<env>",
    `  Working directory: ${facts.directory}`,
    `  Is directory a git repo: ${facts.isGitRepo ? "yes" : "no"}`,
    ...(facts.gitBranch ? [`  Git branch: ${facts.gitBranch}`] : []),
    `  Platform: ${facts.platform}`,
    `  Today's date: ${facts.date}`,
    "</env>",
  ].join("\n")
}

export function renderInstructions(facts: WorkspaceFacts): string | undefined {
  if (!facts.agents) return undefined
  return `Instructions from: AGENTS.md\n${facts.agents}`
}
