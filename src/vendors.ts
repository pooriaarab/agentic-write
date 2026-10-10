import { VendorError } from "./core.js";
import type { WriteUsage } from "./write.js";
export interface VendorOptions {
  brief: string; system: string; apiKey: string; base: string;
  extraHeaders?: Record<string, string>; fetchFn?: typeof fetch; timeoutMs?: number; model?: string;
}
export interface VendorResult { text: string; usage?: WriteUsage }
async function request(o: VendorOptions, claude: boolean, defaultModel: string): Promise<VendorResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 30000);
  try {
    const response = await (o.fetchFn ?? fetch)(`${o.base.replace(/\/$/, "")}/${claude ? "v1/messages" : "chat/completions"}`, {
      method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", ...(claude ? { "x-api-key": o.apiKey, "anthropic-version": "2023-06-01" } : { authorization: `Bearer ${o.apiKey}` }), ...o.extraHeaders },
      body: JSON.stringify(claude ? { model: o.model ?? defaultModel, max_tokens: 1024, system: o.system, messages: [{ role: "user", content: o.brief }] } : { model: o.model ?? defaultModel, messages: [{ role: "system", content: o.system }, { role: "user", content: o.brief }] }),
    });
    if (!response.ok) throw new VendorError("Vendor HTTP failure", { status: response.status });
    const data = await response.json();
    const text = claude ? (Array.isArray(data.content) ? data.content.filter((b: {type?: string}) => b.type === "text").map((b: {text?: unknown}) => { if (typeof b.text !== "string") throw new Error("Invalid text block"); return b.text; }).join("") : undefined) : data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("Unexpected vendor response shape");
    const inputTokens = data.usage?.[claude ? "input_tokens" : "prompt_tokens"];
    const outputTokens = data.usage?.[claude ? "output_tokens" : "completion_tokens"];
    return { text, usage: data.usage ? { inputTokens: typeof inputTokens === "number" ? inputTokens : undefined, outputTokens: typeof outputTokens === "number" ? outputTokens : undefined } : undefined };
  } catch (cause) {
    if (cause instanceof VendorError) throw cause;
    throw new VendorError("Vendor request or response failed", { cause });
  } finally { clearTimeout(timer); }
}
export const callClaude = (o: VendorOptions) => request(o, true, "claude-sonnet-4-5");
export const callGpt = (o: VendorOptions) => request(o, false, "gpt-4o-mini");
export const callWorkersAi = (o: VendorOptions) => request(o, false, "@cf/meta/llama-3.1-8b-instruct");
