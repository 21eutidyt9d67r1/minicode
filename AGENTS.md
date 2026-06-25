# Agent Notes

- This repo is intended as a minimal coding harness agent for learning; keep changes small and easy to inspect.
- The project is inspired by opencode and Claude Code-style agent workflows, but implementations is original and clean-room; NO paste or adapt leaked/proprietary code.
- This is a TypeScript ESM project on the Bun runtime. Prefer Bun-native APIs where they keep the implementation simple, but Node built-ins are fine for stable filesystem primitives.
- The current entrypoint is `index.ts`; run the TUI with `DEEPSEEK_API_KEY=... bun run index.ts`.
- The default model is `deepseek-v4-flash`; override it with `MINICODE_MODEL=...`.
- Typecheck with `bunx tsc --noEmit`.

## Architecture

- `src/llm/` contains the DeepSeek-only LLM runtime: schema, errors, route/transport/SSE, and the OpenAI-compatible DeepSeek chat protocol.
- `src/agent/` contains the agent loop that calls the model, executes tool calls, appends tool results, and continues.
- `src/tool/` contains tool abstractions, builtin tools, and progressive disclosure.
- `src/mcp/` and `src/skill/` are adapter layers that expose MCP servers and skills as `ToolProvider`s.
- `src/tui/` contains the minimal terminal UI.

## Runtime Notes

- Tools are disclosed progressively. The model first sees discovery tools such as `list_tools` and `reveal_tools`; concrete tool schemas are revealed only after request.
- Builtin tools currently include `get_time`, `read_file`, `list_files`, and `write_file`.
- File tools are rooted at the process working directory and reject paths that escape that root.
- Keep `llm/` focused on model transport/protocol concerns. Agent orchestration, tools, MCP, skills, and TUI should stay in their own top-level folders.
