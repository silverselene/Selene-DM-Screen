import { defineConfig } from "vitest/config";

// Standalone Vitest config for the offline data generators. Pure Node logic
// (tag stripping, CSV parsing) — no DOM, no network, no sibling-clone reads:
// tests must run on a machine without ../5etools-src or ../open5e-api.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
