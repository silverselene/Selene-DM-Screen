import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
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
  plugins: [react(), tailwindcss()],
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
