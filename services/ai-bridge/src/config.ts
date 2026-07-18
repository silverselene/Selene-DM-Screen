import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Read a TCP port from the environment, failing startup loudly on garbage —
 * matching vite.config.ts, which throws on the same var. A silent fallback
 * here would split the two sides (`AI_BRIDGE_PORT=0` binds an ephemeral port
 * while the SPA bakes in :38900 → permanent "bridge offline" with no error
 * anywhere). Exported for unit tests.
 */
export function envPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid ${name} value: "${raw}" (expected an integer 1–65535)`);
  }
  return n;
}

/**
 * Browser origins allowed to call the bridge (CORS allowlist + hard 403; see
 * server.ts). The defaults cover the SPA's standard origin — dev, preview,
 * and Docker all serve on :38080. Extra origins come from the
 * AI_BRIDGE_ALLOWED_ORIGINS env var (comma-separated), so every documented
 * alternate deploy works: a different SPA port (`PORT=…`) or a reverse proxy
 * just lists its origin, e.g.
 *   AI_BRIDGE_ALLOWED_ORIGINS="http://localhost:5173,https://dm.example.com"
 * Exported for unit tests. Each entry is normalized to match what a browser
 * actually sends in the Origin header: trailing slashes are stripped (an Origin
 * never carries one) and the whole origin is lowercased (browsers lowercase the
 * scheme and host, so a pasted `https://DM.example.com` would otherwise never
 * match).
 */
export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  const defaults = ["http://localhost:38080", "http://127.0.0.1:38080"];
  const extra = (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, "").toLowerCase())
    .filter((s) => s.length > 0);
  return new Set([...defaults, ...extra]);
}

/**
 * Resolve the ddb-mcp stdio entrypoint.
 *
 * By default this points at the bundled npm package `@iamjameslennon/ddb-mcp`
 * (a pinned dependency, installed with the workspace) so users never have to
 * clone and build ddb-mcp themselves. Set DDB_MCP_ENTRY to a path to run against
 * a local clone instead (handy when developing ddb-mcp itself).
 */
function resolveDdbMcpEntry(): string | null {
  const override = process.env.DDB_MCP_ENTRY;
  if (override) return override;
  try {
    // Resolves the package `main`/`bin` (dist/index.js) to an absolute path.
    return require.resolve("@iamjameslennon/ddb-mcp");
  } catch {
    return null;
  }
}

export const config = {
  /**
   * Localhost only — never bind 0.0.0.0. This service can read the DM's
   * D&D Beyond data and spend their Claude subscription; it must not be
   * reachable from the LAN.
   */
  host: "127.0.0.1",
  /**
   * Distinct from the SPA's 38080 so the two never collide when both run.
   */
  port: envPort("AI_BRIDGE_PORT", 38900),
  /**
   * Browser origins allowed to reach the bridge. See parseAllowedOrigins.
   * Note the coupling: changing AI_BRIDGE_PORT also requires the AI Chat
   * widget's BRIDGE_URL (artifacts/dm-screen/src/lib/aiBridge.ts) and, for
   * Docker, the CSP connect-src (docker/security-headers.conf) to follow.
   */
  allowedOrigins: parseAllowedOrigins(process.env.AI_BRIDGE_ALLOWED_ORIGINS),
  /**
   * Absolute path to the ddb-mcp stdio server. Defaults to the bundled
   * `@iamjameslennon/ddb-mcp` npm package; override with DDB_MCP_ENTRY to point
   * at a local clone. `null` only if the package failed to install.
   */
  ddbMcpEntry: resolveDdbMcpEntry(),
  /**
   * Optional model override. Undefined → the Agent SDK / subscription default.
   */
  model: process.env.AI_BRIDGE_MODEL || undefined,
} as const;
