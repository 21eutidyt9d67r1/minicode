# minicode

Minimal Effect-first coding agent for learning LLM agent architecture.

It currently supports DeepSeek chat completions, a small terminal TUI, progressive tool disclosure, builtin filesystem tools, and adapter shapes for MCP and skills.

## Run

Install dependencies:

```bash
bun install
```

Start the TUI:

```bash
DEEPSEEK_API_KEY=your_key_here bun run index.ts
```

The default model is `deepseek-v4-flash`. Override it with:

```bash
DEEPSEEK_API_KEY=your_key_here MINICODE_MODEL=deepseek-v4-flash bun run index.ts
```

Inside the TUI:

```text
/help   show help
/exit   quit
```

## Verify

Typecheck:

```bash
bunx tsc --noEmit
```

Smoke test a direct model call:

```bash
DEEPSEEK_API_KEY=your_key_here bun -e 'import { Effect } from "effect"; import { LLM } from "./src"; const result = await Effect.runPromise(LLM.LLMClient.generate({ model: "deepseek-v4-flash", messages: [{ role: "user", content: [{ type: "text", text: "Reply with exactly: pong" }] }] })); console.log(result.text.trim())'
```

Expected output:

```text
pong
```

## Architecture

```text
src/
  llm/      DeepSeek LLM protocol, route, HTTP transport, SSE parsing
  agent/    model/tool loop
  tool/     tool abstraction, builtin tools, progressive disclosure
  mcp/      MCP-to-tool provider adapter shape
  skill/    skill registry/provider shape
  tui/      minimal terminal UI
```

The call path is:

```text
TUI input
-> Agent.run
-> Disclosure.view
-> LLMClient.generate
-> DeepSeek route/protocol/transport
-> tool-call events
-> Tool execution
-> tool result message
-> next model turn
```

## Tools

Builtin tools:

- `get_time` - current local time and timezone.
- `read_file` - read a text file under the current workspace.
- `list_files` - list entries under a workspace directory.
- `write_file` - write a UTF-8 text file under the current workspace.

Tools are progressively disclosed. The model initially sees discovery tools, then asks to reveal concrete tools before calling them.

## Environment

- `DEEPSEEK_API_KEY` - required.
- `MINICODE_MODEL` - optional model override, defaults to `deepseek-v4-flash`.
