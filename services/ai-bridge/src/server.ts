import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import type { BridgeHealth } from "@workspace/bridge-protocol";
import { config } from "./config";
import { ALLOWED_TOOL_IDS } from "./ddbTools";
import { resolveAuth } from "./auth";
import { runChatTurn } from "./agent";
import { parseChatRequest } from "./chatRequest";

const MAX_BODY_BYTES = 64 * 1024; // chat turns are short prompts, not uploads

// Each turn cold-starts a Claude Code + ddb-mcp subprocess pair and spends the
// DM's subscription, and concurrent `resume`s of one session race the SDK's
// local store — so in-flight turns are capped, not queued. The widget already
// serializes sends client-side; this guards the second tab / stray script.
const MAX_CONCURRENT_TURNS = 1;
let inFlightTurns = 0;

// A turn that wedges — a hung ddb-mcp subprocess, a stalled model call — must
// not pin the single slot forever: with MAX_CONCURRENT_TURNS = 1 that is a total
// /chat outage until the process restarts. Abort any turn that overruns this
// wall-clock budget so the slot is always reclaimed. (The client-disconnect
// abort below does not cover this: a wedged turn can sit with the browser tab
// still open, so no disconnect ever fires.) Overridable via env for tests /
// slow hosts; a non-positive or unparseable value falls back to the default.
const TURN_TIMEOUT_MS = Number(process.env.AI_BRIDGE_TURN_TIMEOUT_MS) > 0
  ? Number(process.env.AI_BRIDGE_TURN_TIMEOUT_MS)
  : 3 * 60 * 1000;

// The abort above is only *cooperative*: reclaiming the slot still requires the
// SDK generator to settle its pending next() once the signal fires. A turn that
// ignores the abort entirely (the exact failure the timeout exists for) would
// leave the `for await` suspended forever — slot pinned, /chat a permanent 429
// while /health stays green. So once a turn is aborted (timeout OR client
// disconnect), it gets this long to settle; past that it is declared wedged and
// abandoned: the slot is released and the response ended without waiting on the
// generator again. Capped by TURN_TIMEOUT_MS so tests (and operators) that
// shrink the turn budget shrink the grace with it.
const WEDGE_GRACE_MS = Math.min(10_000, TURN_TIMEOUT_MS);

// Sentinel raced against the generator's next() — see the wedge race in
// handleChat.
const WEDGED = Symbol("wedged");

// Binding to 127.0.0.1 keeps the LAN out, but it does NOT stop a request made
// from inside the DM's own browser: any web page they visit could POST to
// http://127.0.0.1:38900 and, with a wildcard `Access-Control-Allow-Origin`,
// read the streamed reply — driving the DM's Claude subscription and
// exfiltrating their D&D Beyond data. So we reflect an allowed origin only for
// the local SPA and reject any other cross-site browser request (see
// `isAllowedOrigin`), rather than trusting `*`. The set defaults to the SPA's
// standard :38080 origins; serving the SPA anywhere else needs the extra
// origin listed in AI_BRIDGE_ALLOWED_ORIGINS (see config.ts) — otherwise the
// bridge answers 403 and the widget reports it as "refused this page".
const ALLOWED_ORIGINS = config.allowedOrigins;

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

/**
 * The Origin allowlist alone doesn't stop DNS rebinding: a page on
 * `attacker.example` can rebind its hostname to 127.0.0.1 and issue
 * *same-origin* GETs that carry NO Origin header — sailing past
 * `isAllowedOrigin` and reading /health. Those requests do carry the attacker's
 * hostname in `Host`, and a legitimate local client always addresses us by a
 * loopback name — so any other Host is rejected. A missing Host (non-browser
 * HTTP/1.0 clients like `curl --http1.0`) is allowed: rebinding is a browser
 * attack, and browsers always send Host.
 */
