#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  dispatchText,
  getCostReport,
  GuardError,
  LocalRouterAdapter,
  summarizeText,
  VendorError,
  type RouterAdapter,
} from "./core.js";
import { DEFAULT_BRAND } from "./index.js";
import { VERSION } from "./version.js";

import { writeCopy, type CopyKind, type WriteOptions } from "./write.js";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type CliCommand = "write" | "summary" | "dispatch" | "costs" | "mcp" | "help" | "version";

export interface CliRequest {
  command: CliCommand;
  text?: string;
  file?: string;
  dryRun: boolean;
  topN?: number;
  kind?: CopyKind;
  brief?: string;
  briefFile?: string;
  vendor?: WriteOptions["vendor"];
}

export function parseArgs(argv: string[]): CliRequest {
  const request: CliRequest = { command: "help", dryRun: false };
  const args = [...argv];
  const first = args.shift();
  if (first === undefined || first === "help" || first === "--help" || first === "-h") {
    return request;
  }
  if (first === "version" || first === "--version" || first === "-V") {
    request.command = "version";
    return request;
  }
  if (first !== "write" && first !== "summary" && first !== "dispatch" && first !== "costs" && first !== "mcp") {
    throw new UsageError(`unknown command "${first}"`);
  }
  request.command = first;
  if (first === "write") {
    request.dryRun = true;
    request.vendor = "auto";
    while (args.length) {
      const flag = args.shift();
      if (flag === "--live") { request.dryRun = false; continue; }
      if (!["--kind", "--brief", "--brief-file", "--vendor"].includes(flag ?? "") || !args.length) throw new UsageError(`unknown or incomplete flag "${flag}"`);
      const value = args.shift()!;
      if (flag === "--kind") {
        if (!["post", "mail", "script"].includes(value)) throw new UsageError("kind must be post, mail, or script");
        request.kind = value as CopyKind;
      }
      if (flag === "--brief") request.brief = value;
      if (flag === "--brief-file") request.briefFile = value;
      if (flag === "--vendor") {
        if (!["auto", "claude", "gpt", "workers-ai"].includes(value)) throw new UsageError("invalid vendor");
        request.vendor = value as WriteOptions["vendor"];
      }
    }
    if (!request.kind || (request.brief === undefined && request.briefFile === undefined)) throw new UsageError("write needs --kind and --brief or --brief-file");
    if (request.brief !== undefined && request.briefFile !== undefined) throw new UsageError("choose --brief or --brief-file");
    if (request.brief !== undefined && !request.brief.trim()) throw new UsageError("brief must be non-empty");
    return request;
  }
  while (args.length > 0) {
    const flag = args.shift() as string;
    if (flag === "--dry-run" && request.command === "dispatch") {
      request.dryRun = true;
      continue;
    }
    if ((flag === "--text" || flag === "--file" || flag === "--top") && args.length > 0) {
      const value = args.shift() as string;
      if (flag === "--text") request.text = value;
      if (flag === "--file") request.file = value;
      if (flag === "--top") {
        const topN = Number.parseInt(value, 10);
        if (!Number.isInteger(topN) || topN < 0) {
          throw new UsageError(`--top needs an integer of 0 or more, got "${value}"`);
        }
        request.topN = topN;
      }
      continue;
    }
    throw new UsageError(`unknown flag "${flag}" for "${request.command}"`);
  }
  if (
    (request.command === "summary" || request.command === "dispatch") &&
    request.text === undefined &&
    request.file === undefined
  ) {
    throw new UsageError(`${request.command} needs --text or --file`);
  }
  return request;
}

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  readFile(path: string): string;
  router: RouterAdapter;
  writeOptions?: WriteOptions;
}

function defaultIo(): CliIo {
  return {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    readFile: (path) => readFileSync(path, "utf8"),
    router: new LocalRouterAdapter(),
  };
}

function helpText(): string {
  const command = DEFAULT_BRAND.command;
  return [
    `${DEFAULT_BRAND.name} ${VERSION}`,
    `${DEFAULT_BRAND.description}`,
    "",
    `Usage: ${command} <command> [flags]`,
    "",
    "Commands:",
    "  write --kind post|mail|script --brief <t> [--brief-file <p>] [--vendor auto|claude|gpt|workers-ai] [--live]",
    "  summary --text <t> [--file <p>] [--top <n>]  Print text stats as JSON.",
    "  dispatch --text <t> [--file <p>] [--dry-run] Route one text, print the receipt.",
    "  costs                                      Print the cost report as JSON.",
    "  mcp                                        Start the MCP server on stdio.",
    "",
    "Env: ANTHROPIC_API_KEY, OPENAI_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, AI_GATEWAY_ID",
    "",
    "Flags:",
    "  --help, -h       Print this help.",
    "  --version, -V    Print the version.",
  ].join("\n");
}

function readInput(request: CliRequest, io: CliIo): string {
  if (request.file !== undefined) {
    return io.readFile(request.file);
  }
  return request.text ?? "";
}

export async function runCli(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  let request: CliRequest;
  try {
    request = parseArgs(argv);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    io.err(`Run "${DEFAULT_BRAND.command} --help" for usage.`);
    return 2;
  }
  try {
    switch (request.command) {
      case "help":
        io.out(helpText());
        return 0;
      case "version":
        io.out(VERSION);
        return 0;
      case "write": {
        const brief = request.briefFile ? io.readFile(request.briefFile) : request.brief!;
        if (!brief.trim()) throw new UsageError("brief must be non-empty");
        io.out(JSON.stringify(await writeCopy(request.kind!, brief, { ...io.writeOptions, vendor: request.vendor, dryRun: request.dryRun })));
        return 0;
      }
      case "summary": {
        const summary = summarizeText(readInput(request, io), { topN: request.topN });
        io.out(JSON.stringify(summary));
        return 0;
      }
      case "dispatch": {
        const result = await dispatchText(readInput(request, io), {
          adapter: io.router,
          dryRun: request.dryRun,
        });
        io.out(JSON.stringify(result));
        return 0;
      }
      case "costs":
        io.out(JSON.stringify(getCostReport()));
        return 0;
      case "mcp": {
        const { startMcp } = await import("./mcp.js");
        await startMcp();
        return 0;
      }
    }
  } catch (error) {
    if (error instanceof GuardError || error instanceof VendorError || error instanceof UsageError) {
      io.err(`${error.name}: ${error.message}`);
      return 1;
    }
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      io.err(`file not found: ${request.file ?? ""}`);
      return 1;
    }
    throw error;
  }
}

function isMainModule(): boolean {
  const invoked = process.argv[1];
  if (typeof invoked !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(invoked)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      // Exit nonzero at once. On zero, fall off the end so a running
      // server (mcp) keeps its stdio handles open. Plain commands
      // hold no handles and exit 0 on their own.
      if (code !== 0) process.exit(code);
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
