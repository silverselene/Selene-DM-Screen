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
      injectRegister: "auto",
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
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
