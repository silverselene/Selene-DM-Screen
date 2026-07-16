import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

// The real runChatTurn spawns the Claude Agent SDK (+ ddb-mcp subprocess), so it
// must be mocked; the HTTP server, sockets, and client disconnect are all real.
// Each test assigns `chatTurnImpl` to control the streamed turn.
const mocks = vi.hoisted(() => ({
  chatTurnImpl: undefined as
    | ((abort?: AbortController) => AsyncGenerator<{ type: string }>)
    | undefined,
}));

vi.mock("./agent", () => ({
  runChatTurn: (_message: string, abort?: AbortController) => {
    if (!mocks.chatTurnImpl) throw new Error("test forgot to set chatTurnImpl");
    return mocks.chatTurnImpl(abort);
  },
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await sleep(20);
  }
  return cond();
}

/**
 * POST /chat, wait for the first streamed SSE bytes (so the server is inside
 * its streaming loop), then hard-destroy the client socket to simulate the
 * Stop button / closed tile / dropped connection.
 */
function connectThenDrop(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const clientReq = http.request(
      { host: "127.0.0.1", port, method: "POST", path: "/chat", headers: { "Content-Type": "application/json" } },
      (clientRes) => {
        clientRes.once("data", () => {
          clientReq.destroy();
          resolve();
        });
        clientRes.on("error", () => {});
      },
    );
    clientReq.on("error", reject);
    clientReq.end(JSON.stringify({ message: "hello" }));
  });
}

/**
 * POST /chat and read the response to completion, parsing the SSE frames. Used
 * to assert the happy path: a connected client receives every event and the
 * server ends the stream cleanly (`res.end()`), so a regression that inverts a
 * write guard or drops the final end() is caught.
 */
function collectStream(port: number): Promise<{ events: Array<{ event: string; data: unknown }>; ended: boolean }> {
  return new Promise((resolve, reject) => {
    const clientReq = http.request(
      { host: "127.0.0.1", port, method: "POST", path: "/chat", headers: { "Content-Type": "application/json" } },
      (clientRes) => {
        let buf = "";
        clientRes.setEncoding("utf8");
        clientRes.on("data", (chunk) => {
          buf += chunk;
        });
        clientRes.on("end", () => {
          const events = buf
            .split("\n\n")
            .filter((frame) => frame.trim() !== "")
            .map((frame) => {
              const event = frame.match(/^event: (.*)$/m)?.[1] ?? "";
              const data = JSON.parse(frame.match(/^data: (.*)$/m)?.[1] ?? "null");
              return { event, data };
            });
          // `end` only fires because the server called res.end(); a hung stream
          // would instead time out the test.
          resolve({ events, ended: true });
        });
        clientRes.on("error", reject);
      },
    );
    clientReq.on("error", reject);
    clientReq.end(JSON.stringify({ message: "hello" }));
  });
}

