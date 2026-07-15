import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Standalone Vitest config. It DOES load the React plugin (component tests need
// JSX transformed) but still skips the app's Tailwind/PWA plugins.
//
// The default environment stays "node": tier-1 tests target the pure logic in
// src/lib (validators, migrations, id minting, backup/restore) and a fake
// `window.localStorage` is installed per-test where storage is exercised (see
// backup.test.ts). Those are the bulk of the suite and they stay fast.
//
// Component tests opt IN per-file with a docblock rather than flipping the
// whole suite to jsdom:
//
//     // @vitest-environment jsdom
//
// See InitiativeWidget.addPaths.test.tsx. Keep it that way — a global jsdom
// env would tax every pure-logic file with a DOM setup none of them need.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
