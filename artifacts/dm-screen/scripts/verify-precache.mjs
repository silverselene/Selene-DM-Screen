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

// Guard the AI-bridge URL define. src/lib/aiBridge.ts reads the bridge address
// from `import.meta.env.AI_BRIDGE_URL`, injected by the `define` block in
// vite.config.ts (Vitest has no define and falls back). That `import.meta.env`
// define is a finicky Vite/esbuild interaction: if a future Vite change stops
// honoring it, the token resolves to `undefined ?? fallback` and the documented
// `AI_BRIDGE_PORT` override silently no-ops in the shipped bundle. Assert the
// baked URL is actually present so that breakage fails the build instead of
// shipping. (The unit test in aiBridge.test.ts only covers the fallback path.)
// Scan every JS asset rather than a single named chunk. Which chunk carries
// the URL is Rollup's call, not ours: `data-*` above is a name we declare in
// manualChunks, but the AI-chat chunk's name is derived from the lazy import,
// and aiBridge.ts lands in a shared chunk the moment a second module imports
// it at runtime. Neither is the invariant we care about — that's simply "the
// define injected the URL somewhere in the shipped bundle".
const jsAssets = assets.filter((f) => f.endsWith(".js"));
const bakedIn = jsAssets.filter((f) =>
  /https?:\/\/127\.0\.0\.1:\d+/.test(readFileSync(path.join(dist, "assets", f), "utf8")),
);
if (bakedIn.length === 0) {
  console.error(
    "verify-precache: no baked bridge URL (http://127.0.0.1:<port>) found in any of the " +
      `${jsAssets.length} JS assets — the AI_BRIDGE_URL define in vite.config.ts may have ` +
      "stopped injecting.",
  );
  process.exit(1);
}
console.log(`verify-precache: AI-bridge URL define is baked into ${bakedIn.join(", ")}.`);
