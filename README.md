# agentic-write

[![npm version](https://img.shields.io/npm/v/agentic-write)](https://www.npmjs.com/package/agentic-write)
[![Monthly downloads](https://img.shields.io/npm/dm/agentic-write)](https://www.npmjs.com/package/agentic-write)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/license/mit)

agentic-write is an open-source copywriting wrapper for Node.js applications and AI agents, with Anthropic Claude, OpenAI GPT, and Cloudflare Workers AI adapters.

## Install

```sh
npm install agentic-write
```

Requires Node.js 18 or later. Includes TypeScript declarations and three direct runtime dependencies; no vendor SDK dependency.

## Draft your first caption

```js
import { writeCopy } from "agentic-write";
const result = await writeCopy("post", "autumn boots on sale");
console.log(result.dryRun, result.text);
```

Expect `true` and `Discover autumn boots on sale. Take a closer look today.`
The default returns deterministic template text, without keys, network calls, or usage costs.

## Features and coverage

- Draft three copy kinds: `post`, `mail`, and `script`.
- Select a vendor explicitly, or use automatic credential-based selection.
- Route Anthropic and OpenAI requests through Cloudflare AI Gateway when configured.
- Return text, character count, and token usage when the vendor provides it.

| Vendor | Status | Required environment variables | Default model in source |
| --- | --- | --- | --- |
| Anthropic Claude | Implemented: Messages API | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` |
| OpenAI GPT | Implemented: Chat Completions API | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Cloudflare Workers AI | Implemented: compatible chat endpoint | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AI_GATEWAY_ID` | `@cf/meta/llama-3.1-8b-instruct` |

Three live provider paths have mocked tests; this rewrite includes no live credential checks.
Export keys in your shell, or pass an `env` map through SDK options. The package does not load `.env` files.
Pass `dryRun: false` to call a vendor. Automatic selection checks Claude, GPT, then Workers AI.
Set `CLOUDFLARE_ACCOUNT_ID` and `AI_GATEWAY_ID` to route Claude or GPT through AI Gateway.
`CLOUDFLARE_API_TOKEN`, when present, supplies gateway authentication.

## Runtime surfaces

```sh
npx agentic-write write --kind post --brief "autumn boots on sale"
npx agentic-write summary --text "hello world hello"
npx agentic-write dispatch --text "hello" --dry-run
npx agentic-write costs
npx agentic-write mcp
```

The CLI has five operational commands, plus `help` and `version` and their flag aliases.
`write` accepts `--brief-file` instead of `--brief`, `--vendor auto|claude|gpt|workers-ai`, and `--live`.
The Model Context Protocol (MCP) server exposes four tools: `write_copy`, `summarize_text`, `dispatch_text`, and `get_cost_report`.
The `agentic-write-mcp` binary starts the same server. Default dispatch routes use the shared local adapter.
The Worker you deploy has `GET /health`, `POST /summarize`, and `POST /write`; Worker drafts are always offline.

## Behavior limits

Requests default to a 30-second timeout, without automatic retries or provider failover.
Per-vendor caps default to 10 calls and 20,000 characters within one process.
Calls reserve brief characters before fetch, then replace that reservation with returned characters after success.
Failed requests retain their reservation. Oversized output can trigger a guard error after a paid request.
SDK options accept `caps`, `guards`, `timeoutMs`, and `fetchFn`. `resetWriteCaps()` clears counters.
Usage records returned characters as units, not currency. Dry runs consume no caps or usage units.
Cost totals live in memory; a separate CLI process cannot read a previous command's totals.
The package does not publish posts, send email, or provide a managed model service.

## Links and status

[Package](https://www.npmjs.com/package/agentic-write) · [Source and support](https://github.com/pooriaarab/agentic-write)

Version 0.1.0 APIs can change. Public case studies are not yet published.
Run `npm run build`, `npm run typecheck`, and `npm test` before contributing.

## License

MIT.
