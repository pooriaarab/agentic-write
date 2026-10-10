import { beforeEach, describe, expect, test, vi } from "vitest";
import { writeCopy, dryRunCopy, resolveVendor, resetWriteCaps, type CopyKind } from "./write.js";
import { callClaude, callGpt, callWorkersAi } from "./vendors.js";
import { GuardError, VendorError, resetCosts, getCostReport } from "./core.js";
const env = { OPENAI_API_KEY: "test-key" };
const payload = { choices: [{ message: { content: "draft" } }], usage: { prompt_tokens: 2, completion_tokens: 3 } };
const stub = (data: unknown = payload, status = 200) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify(data), { status }));
beforeEach(() => { resetWriteCaps(); resetCosts(); });
describe("drafts", () => {
  test.each(["post", "mail", "script"] as CopyKind[])("%s is pure and offline", async kind => {
    const fetchFn = vi.fn<typeof fetch>(() => { throw new Error("network forbidden"); });
    const first = await writeCopy(kind, "autumn boots", { fetchFn });
    expect(first.text).toBe(dryRunCopy(kind, "autumn boots"));
    expect(first.text).not.toBe(dryRunCopy(kind, "spring shoes"));
    expect(first.text).toContain("autumn boots");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(getCostReport().entries).toHaveLength(0);
    if (kind === "post") { expect(first.text.split("\n")).toHaveLength(1); expect(dryRunCopy(kind, "a".repeat(1000)).length).toBeLessThanOrEqual(280); }
    if (kind === "mail") expect(first.text).toMatch(/^Subject:.*\n\n[^\n]+\n[^\n]+\n[^\n]+\n[^\n]+$/);
    if (kind === "script") expect(first.text).toMatch(/^Hook:.*\nBody:.*\nClose:/);
  });
  test("validates kind and brief", async () => {
    await expect(writeCopy("" as CopyKind, "x")).rejects.toThrow(/post, mail, or script/);
    await expect(writeCopy("post", "  ")).rejects.toThrow(/brief/);
  });
});
test("auto priority and explicit choice", () => {
  const all = { ANTHROPIC_API_KEY: "x", ...env, CLOUDFLARE_API_TOKEN: "x", CLOUDFLARE_ACCOUNT_ID: "a", AI_GATEWAY_ID: "g" };
  expect(resolveVendor({ env: all })).toBe("claude");
  expect(resolveVendor({ env: { ...all, ANTHROPIC_API_KEY: undefined } })).toBe("gpt");
  expect(resolveVendor({ env: { ...all, ANTHROPIC_API_KEY: undefined, OPENAI_API_KEY: undefined } })).toBe("workers-ai");
  expect(resolveVendor({ env: {} })).toBe("dry-run");
  expect(resolveVendor({ env: all, vendor: "workers-ai" })).toBe("workers-ai");
});
test("missing keys name variables", async () => {
  await expect(writeCopy("post", "x", { dryRun: false, env: {} })).rejects.toThrow(/ANTHROPIC_API_KEY.*OPENAI_API_KEY.*CLOUDFLARE_API_TOKEN.*CLOUDFLARE_ACCOUNT_ID.*AI_GATEWAY_ID/);
  await expect(writeCopy("post", "x", { dryRun: false, vendor: "gpt", env: {} })).rejects.toBeInstanceOf(VendorError);
});
test("caps span calls, dry runs do not count, reset clears", async () => {
  const fetchFn = stub(); const options = { dryRun: false, env, fetchFn, caps: { maxCalls: 1 } };
  await writeCopy("post", "x", { ...options, dryRun: true });
  await writeCopy("post", "x", options);
  await expect(writeCopy("post", "x", options)).rejects.toBeInstanceOf(GuardError);
  expect(fetchFn).toHaveBeenCalledTimes(1);
  resetWriteCaps(); await writeCopy("post", "x", options);
  expect(getCostReport().entries[0]).toMatchObject({ kind: "write", adapter: "gpt", units: 5 });
});
test("character cap stops fetch before total exceeds budget", async () => {
  const fetchFn = stub(); const options = { dryRun: false, env, fetchFn, caps: { maxChars: 6 } };
  await writeCopy("post", "x", options);
  await expect(writeCopy("post", "xx", options)).rejects.toBeInstanceOf(GuardError);
  expect(fetchFn).toHaveBeenCalledTimes(1);
});
test.each([callClaude, callGpt, callWorkersAi])("adapter parses usage and rejects failures", async call => {
  const claude = call === callClaude;
  const options = { brief: "x", system: "s", apiKey: "test", base: "https://example.test", fetchFn: stub(claude ? { content: [{ type: "text", text: "draft" }], usage: { input_tokens: 2, output_tokens: 3 } } : payload) };
  expect(await call(options)).toEqual({ text: "draft", usage: { inputTokens: 2, outputTokens: 3 } });
  await expect(call({ ...options, fetchFn: stub({}, 429) })).rejects.toMatchObject({ status: 429 });
  const cause = new Error("offline");
  await expect(call({ ...options, fetchFn: vi.fn(async () => { throw cause; }) })).rejects.toMatchObject({ cause });
  await expect(call({ ...options, fetchFn: vi.fn(async () => new Response("bad json")) })).rejects.toBeInstanceOf(VendorError);
  await expect(call({ ...options, fetchFn: stub({}) })).rejects.toBeInstanceOf(VendorError);
});
test.each(["claude", "gpt", "workers-ai"] as const)("%s uses expected endpoints and headers", async vendor => {
  const fetchFn = stub(vendor === "claude" ? { content: [{ type: "text", text: "draft" }] } : payload);
  const keys = { ANTHROPIC_API_KEY: "test", OPENAI_API_KEY: "test", CLOUDFLARE_API_TOKEN: "test", CLOUDFLARE_ACCOUNT_ID: "account", AI_GATEWAY_ID: "gateway" };
  await writeCopy("post", "x", { vendor, dryRun: false, env: keys, fetchFn });
  const [url, init] = fetchFn.mock.calls[0];
  expect(url).toBe(vendor === "workers-ai" ? "https://api.cloudflare.com/client/v4/accounts/account/ai/v1/chat/completions" : `https://gateway.ai.cloudflare.com/v1/account/gateway/${vendor === "claude" ? "anthropic/v1/messages" : "openai/chat/completions"}`);
  expect(init?.headers).toMatchObject(vendor === "workers-ai" ? { "cf-aig-gateway-id": "gateway" } : { "cf-aig-authorization": "Bearer test" });
  if (vendor !== "workers-ai") {
    await writeCopy("post", "x", { vendor, dryRun: false, env: { ANTHROPIC_API_KEY: "test", OPENAI_API_KEY: "test" }, fetchFn });
    expect(fetchFn.mock.calls[1][0]).toBe(vendor === "claude" ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/chat/completions");
  }
});
