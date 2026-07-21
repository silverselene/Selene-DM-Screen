import { defineConfig } from "vitest/config";

// Node-env tests for the bridge. No jsdom. Two tiers, both here:
//  - Pure logic (string-in/object-out): tool-result parsers (toolResults*.ts),
//    config/origin validation, SSE framing (sse.ts), the smoke formatter.
//  - Real-socket HTTP lifecycle (server.test.ts binds ephemeral ports, drops
//    sockets, exercises the wedge/timeout/backpressure paths) and an
//    SDK-mocking gate/mapping test (agent.test.ts mocks @anthropic-ai/…).
// The SDK subprocess is always mocked; the HTTP server and sockets are real.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
