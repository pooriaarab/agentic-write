---
name: agentic-write
description: Route copy jobs to Claude, GPT, or Workers AI. Keywords: copywriting, llm-router, captions, agentic-suite, claude-code, codex, cli, mcp.
---

# agentic-write

Route copy jobs to Claude, GPT, or Workers AI.

## Use the SDK

```js
import { summarizeText, dispatchText } from "agentic-write";

summarizeText("some text");
await dispatchText("some text", { dryRun: true });
```

## Use the CLI

```sh
agentic-write summary --text "some text"
agentic-write dispatch --text "some text" --dry-run
```

## Use the MCP server

Start the server with `agentic-write mcp`. Call `summarize_text`
for stats, `dispatch_text` for routes, `get_cost_report` for costs.

## Rules

- Preview each route with dry run first.
- Report guard denials and adapter errors as failures.
- Read the cost report at the end.

## Draft copy

SDK: `await writeCopy("post", "autumn boots")` from `agentic-write`.

CLI: `agentic-write write --kind mail --brief "autumn boots"`.

MCP: call `write_copy` with `{ "kind": "script", "brief": "autumn boots", "dryRun": true }`.
