import { GuardError, VendorError, recordCost, type Guards } from "./core.js";
import { callClaude, callGpt, callWorkersAi } from "./vendors.js";
export type CopyKind = "post" | "mail" | "script";
export type VendorName = "dry-run" | "claude" | "gpt" | "workers-ai";
export interface WriteCaps { maxCalls?: number; maxChars?: number }
export interface WriteUsage { inputTokens?: number; outputTokens?: number }
export interface WriteResult { dryRun: boolean; vendor: VendorName; kind: CopyKind; text: string; chars: number; usage?: WriteUsage }
export interface WriteOptions {
  vendor?: Exclude<VendorName, "dry-run"> | "auto"; dryRun?: boolean; caps?: WriteCaps;
  fetchFn?: typeof fetch; timeoutMs?: number; env?: Record<string, string | undefined>; guards?: Guards;
}
const counts = new Map<VendorName, { calls: number; chars: number }>();
export function resetWriteCaps(): void { counts.clear(); }
const environment = (o: WriteOptions) => o.env ?? (typeof process === "undefined" ? {} : process.env);
export function resolveVendor(o: WriteOptions = {}): VendorName {
  if (o.vendor && o.vendor !== "auto") return o.vendor;
  const e = environment(o);
  return e.ANTHROPIC_API_KEY ? "claude" : e.OPENAI_API_KEY ? "gpt" : e.CLOUDFLARE_API_TOKEN && e.CLOUDFLARE_ACCOUNT_ID && e.AI_GATEWAY_ID ? "workers-ai" : "dry-run";
}
function validate(kind: CopyKind, brief: string): void {
  if (!["post", "mail", "script"].includes(kind)) { const error = new Error("kind must be post, mail, or script"); error.name = "UsageError"; throw error; }
  if (typeof brief !== "string" || !brief.trim()) throw new Error("brief must be a non-empty string");
}
export function dryRunCopy(kind: CopyKind, brief: string): string {
  validate(kind, brief);
  const words = brief.trim().replace(/\s+/g, " ").slice(0, 180);
  if (kind === "post") return `Discover ${words}. Take a closer look today.`;
  if (kind === "mail") return `Subject: ${words}\n\nHello,\nHere is a quick update about ${words}.\nReply to learn more.\nThank you.`;
  return `Hook: Let's talk about ${words}.\nBody: Here is what matters about ${words}.\nClose: Take the next step today.`;
}
const systems: Record<CopyKind, string> = {
  post: "Write one short social caption line based on the brief. Return only the caption.",
  mail: "Write a subject line and a short mail body based on the brief. Start with Subject: and separate the body with a blank line.",
  script: "Write a short spoken script based on the brief. Return lines tagged Hook:, Body:, and Close:.",
};
export async function writeCopy(kind: CopyKind, brief: string, o: WriteOptions = {}): Promise<WriteResult> {
  validate(kind, brief);
  o.guards?.checkDispatch(brief);
  if (o.dryRun !== false) { const text = dryRunCopy(kind, brief); return { dryRun: true, vendor: "dry-run", kind, text, chars: text.length }; }
  const vendor = resolveVendor(o), e = environment(o);
  const required = vendor === "claude" ? ["ANTHROPIC_API_KEY"] : vendor === "gpt" ? ["OPENAI_API_KEY"] : ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "AI_GATEWAY_ID"];
  if (vendor === "dry-run") throw new VendorError("Missing ANTHROPIC_API_KEY, OPENAI_API_KEY, or CLOUDFLARE_API_TOKEN plus CLOUDFLARE_ACCOUNT_ID plus AI_GATEWAY_ID");
  const missing = required.filter(key => !e[key]);
  if (missing.length) throw new VendorError(`Missing ${missing.join(", ")}`);
  const count = counts.get(vendor) ?? { calls: 0, chars: 0 };
  const maxCalls = o.caps?.maxCalls ?? 10, maxChars = o.caps?.maxChars ?? 20000;
  // Reserve input characters before fetch. Output size cannot be known in advance.
  if (count.calls + 1 > maxCalls || count.chars + brief.length > maxChars) throw new GuardError("Write caps exceeded");
  count.calls++; count.chars += brief.length; counts.set(vendor, count);
  const gateway = e.CLOUDFLARE_ACCOUNT_ID && e.AI_GATEWAY_ID;
  const base = vendor === "workers-ai" ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(e.CLOUDFLARE_ACCOUNT_ID!)}/ai/v1` : gateway ? `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(e.CLOUDFLARE_ACCOUNT_ID!)}/${encodeURIComponent(e.AI_GATEWAY_ID!)}/${vendor === "claude" ? "anthropic" : "openai"}` : vendor === "claude" ? "https://api.anthropic.com" : "https://api.openai.com/v1";
  const extraHeaders: Record<string, string> = vendor === "workers-ai" ? { "cf-aig-gateway-id": e.AI_GATEWAY_ID! } : gateway && e.CLOUDFLARE_API_TOKEN ? { "cf-aig-authorization": `Bearer ${e.CLOUDFLARE_API_TOKEN}` } : {};
  const call = vendor === "claude" ? callClaude : vendor === "gpt" ? callGpt : callWorkersAi;
  const result = await call({ brief, system: systems[kind], apiKey: e[required[0]]!, base, extraHeaders, fetchFn: o.fetchFn, timeoutMs: o.timeoutMs });
  if (count.chars + result.text.length - brief.length > maxChars) throw new GuardError("Write character cap exceeded by vendor output");
  count.chars += result.text.length - brief.length;
  o.guards?.recordDispatch(); recordCost({ kind: "write", adapter: vendor, units: result.text.length });
  return { dryRun: false, vendor, kind, ...result, chars: result.text.length };
}
