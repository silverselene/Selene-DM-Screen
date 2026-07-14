import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import type { BridgeHealth } from "@workspace/bridge-protocol";
import { config } from "./config";
import { ALLOWED_TOOL_IDS } from "./ddbTools";
import { resolveAuth } from "./auth";
import { runChatTurn } from "./agent";
import { parseChatRequest } from "./chatRequest";

const MAX_BODY_BYTES = 64 * 1024; // chat turns are short prompts, not uploads

// Binding to 127.0.0.1 keeps the LAN out, but it does NOT stop a request made
// from inside the DM's own browser: any web page they visit could POST to
// http://127.0.0.1:38900 and, with a wildcard `Access-Control-Allow-Origin`,
// read the streamed reply — driving the DM's Claude subscription and
// exfiltrating their D&D Beyond data. So we reflect an allowed origin only for
// the local SPA and reject any other cross-site browser request (see
// `isAllowedOrigin`), rather than trusting `*`.
const ALLOWED_ORIGINS = new Set([
  "http://localhost:38080",
  "http://127.0.0.1:38080",
]);

/**
 * A request is allowed when it carries no `Origin` header (curl, the in-process
 * smoke test, server-to-server — not a browser cross-site call) or its Origin is
 * one of the local SPA's. A present-but-unlisted Origin is a cross-site browser
 * request and is refused.
 */
function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  return origin === undefined || ALLOWED_ORIGINS.has(origin);
}

function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin !== undefined && ALLOWED_ORIGINS.has(origin)) {
    // Echo the specific allowed origin (never `*`) so the browser exposes the
    // response only to the local SPA, and vary on it since the header depends
    // on the request.
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        // Stop consuming, but don't destroy the socket — the caller still needs
        // it to send a 400. Pausing detaches us from further 'data' events so we
        // reject exactly once; the response handler closes the connection.
        req.pause();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sse(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// True while it's still safe to write to the response. `res.writable` covers our
// own end(); it stays true on a peer-destroyed socket (Node 24), where only
// `res.destroyed` flips — check both or a client disconnect falls through to a
// write-after-close. Single source of truth for the three stream guards below.
function canWrite(res: ServerResponse): boolean {
  return res.writable && !res.destroyed;
}

function handleHealth(res: ServerResponse) {
  const auth = resolveAuth();
  const health: BridgeHealth = {
    ok: true,
    service: "selene-ai-bridge",
    billing: auth.mode,
    ddbMcpEntry: config.ddbMcpEntry,
    ddbMcpFound: config.ddbMcpEntry != null && existsSync(config.ddbMcpEntry),
    allowedTools: ALLOWED_TOOL_IDS.length,
  };
  sendJson(res, 200, health);
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : "Invalid request body" });
    return;
  }
  // Parse + validate the untrusted body. `message` is required; `resume`/`model`
  // pass through when non-empty; `effort` is dropped unless it's a valid level.
  const parsed = parseChatRequest(raw);
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }
  const { message, resume, model, effort } = parsed.value;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  // When the client disconnects mid-stream (Stop button, closed tile, network
  // drop) the socket is destroyed and any later write emits 'error' on the
  // response. Without a listener that is an unhandled 'error' — it would crash
  // this process. Swallow it: the `res.writable` guards below already stop the
  // stream, this only covers a write that races the disconnect.
  res.on("error", () => {});

  // Abort the Agent turn as soon as the client goes away, instead of only
  // noticing between streamed events — a turn can sit for seconds inside a
  // single ddb-mcp tool call. Listen on `res`, not `req`: on Node 24 the
  // request emits `close` when its (already-consumed) body ends — before this
  // line runs — and never again, so a `req` listener misses the disconnect.
  // `res` emits `close` when the connection actually goes away. It also fires
  // after a normal end; aborting there is a deliberate no-op as long as nothing
  // observes the signal once the turn's generator is exhausted (the `for await`
  // has already returned), so guard against a redundant post-turn abort.
  const abort = new AbortController();
  res.on("close", () => {
    if (!abort.signal.aborted) abort.abort();
  });

  try {
    for await (const ev of runChatTurn(message, abort, resume, model, effort)) {
      if (!canWrite(res)) break;
      sse(res, ev.type, ev);
    }
  } catch (err) {
    if (canWrite(res)) {
      sse(res, "error", { type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    if (canWrite(res)) res.end();
  }
}

export function startServer() {
  const server = createServer((req, res) => {
    cors(req, res);
    const { method = "GET", url = "/" } = req;
    const path = url.split("?")[0];

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    // Refuse cross-site browser requests before they can trigger any work — a
    // simple (no-preflight) POST from a malicious page carries an Origin we
    // won't have allowlisted, so this stops it spending the subscription even
    // though the missing ACAO would already hide the response from it.
    if (!isAllowedOrigin(req)) {
      sendJson(res, 403, { error: "Origin not allowed" });
      return;
    }
    if (method === "GET" && path === "/health") {
      handleHealth(res);
      return;
    }
    if (method === "POST" && path === "/chat") {
      void handleChat(req, res);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  });

  return new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve(server));
  });
}
