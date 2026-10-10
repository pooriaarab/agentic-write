import { summarizeText } from "./core.js";
import { writeCopy, type CopyKind } from "./write.js";
import { VERSION } from "./version.js";

export interface WorkerEnv {
  PACK_NAME?: string;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, pack: env.PACK_NAME ?? "agentic-write", version: VERSION });
    }
    if (request.method === "POST" && url.pathname === "/summarize") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "body must be JSON" }, 400);
      }
      if (typeof body !== "object" || body === null || !("text" in body)) {
        return json({ error: "body needs a text string" }, 400);
      }
      const { text } = body as { text: unknown };
      if (typeof text !== "string") {
        return json({ error: "body needs a text string" }, 400);
      }
      return json(summarizeText(text));
    }
    if (request.method === "POST" && url.pathname === "/write") {
      try {
        const body = await request.json();
        if (!body || !["post", "mail", "script"].includes(body.kind) || typeof body.brief !== "string" || !body.brief.trim()) return json({ error: "body needs a valid kind and non-empty brief" }, 400);
        return json(await writeCopy(body.kind as CopyKind, body.brief, { dryRun: true }));
      } catch { return json({ error: "body must be valid JSON" }, 400); }
    }
    return json({ error: "not found" }, 404);
  },
};
