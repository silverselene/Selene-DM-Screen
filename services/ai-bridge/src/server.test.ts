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
