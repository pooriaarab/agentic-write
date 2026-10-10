# Agentic write

Route copy jobs to Claude, GPT, or Workers AI.

One fetch-based router serves the library, CLI, MCP server, and edge worker.
The package uses `agentic-core` and has no LLM SDK dependencies.
Version 0.1.0 requires Node.js 18 or later.

## Three usecases

1. Draft a post caption.
2. Draft a short mail.
3. Draft a spoken script.

## Try the CLI

Build the source before you run these commands.
Dry run is the default, even when keys exist.
It returns deterministic text, sends no request, and records no cost.

```sh
node dist/cli.js write --kind post --brief "autumn boots on sale"
```

Observed output:

```json
{"dryRun":true,"vendor":"dry-run","kind":"post","text":"Discover autumn boots on sale. Take a closer look today.","chars":56}
```

```sh
node dist/cli.js write --kind mail --brief "autumn boots"
node dist/cli.js write --kind script --brief "autumn boots"
```

Observed output:

```json
{"dryRun":true,"vendor":"dry-run","kind":"mail","text":"Subject: autumn boots\n\nHello,\nHere is a quick update about autumn boots.\nReply to learn more.\nThank you.","chars":104}
{"dryRun":true,"vendor":"dry-run","kind":"script","text":"Hook: Let's talk about autumn boots.\nBody: Here is what matters about autumn boots.\nClose: Take the next step today.","chars":116}
```

Use `--brief-file` instead of `--brief` to read a file.
Add `--live` to send a vendor request.
Choose `--vendor auto`, `claude`, `gpt`, or `workers-ai`.
Unknown flags return a usage error.

## Select a vendor

Auto selection checks Claude, GPT, then Workers AI.
An explicit vendor takes priority.
Live requests without required keys fail with `VendorError`.

| Vendor | Required environment variables | Default model |
| --- | --- | --- |
| Claude | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` |
| GPT | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Workers AI | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AI_GATEWAY_ID` | `@cf/meta/llama-3.1-8b-instruct` |

Claude and GPT use direct endpoints by default.
Set `CLOUDFLARE_ACCOUNT_ID` and `AI_GATEWAY_ID` to use Cloudflare AI Gateway.
When present, `CLOUDFLARE_API_TOKEN` supplies gateway authentication.
Workers AI always uses the Cloudflare endpoint with the gateway header.
Requests time out after 30 seconds by default.

## Use the library

Import `writeCopy` from `agentic-write` after installation.
This source checkout example uses the built library:

```js
import { writeCopy } from "./dist/index.js";
console.log(await writeCopy("post", "autumn boots"));
```

Pass `dryRun: false` for live requests.
Options accept `vendor`, `env`, `fetchFn`, `timeoutMs`, `caps`, and core `guards`.
The library exports the shared core API and `DEFAULT_BRAND`.

Caps span calls per vendor within one process.
Defaults allow 10 calls and 20,000 characters.
The router reserves brief characters before fetch and accumulates returned text characters after success.
A request that exceeds the known budget fails before fetch.
An oversized vendor response fails after fetch without recording a successful write.
Failed requests consume their reservation. Dry runs consume none.
Use `resetWriteCaps()` to clear counters.
Optional guards check the brief first and record successful live calls.
Costs record returned characters as units, not currency.

## Use MCP

Start the stdio server:

```sh
node dist/cli.js mcp
```

The installed server bin is `agentic-write-mcp`.
The server advertises `io.github.pooriaarab/agentic-write` in its registry metadata.

| Tool | Input | Result |
| --- | --- | --- |
| `write_copy` | `kind`, `brief`, optional `vendor`, optional `dryRun` | Copy draft and usage |
| `summarize_text` | `text` | Text statistics |
| `dispatch_text` | `text`, optional `dryRun` | Route receipt |
| `get_cost_report` | None | Session totals |

`write_copy` defaults to dry run.
Guard and vendor failures return MCP error results.

## Use the worker

The worker requires no vendor keys and always drafts offline.

| Route | Input | Result |
| --- | --- | --- |
| `GET /health` | None | Pack name and version |
| `POST /summarize` | JSON with `text` | Text statistics |
| `POST /write` | JSON with `kind` and `brief` | Dry-run copy |

Invalid bodies return 400. Unknown routes return 404.

## Read statistics and costs

```sh
node dist/cli.js summary --text "hello world hello"
node dist/cli.js costs
node dist/cli.js --version
```

Observed output:

```text
{"chars":17,"words":3,"lines":1,"topWords":[{"word":"hello","count":2},{"word":"world","count":1}]}
{"entries":[],"dispatches":0,"units":0}
0.1.0
```

Costs stay in memory. Each new CLI process starts with empty totals.
The CLI also keeps the scaffold `dispatch`, `help`, and `version` commands.

## Check the package

```sh
npm run build
npm run typecheck
npm test
npm pack --pack-destination /tmp/aw
npx -y file:/tmp/aw/agentic-write-0.1.0.tgz write --kind post --brief "autumn boots on sale"
```

The installed command returns the same post JSON shown above.
Tests use stubbed fetch functions and never call a live vendor.

## Sources

[LiteLLM](https://github.com/BerriAI/litellm) informs the unified router shape and per-call vendor selection.
This package implements original fetch-based adapters.

Endpoint references, checked on 2026-10-10:

- [Cloudflare Anthropic provider](https://developers.cloudflare.com/ai-gateway/usage/providers/anthropic/)
- [Cloudflare OpenAI provider](https://developers.cloudflare.com/ai-gateway/usage/providers/openai/)
- [Cloudflare Workers AI provider](https://developers.cloudflare.com/ai-gateway/usage/providers/workersai/)

## License

MIT. See `LICENSE`.
