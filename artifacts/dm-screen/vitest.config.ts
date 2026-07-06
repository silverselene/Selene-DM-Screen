import { defineConfig } from "vitest/config";
import path from "path";

// Standalone Vitest config — intentionally NOT the app's vite.config.ts, so
// tests don't spin up the React/Tailwind/PWA plugins. Tier-1 tests target the
// pure logic in src/lib (validators, migrations, id minting, backup/restore)
// and run in the plain Node environment; a fake `window.localStorage` is
// installed per-test where storage is exercised (see backup.test.ts). Add
// jsdom/@testing-library and flip `environment` to "jsdom" only when you start
// testing components.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
