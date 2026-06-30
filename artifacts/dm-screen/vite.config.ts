import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// PORT and BASE_PATH are both optional. Useful overrides for self-hosters
// behind a reverse proxy or sub-path, but the defaults are sane for a clean
// `pnpm install && pnpm dev` checkout with no environment set.
const DEFAULT_PORT = 5173;
const portEnv = process.env["PORT"];
const port = portEnv ? Number(portEnv) : DEFAULT_PORT;
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${portEnv}"`);
}
const basePath = process.env["BASE_PATH"] ?? "/";

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
        name: "Legendary DM Screen",
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
        // The dm-screen JS bundle is ~1.6 MB. Default precache cap is 2 MB —
        // raise to 4 MB so the bundle plus all the reference data fits in
        // one shot rather than being split across separate runtime caches.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
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
          if (id.includes("/src/data/monsterIndex.")) return "data-monster-index";
          if (id.includes("/src/data/bestiary.")) return "data-bestiary";
          if (id.includes("/src/data/weapons.")) return "data-weapons";
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