describe("origin allowlist", () => {
  let server: http.Server;
  let port: number;

  function getHealth(p: number, origin?: string): Promise<{ status: number; acao?: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: p,
          method: "GET",
          path: "/health",
          headers: origin ? { Origin: origin } : {},
        },
        (res) => {
          res.resume();
          resolve({
            status: res.statusCode ?? 0,
            acao: res.headers["access-control-allow-origin"] as string | undefined,
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  beforeEach(async () => {
    process.env.AI_BRIDGE_PORT = "0";
    process.env.AI_BRIDGE_ALLOWED_ORIGINS = "https://dm.example.com/";
    vi.resetModules();
    const { startServer } = await import("./server");
    server = await startServer();
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    delete process.env.AI_BRIDGE_PORT;
    delete process.env.AI_BRIDGE_ALLOWED_ORIGINS;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("accepts the default SPA origin and an AI_BRIDGE_ALLOWED_ORIGINS extra", async () => {
    const local = await getHealth(port, "http://localhost:38080");
    expect(local.status).toBe(200);
    expect(local.acao).toBe("http://localhost:38080");
    // Env value had a trailing slash; the Origin header never does.
    expect((await getHealth(port, "https://dm.example.com")).status).toBe(200);
  });

  // The widget's isBridgeHealth validates exactly these consumed fields; a
  // bridge that stops emitting them (or the version marker) breaks old SPAs.
  it("emits the consumed health fields and the protocol version", async () => {
    const body = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, method: "GET", path: "/health" },
        (res) => {
          let buf = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (buf += c));
          res.on("end", () => resolve(JSON.parse(buf)));
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(typeof body.billing).toBe("string");
    expect(typeof body.ddbMcpFound).toBe("boolean");
    expect(body.protocolVersion).toBe(1);
    // The client sizes its stall watchdog above this, so it must be a positive
    // number on the wire (an old bridge omitting it makes the client use a floor).
    expect(typeof body.turnTimeoutMs).toBe("number");
    expect(body.turnTimeoutMs as number).toBeGreaterThan(0);
    // The resolved ddb-mcp path is an absolute path under the DM's home dir —
    // it must never be on the wire (a DNS-rebound page could read /health
    // before the Host gate existed; keep the body boring regardless).
    expect(body.ddbMcpEntry).toBeUndefined();
  });

  it("refuses an unlisted browser origin with 403", async () => {
    expect((await getHealth(port, "https://evil.example.com")).status).toBe(403);
  });

  // Without a reflected ACAO the browser turns the 403 into an opaque network
  // error the widget can't tell apart from "bridge not running" — so a blocked
  // origin's /health MUST still echo Access-Control-Allow-Origin (the body is
  // non-sensitive; /chat stays hard-blocked at its CORS preflight).
  it("reflects ACAO on the /health 403 so the browser can read the block", async () => {
    const blocked = await getHealth(port, "https://evil.example.com");
    expect(blocked.status).toBe(403);
    expect(blocked.acao).toBe("https://evil.example.com");
  });

  /** OPTIONS preflight carrying the Chromium Private Network Access request
   *  header, as sent by a public-origin page fetching a loopback service. */
  function preflightPna(p: number, origin: string): Promise<{ status: number; pna?: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: p,
          method: "OPTIONS",
          path: "/chat",
          headers: {
            Origin: origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Private-Network": "true",
          },
        },
        (res) => {
          res.resume();
          resolve({
            status: res.statusCode ?? 0,
            pna: res.headers["access-control-allow-private-network"] as string | undefined,
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  // Chromium PNA: a remote-origin deploy's preflight to the loopback bridge
  // fails as an opaque network error (misread by the widget as "offline")
  // unless the response asserts Access-Control-Allow-Private-Network — but
  // only allowlisted origins may receive the assertion.
  it("asserts Access-Control-Allow-Private-Network for allowlisted origins only", async () => {
    const allowed = await preflightPna(port, "https://dm.example.com");
    expect(allowed.status).toBe(204);
    expect(allowed.pna).toBe("true");
    const blocked = await preflightPna(port, "https://evil.example.com");
    expect(blocked.status).toBe(204);
    expect(blocked.pna).toBeUndefined();
  });

  /** GET /health with an explicit Host header (the DNS-rebinding probe shape:
   *  same-origin, so no Origin header — only Host betrays the rebound page). */
  function getHealthWithHost(p: number, host: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: p, method: "GET", path: "/health", headers: { Host: host } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  // DNS rebinding: attacker.example resolves to 127.0.0.1, so its page's
  // same-origin GETs reach us with no Origin header — but Host still names the
  // attacker's domain. Loopback Hosts (what every legitimate client sends)
  // pass; anything else is refused.
  it("refuses a non-loopback Host (DNS rebinding) and accepts loopback Hosts", async () => {
    expect(await getHealthWithHost(port, `attacker.example:${port}`)).toBe(403);
    expect(await getHealthWithHost(port, `127.0.0.1:${port}`)).toBe(200);
    expect(await getHealthWithHost(port, `localhost:${port}`)).toBe(200);
  });
});

describe("chat concurrency cap", () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    process.env.AI_BRIDGE_PORT = "0";
    vi.resetModules();
    const { startServer } = await import("./server");
    server = await startServer();
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    delete process.env.AI_BRIDGE_PORT;
    mocks.chatTurnImpl = undefined;
    // Sever any stream a failed assertion left open, so close() can't hang.
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /** POST /chat and resolve with the status code once headers arrive. */
  function chatStatus(p: number): Promise<{ status: number; req: http.ClientRequest }> {
    return new Promise((resolve, reject) => {
      const clientReq = http.request(
        { host: "127.0.0.1", port: p, method: "POST", path: "/chat", headers: { "Content-Type": "application/json" } },
        (clientRes) => {
          clientRes.resume();
          clientRes.on("error", () => {});
          resolve({ status: clientRes.statusCode ?? 0, req: clientReq });
        },
      );
      clientReq.on("error", reject);
      clientReq.end(JSON.stringify({ message: "hello" }));
    });
  }

  it("refuses a second concurrent turn with 429, then accepts once the first ends", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => (release = r));
    mocks.chatTurnImpl = async function* () {
      yield { type: "text", text: "first" };
      await gate; // hold the first turn in-flight
    };

    const first = await chatStatus(port);
    expect(first.status).toBe(200);

    const second = await chatStatus(port);
    expect(second.status).toBe(429);

    // The slot must be released when the first turn finishes — a follow-up
    // turn (mocked to complete immediately) is accepted again. Retry briefly:
    // the release races the first turn's teardown.
    release?.();
    first.req.destroy();
    mocks.chatTurnImpl = async function* () {
      yield { type: "text", text: "later" };
    };
    let thirdStatus = 0;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && thirdStatus !== 200) {
      thirdStatus = (await chatStatus(port)).status;
      if (thirdStatus !== 200) await sleep(20);
    }
    expect(thirdStatus).toBe(200);
  });
});

describe("chat turn timeout", () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    process.env.AI_BRIDGE_PORT = "0";
    process.env.AI_BRIDGE_TURN_TIMEOUT_MS = "150"; // fast deadline for the test
    vi.resetModules();
    const { startServer } = await import("./server");
    server = await startServer();
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    delete process.env.AI_BRIDGE_PORT;
    delete process.env.AI_BRIDGE_TURN_TIMEOUT_MS;
    mocks.chatTurnImpl = undefined;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /** POST /chat and collect the raw SSE body to completion. */
  function chatBody(p: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: p, method: "POST", path: "/chat", headers: { "Content-Type": "application/json" } },
        (res) => {
          let buf = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (buf += c));
          res.on("end", () => resolve(buf));
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ message: "hello" }));
    });
  }

  it("aborts a wedged turn past the deadline, reports it, and frees the slot", async () => {
    // A turn that never completes on its own — it hangs until the server's
    // timeout aborts it. Throwing on abort is runChatTurn's real contract
    // (an aborted turn rethrows instead of yielding an error event — pinned
    // in agent.test.ts), so this mock mirrors production.
    mocks.chatTurnImpl = async function* (abort?: AbortController) {
      yield { type: "text", text: "working" };
      await new Promise<void>((_resolve, rejectHang) => {
        abort?.signal.addEventListener("abort", () => rejectHang(new Error("aborted")));
      });
    };

    const body = await chatBody(port);
    expect(body).toContain("time limit"); // the timeout-specific error message

    // The slot must have been reclaimed by the timeout — a fresh, fast turn is
    // accepted (a leaked slot would have hung this at 429 / no response).
    mocks.chatTurnImpl = async function* () {
      yield { type: "text", text: "later" };
    };
    const next = await chatBody(port);
    expect(next).toContain("later");
  });

  // The reclamation above is cooperative — it needs the generator to settle
  // once aborted. This pins the HARD fallback: a turn that ignores the abort
  // entirely (never yields, never throws) is declared wedged after the grace
  // period and abandoned, so the slot is still reclaimed and /chat keeps
  // working. Before the wedge race, this exact shape pinned the slot forever:
  // permanent 429s while /health stayed green.
  it("reclaims the slot even when the turn ignores the abort entirely", async () => {
    mocks.chatTurnImpl = async function* () {
      yield { type: "text", text: "working" };
      // Never settles — not even on abort. Mirrors an SDK/subprocess hang that
      // doesn't observe its signal.
      await new Promise(() => {});
    };

    const body = await chatBody(port);
    expect(body).toContain("time limit");

    mocks.chatTurnImpl = async function* () {
      yield { type: "text", text: "later" };
    };
    const next = await chatBody(port);
    expect(next).toContain("later");
  });
});

