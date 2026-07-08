import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
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
  port: envInt("AI_BRIDGE_PORT", 38900),
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
