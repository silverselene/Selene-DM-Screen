import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// PORT and BASE_PATH are both optional. Useful overrides for self-hosters
// behind a reverse proxy or sub-path, but the defaults are sane for a clean
// `pnpm install && pnpm dev` checkout with no environment set.
const DEFAULT_PORT = 38080;
const portEnv = process.env["PORT"];
const port = portEnv ? Number(portEnv) : DEFAULT_PORT;
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${portEnv}"`);
}
const basePath = process.env["BASE_PATH"] ?? "/";

// AI_BRIDGE_PORT is the SAME env var the optional AI bridge reads for its
// listen port (services/ai-bridge/src/config.ts), so a single
// `AI_BRIDGE_PORT=39000 pnpm dev` moves the bridge and the widget in lockstep
// — the root `dev` script runs both processes from one environment. A static
// SPA has no runtime env, so the resulting URL is baked into the bundle via
// the `define` block below (dev, preview, and self-built bundles all honor
// it). The Docker image's CSP additionally pins connect-src to :38900
// (docker/security-headers.conf) — a custom port there needs that edited too.
const DEFAULT_AI_BRIDGE_PORT = 38900;
const bridgePortEnv = process.env["AI_BRIDGE_PORT"];
const aiBridgePort = bridgePortEnv ? Number(bridgePortEnv) : DEFAULT_AI_BRIDGE_PORT;
if (!Number.isFinite(aiBridgePort) || aiBridgePort <= 0) {
  throw new Error(`Invalid AI_BRIDGE_PORT value: "${bridgePortEnv}"`);
}

// Dev/preview servers bind to loopback by default. Running `pnpm dev` on an
// untrusted network (a café, a shared office) shouldn't expose the app — and
// its localStorage origin — to everyone on the LAN, nor disable Vite's
// Host-header check. Set VITE_PUBLIC_HOST=1 to bind 0.0.0.0 and accept any
// Host header (needed behind a reverse proxy, or to reach the dev server from
// another device on a trusted network). The Docker runtime serves via nginx,
// not these servers, so it's unaffected either way.
const publicHost = process.env["VITE_PUBLIC_HOST"] === "1";
const devHost = publicHost ? "0.0.0.0" : "127.0.0.1";
const devAllowedHosts = publicHost ? true : undefined;

export default defineConfig({
  base: basePath,
  define: {
    // Consumed by src/lib/aiBridge.ts (typed in src/vite-env.d.ts). Vitest
    // uses its own config without this define, so that module keeps a
    // fallback to the default URL.
    "import.meta.env.AI_BRIDGE_URL": JSON.stringify(`http://127.0.0.1:${aiBridgePort}`),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Auto-update strategy: when a new SW takes over, it activates on the
      // next page reload. Hashed asset filenames mean stale caches can't
      // strand the DM on an old build — Workbox cleanupOutdatedCaches drops
      // anything not in the new precache manifest.
      registerType: "autoUpdate",
      // Pinned to "script" (external /registerSW.js) rather than "auto"
      // so the CSP can lock script-src to 'self' — an "auto" mode swap
      // to an inline registration would otherwise force `'unsafe-inline'`.
      injectRegister: "script",
      includeAssets: ["favicon.svg", "pwa-icon.svg"],
      manifest: {
        name: "Selene's DM Screen",
        short_name: "DM Screen",
        description:
          "A browser-based dashboard for running D&D 5e (2024) games at the table — bestiary, initiative tracker, spells, party roster, and notes, fully offline after first load.",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#050009",
        theme_color: "#1a0a2e",
        orientation: "any",
        icons: [
          {
            src: "favicon.svg",
            sizes: "64x64",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "pwa-icon.svg",
            sizes: "192x192 512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Precache everything the build emits, plus the bundled data files
        // and Google Fonts on first online visit so the table never needs
        // network.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff,woff2}"],
        // The dm-screen JS bundle is ~1.6 MB, and data-monsters alone is
        // ~4.1 MB now that most of the 2,160-row monster dataset carries a
        // full stat block. Default precache cap is 2 MB — raise well past
        // the current largest chunk (with headroom for the dataset to keep
        // growing) so the bundle plus all the reference data fits in one
        // shot rather than being split across separate runtime caches.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // clientsClaim + skipWaiting are the coherent pair for the
        // `registerType: "autoUpdate"` strategy above: a freshly installed SW
        // skips the "waiting" phase and claims open clients, so the new build
        // takes over on the next page reload instead of stranding a tab on a
        // half-swapped cache. (A previous `skipWaiting: false` here fought the
        // autoUpdate intent and the "activates on reload" comment.)
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split the large bundled reference datasets into their own stable
        // chunks. They're the bulk of the bundle and rarely change, so
        // editing a widget no longer invalidates them in the PWA precache —
        // and each dataset is independent, so regenerating spells doesn't
        // bust the monster-index cache. Combined with the per-widget
        // `React.lazy` chunks (see DMTile), a widget edit only re-downloads
        // that one widget's code.
        manualChunks(id) {
          if (id.includes("/src/data/spells.")) return "data-spells";
          if (id.includes("/src/data/monsters.")) return "data-monsters";
          if (id.includes("/src/data/weapons.")) return "data-weapons";
          if (id.includes("/src/data/compendiumRules.")) return "data-compendium-rules";
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    host: devHost,
    allowedHosts: devAllowedHosts,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: devHost,
    allowedHosts: devAllowedHosts,
  },
});