describe("client disconnect mid-stream", () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    process.env.AI_BRIDGE_PORT = "0"; // ephemeral port, read before ./config loads
    vi.resetModules();
    const { startServer } = await import("./server");
    server = await startServer();
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    delete process.env.AI_BRIDGE_PORT;
    mocks.chatTurnImpl = undefined;
    // Await close so a torn-down-mid-stream socket from the prior test can't
    // still be alive when the next beforeEach imports a fresh module graph.
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("streams every event to a connected client and ends the stream cleanly", async () => {
    mocks.chatTurnImpl = async function* () {
      yield { type: "text", text: "one" };
      yield { type: "text", text: "two" };
    };

    const { events, ended } = await collectStream(port);

    expect(ended).toBe(true);
    expect(events).toEqual([
      { event: "text", data: { type: "text", text: "one" } },
      { event: "text", data: { type: "text", text: "two" } },
    ]);
  });

  it("aborts the in-flight agent turn when the client disconnects", async () => {
    let capturedAbort: AbortController | undefined;
    mocks.chatTurnImpl = async function* (abort) {
      capturedAbort = abort;
      yield { type: "text", text: "first chunk" };
      // Simulate a turn sitting inside a slow tool call: nothing more to yield
      // until aborted. A well-behaved SDK turn ends when its signal fires.
      while (!abort?.signal.aborted) await sleep(20);
    };

    await connectThenDrop(port);

    expect(await waitFor(() => capturedAbort?.signal.aborted === true)).toBe(true);
  });

  it("stops pulling events after disconnect even if the turn ignores the abort", async () => {
    let finished = false;
    mocks.chatTurnImpl = async function* () {
      try {
        // An SDK turn that never checks the signal and streams forever.
        for (;;) {
          yield { type: "text", text: "chunk" };
          await sleep(20);
        }
      } finally {
        // Runs when the server's for-await loop breaks (generator.return()).
        finished = true;
      }
    };

    await connectThenDrop(port);

    expect(await waitFor(() => finished)).toBe(true);
  });
});
