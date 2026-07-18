import { defineConfig } from "vitest/config";

// Node-env Tier-1 tests for the bridge's pure logic (tool-result parsing).
// No jsdom, no SDK/network — parsers are string-in/object-out. Mirrors the
// dm-screen vitest setup.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
