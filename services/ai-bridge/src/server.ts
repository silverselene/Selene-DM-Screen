import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import type { BridgeHealth } from "@workspace/bridge-protocol";
import { config } from "./config";
import { ALLOWED_TOOL_IDS } from "./ddbTools";
import { resolveAuth } from "./auth";
import { runChatTurn } from "./agent";

const MAX_BODY_BYTES = 64 * 1024; // chat turns are short prompts, not uploads

function cors(res: ServerResponse) {
  // Bound to 127.0.0.1, so the LAN can't reach this; a permissive origin only
  // lets the local SPA (http://localhost:38080) call it from the browser.
  res.setHeader("Access-Control-Allow-Origin", "*");
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
  let message: unknown;
  let resume: string | undefined;
  try {
    const raw = await readBody(req);
    const parsed = JSON.parse(raw) as { message?: unknown; resume?: unknown };
    message = parsed.message;
    // Optional: continue a prior conversation. Echoed back by the client from
    // the previous turn's `done` event, so it's a session id the SDK minted.
    if (typeof parsed.resume === "string" && parsed.resume !== "") resume = parsed.resume;
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : "Invalid JSON body" });
    return;
  }
  if (typeof message !== "string" || message.trim() === "") {
    sendJson(res, 400, { error: 'Body must be JSON: { "message": "<non-empty string>" }' });
    return;
  }

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
  // single ddb-mcp tool call.
  const abort = new AbortController();
  req.on("close", () => abort.abort());

  try {
    for await (const ev of runChatTurn(message, abort, resume)) {
      // `res.writable` is false once we've ended OR the peer closed the socket;
      // `writableEnded` only covers the former, so a client disconnect would
      // otherwise fall through to a write-after-close.
      if (!res.writable) break;
      sse(res, ev.type, ev);
    }
  } catch (err) {
    if (res.writable) {
      sse(res, "error", { type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    if (res.writable) res.end();
  }
}

export function startServer() {
  const server = createServer((req, res) => {
    cors(res);
    const { method = "GET", url = "/" } = req;
    const path = url.split("?")[0];

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
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
