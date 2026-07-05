// Post-build guard for the PWA precache. vite-plugin-pwa's
// `maximumFileSizeToCacheInBytes` cap (vite.config.ts) EXCLUDES oversized
// files from sw.js with only a build-time warning — the build stays green,
// online use keeps working, and the widget breaks *offline-only*, i.e. at
// the table with no wifi, the exact scenario the PWA exists for. If a
// dataset regeneration ever pushes a `data-*` chunk past the cap, fail the
// build here instead of shipping a silently-degraded precache.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const dist = path.resolve(import.meta.dirname, "..", "dist", "public");

let assets;
try {
  assets = readdirSync(path.join(dist, "assets"));
} catch {
  console.error("verify-precache: dist/public/assets not found — run after `vite build`.");
  process.exit(1);
}

const dataChunks = assets.filter((f) => f.startsWith("data-") && f.endsWith(".js"));
if (dataChunks.length === 0) {
  // The manualChunks config names the four dataset chunks `data-*`; none
  // found means the chunking strategy changed and this guard needs updating
  // alongside it — fail loudly rather than pass vacuously.
  console.error("verify-precache: no assets/data-*.js chunks found — did the manualChunks naming change?");
  process.exit(1);
}

const sw = readFileSync(path.join(dist, "sw.js"), "utf8");
const missing = dataChunks.filter((f) => !sw.includes(f));
if (missing.length > 0) {
  console.error(
    `verify-precache: ${missing.length} dataset chunk(s) missing from the service-worker ` +
      "precache manifest (grew past maximumFileSizeToCacheInBytes in vite.config.ts?):\n" +
      missing.map((f) => `  - assets/${f}`).join("\n"),
  );
  process.exit(1);
}

console.log(`verify-precache: all ${dataChunks.length} dataset chunks are precached.`);