function isAllowedHost(req: IncomingMessage): boolean {
  const host = req.headers.host;
  if (host === undefined) return true;
  try {
    const { hostname } = new URL(`http://${host}`);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
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
  // Same race as the SSE path (see handleChat): a client that disconnects
  // between our check and this write turns it into an unlistened 'error'
  // event, which would crash the whole process.
  res.on("error", () => {});
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

// Wire-contract revision reported in /health. Bump on a breaking /chat or
// /health change; the value lives here because @workspace/bridge-protocol is
// types-only and must not export runtime code.
const BRIDGE_PROTOCOL_VERSION = 1;

function handleHealth(res: ServerResponse) {
  const auth = resolveAuth();
  // Deliberately NOT included: config.ddbMcpEntry. It's an absolute path under
  // the DM's home directory (leaks the username), and /health is the one
  // endpoint a DNS-rebound page could read before the Host check existed —
  // keep its body boring. The path still prints on the server console at
  // startup (index.ts), which is where a human debugging resolution looks.
  const health: BridgeHealth = {
    ok: true,
    service: "selene-ai-bridge",
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    billing: auth.mode,
    ddbMcpFound: config.ddbMcpEntry != null && existsSync(config.ddbMcpEntry),
    // Published so the client's stall watchdog can size itself above our turn
    // cap even when an operator raises AI_BRIDGE_TURN_TIMEOUT_MS (see streamChat).
    turnTimeoutMs: TURN_TIMEOUT_MS,
    allowedTools: ALLOWED_TOOL_IDS.length,
  };
  sendJson(res, 200, health);
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    // The request stream is in an unusable state (oversized body left paused
    // with unread bytes, or a request error) — a keep-alive reuse would wedge.
    // `Connection: close` makes Node tear the socket down after the 400 flushes.
    res.setHeader("Connection", "close");
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

  // Claim the turn slot only for a valid request, and only after the body is
  // fully read (a rejected oversized body must not hold the slot).
  if (inFlightTurns >= MAX_CONCURRENT_TURNS) {
    sendJson(res, 429, {
      error: "A chat turn is already in progress. Wait for it to finish (or stop it) and retry.",
    });
    return;
  }
  // The slot is claimed as the FIRST statement inside the try below — never
  // here. Its matching decrement lives ONLY in the guarded release the finally
  // runs, so the claim has to sit where every throw between it and that release
  // (writeHead on a just-destroyed socket, a generator rejection) is guaranteed
  // to reach the finally. A leaked slot is a permanent /chat outage at
  // MAX_CONCURRENT_TURNS = 1. The once-guard keeps the count honest should any
  // future path release early (e.g. on declaring the turn wedged). Nothing
  // between the `inFlightTurns >= MAX` check above and the claim below awaits,
  // so the check-then-claim stays atomic on the single-threaded event loop.
  let slotReleased = false;
  const releaseSlot = () => {
    if (!slotReleased) {
      slotReleased = true;
      inFlightTurns--;
    }
  };

  // Abort the Agent turn as soon as the client goes away, instead of only
  // noticing between streamed events — a turn can sit for seconds inside a
  // single ddb-mcp tool call. (Wired to `res` inside the try, below.)
  const abort = new AbortController();
  let timedOut = false;
  let finished = false;
  let turnTimeout: NodeJS.Timeout | undefined;
  let wedgeTimer: NodeJS.Timeout | undefined;
  // Calling the generator function only *creates* the iterator (nothing runs
  // until the first next()), and it happens BEFORE the slot is claimed, so even
  // if it threw no slot would leak. Hoisted so the finally can hand it its
  // end-of-iteration signal.
  const turn = runChatTurn(message, abort, resume, model, effort)[Symbol.asyncIterator]();

  try {
    // Claim the turn slot as the very first thing in the guarded region so the
    // finally's releaseSlot() is guaranteed to pair with it — see the claim
    // comment above.
    inFlightTurns++;
    // When the client disconnects mid-stream (Stop button, closed tile, network
    // drop) the socket is destroyed and any later write emits 'error' on the
    // response. Without a listener that is an unhandled 'error' — it would crash
    // this process. Swallow it: the `canWrite` guards below already stop the
    // stream, this only covers a write that races the disconnect. Registered
    // before writeHead so even the very first write is covered.
    res.on("error", () => {});
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Listen on `res`, not `req`: on Node 24 the request emits `close` when its
    // (already-consumed) body ends — before this line runs — and never again,
    // so a `req` listener misses the disconnect. `res` emits `close` when the
    // connection actually goes away. It also fires after a normal end; aborting
    // there is a deliberate no-op as long as nothing observes the signal once
    // the turn's generator is exhausted, so guard against a redundant post-turn
    // abort (and `finished` keeps it from arming a pointless wedge timer).
    res.on("close", () => {
      if (!abort.signal.aborted) abort.abort();
    });
    // Reclaim the slot even if the turn wedges with the client still connected
    // (so the disconnect-driven abort above never fires). See TURN_TIMEOUT_MS.
    turnTimeout = setTimeout(() => {
      timedOut = true;
      if (!abort.signal.aborted) abort.abort();
    }, TURN_TIMEOUT_MS);

    // Resolves WEDGE_GRACE_MS after the turn is aborted (by the timeout above
    // or a client disconnect) — the hard fallback for a generator that ignores
    // its signal and never settles. Armed lazily so a turn that completes
    // normally never starts the timer (the post-end `close` abort finds
    // `finished` set).
    const wedged = new Promise<typeof WEDGED>((resolve) => {
      abort.signal.addEventListener(
        "abort",
        () => {
          if (finished) return;
          wedgeTimer = setTimeout(() => resolve(WEDGED), WEDGE_GRACE_MS);
        },
        { once: true },
      );
    });

    for (;;) {
      const pull = turn.next();
      // If the wedge race abandons this pull, its eventual settlement (if any)
      // must not surface as an unhandled rejection and kill the process.
      pull.catch(() => {});
      const result = await Promise.race([pull, wedged]);
      if (result === WEDGED) {
        // The turn ignored its abort for the whole grace period. Stop waiting
        // on it: report, release the slot, and end the response — the abandoned
        // generator keeps whatever it's stuck on, but it can no longer pin the
        // slot. (In the disconnect case there's no one to write to and canWrite
        // is already false.)
        if (canWrite(res)) {
          sse(res, "error", {
            type: "error",
            message: timedOut
              ? `Chat turn exceeded the ${TURN_TIMEOUT_MS / 1000}s time limit and was stopped.`
              : "Chat turn was cancelled.",
          });
        }
        break;
      }
      if (result.done) break;
      if (!canWrite(res)) break;
      sse(res, result.value.type, result.value);
    }
  } catch (err) {
    if (canWrite(res)) {
      const message = timedOut
        ? `Chat turn exceeded the ${TURN_TIMEOUT_MS / 1000}s time limit and was stopped.`
        : err instanceof Error
          ? err.message
          : String(err);
      sse(res, "error", { type: "error", message });
    }
  } finally {
    finished = true;
    if (turnTimeout !== undefined) clearTimeout(turnTimeout);
    if (wedgeTimer !== undefined) clearTimeout(wedgeTimer);
    // Signal end-of-iteration to a still-live generator so its finally blocks
    // run (`for await`'s break used to do this implicitly). Deliberately NOT
    // awaited: on a wedged generator return() queues behind the pending next()
    // and would reintroduce the exact hang the wedge race exists to prevent.
    void turn.return?.(undefined)?.catch(() => {});
    releaseSlot();
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
    // DNS-rebinding guard — see isAllowedHost. Checked before the origin gate
    // because a rebound page's requests are same-origin (no Origin header) and
    // would otherwise pass it.
    if (!isAllowedHost(req)) {
      sendJson(res, 403, { error: "Host not allowed" });
      return;
    }
    // Refuse cross-site browser requests before they can trigger any work — a
    // simple (no-preflight) POST from a malicious page carries an Origin we
    // won't have allowlisted, so this stops it spending the subscription even
    // though the missing ACAO would already hide the response from it.
    if (!isAllowedOrigin(req)) {
      // For GET /health only, reflect ACAO on the 403 so the browser can READ
      // the status. Without it the missing ACAO turns the 403 into an opaque
      // network error indistinguishable from connection-refused, and the widget
      // can't tell "bridge blocked this origin" (remedy: AI_BRIDGE_ALLOWED_ORIGINS)
      // from "bridge not running" (remedy: start it). The health body carries
      // nothing sensitive, and /chat stays hard-blocked: its application/json
      // POST triggers a CORS preflight that gets no ACAO and never reaches here.
      const origin = req.headers.origin;
      if (method === "GET" && path === "/health" && origin !== undefined) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      sendJson(res, 403, { error: "Origin not allowed" });
      return;
    }
    if (method === "GET" && path === "/health") {
      handleHealth(res);
      return;
    }
    if (method === "POST" && path === "/chat") {
      // Never `void` this: a rejection out of handleChat (its own try/finally
      // starts only after the slot claim; readBody/parse sit before it) would
      // be an unhandled rejection — fatal by default on Node.
      handleChat(req, res).catch((err) => {
        console.error("[ai-bridge] unexpected /chat handler failure:", err);
        if (!res.headersSent) {
          sendJson(res, 500, { error: "Internal error" });
        } else {
          res.destroy();
        }
      });
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  });

  // Explicit request-phase timeouts (tighter than Node's 60s/300s defaults):
  // every legitimate request here is a sub-64KB JSON body from localhost, so a
  // client that takes longer than this to deliver headers or body is wedged or
  // hostile and should not hold a socket. These bound only the *incoming*
  // request; the SSE response can stream as long as the turn runs (that side
  // is bounded by TURN_TIMEOUT_MS).
  server.headersTimeout = 30_000;
  server.requestTimeout = 60_000;

  return new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve(server));
  });
}
