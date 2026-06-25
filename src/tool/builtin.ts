import { Effect } from "effect"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { TransportError } from "../llm/errors"
import { staticProvider, type Tool, type ToolProvider } from "."

const MAX_FILE_BYTES = 256 * 1024
const MAX_WRITE_BYTES = 256 * 1024

export function provider(root = process.cwd()): ToolProvider {
  return staticProvider("builtin", "builtin", [getTimeTool, readFileTool(root), listFilesTool(root), writeFileTool(root)])
}

const getTimeTool: Tool = {
  name: "get_time",
  description: "Get the current local time and timezone.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  execute: () =>
    Effect.succeed({
      type: "success",
      value: {
        iso: new Date().toISOString(),
        local: new Date().toString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    }),
}

function readFileTool(root: string): Tool {
  return {
    name: "read_file",
    description: "Read a text file under the current workspace. Use relative paths where possible.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to read, relative to the workspace root or absolute within it" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: (input) =>
      Effect.gen(function* () {
        const path = requireString(input, "path")
        const file = Bun.file(resolveWorkspacePath(root, path))
        const exists = yield* Effect.tryPromise({
          try: () => file.exists(),
          catch: (error) => new TransportError("Failed to check file", error),
        })
        if (!exists) return { type: "error" as const, message: `File not found: ${path}` }
        if (file.size > MAX_FILE_BYTES) {
          return { type: "error" as const, message: `File too large: ${path} (${file.size} bytes)` }
        }
        const text = yield* Effect.tryPromise({
          try: () => file.text(),
          catch: (error) => new TransportError("Failed to read file", error),
        })
        return {
          type: "success" as const,
          value: {
            path,
            content: text,
          },
        }
      }),
  }
}

function listFilesTool(root: string): Tool {
  return {
    name: "list_files",
    description: "List files and directories directly under a workspace directory.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path relative to the workspace root", default: "." },
      },
      additionalProperties: false,
    },
    execute: (input) =>
      Effect.gen(function* () {
        const path = optionalString(input, "path") ?? "."
        const dir = resolveWorkspacePath(root, path)
        const entries = yield* Effect.tryPromise({
          try: async () => {
            const items = await Promise.all(
              (await readdir(dir, { withFileTypes: true })).map(async (entry) => ({
                name: entry.name,
                type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
              })),
            )
            return items.toSorted((a, b) => a.name.localeCompare(b.name))
          },
          catch: (error) => new TransportError("Failed to list directory", error),
        })
        return {
          type: "success" as const,
          value: {
            path,
            entries,
          },
        }
      }),
  }
}

function writeFileTool(root: string): Tool {
  return {
    name: "write_file",
    description: "Write a UTF-8 text file under the current workspace, creating parent directories if needed.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to write, relative to the workspace root or absolute within it" },
        content: { type: "string", description: "Complete file content to write" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    execute: (input) =>
      Effect.gen(function* () {
        const filePath = requireString(input, "path")
        const content = requireString(input, "content")
        if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
          return { type: "error" as const, message: `Content too large: ${Buffer.byteLength(content, "utf8")} bytes` }
        }

        const resolved = resolveWorkspacePath(root, filePath)
        yield* Effect.tryPromise({
          try: async () => {
            await mkdir(path.dirname(resolved), { recursive: true })
            await writeFile(resolved, content, "utf8")
          },
          catch: (error) => new TransportError("Failed to write file", error),
        })
        return {
          type: "success" as const,
          value: {
            path: filePath,
            bytes: Buffer.byteLength(content, "utf8"),
          },
        }
      }),
  }
}

function requireString(input: unknown, key: string) {
  const value = optionalString(input, key)
  if (value === undefined) throw new Error(`Expected string field: ${key}`)
  return value
}

function optionalString(input: unknown, key: string) {
  if (typeof input !== "object" || input === null || !(key in input)) return undefined
  const value = input[key as keyof typeof input]
  return typeof value === "string" ? value : undefined
}

function resolveWorkspacePath(root: string, input: string) {
  const normalizedRoot = new URL(`file://${root.endsWith("/") ? root : root + "/"}`)
  const resolved = new URL(input, normalizedRoot)
  if (!resolved.pathname.startsWith(normalizedRoot.pathname)) throw new Error(`Path escapes workspace: ${input}`)
  return decodeURIComponent(resolved.pathname)
}
