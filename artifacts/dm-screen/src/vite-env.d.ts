/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Injected by the `define` block in vite.config.ts — the AI bridge's URL,
   *  derived from the AI_BRIDGE_PORT env var at dev/build time. Optional
   *  because the standalone Vitest config doesn't define it; the consumer
   *  (src/lib/aiBridge.ts) falls back to the default bridge address. */
  readonly AI_BRIDGE_URL?: string;
}
