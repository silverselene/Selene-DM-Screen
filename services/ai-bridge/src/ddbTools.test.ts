import { describe, it, expect } from "vitest";
import {
  DDB_READ_TOOLS,
  ALLOWED_TOOL_IDS,
  ALLOWED_TOOL_SET,
  MCP_SERVER_NAME,
  bareToolName,
} from "./ddbTools";

/**
 * ddb-mcp's tool set grows over time; this suite is the regression guard that a
 * future regen (or a copy-paste slip) can't quietly land a write/destructive
 * tool in the model's reach. The allowlist is the ONLY thing standing between
 * the chat model and ddb-mcp's browser-driving / login / download tools.
 */

// Every tool the epic's non-goals forbid the model from ever calling.
const FORBIDDEN_TOOLS = [
  // Write / destructive
  "ddb_login",
  "ddb_close_browser",
  "ddb_clear_cache",
  "ddb_download_character",
  "ddb_interact",
  // Browser-driving
  "ddb_navigate",
  "ddb_get_page",
  "ddb_search_site",
  // Redundant / verbose
  "ddb_get_character_raw",
] as const;

describe("DDB_READ_TOOLS allowlist", () => {
  it("excludes every forbidden write/destructive/browser-driving tool", () => {
    for (const tool of FORBIDDEN_TOOLS) {
      expect(DDB_READ_TOOLS).not.toContain(tool);
    }
  });

  it("includes the core read-only lookups the widget relies on", () => {
    // A representative slice across the categories — not an exhaustive mirror,
    // so adding a new read tool doesn't force a test edit, but dropping one of
    // these load-bearing lookups does.
    for (const tool of [
      "ddb_get_character",
      "ddb_get_monster",
      "ddb_get_spell",
      "ddb_search_rules",
      "ddb_get_condition",
      "ddb_read_book",
    ]) {
      expect(DDB_READ_TOOLS).toContain(tool);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(DDB_READ_TOOLS).size).toBe(DDB_READ_TOOLS.length);
  });
});

describe("ALLOWED_TOOL_SET (the canUseTool gate's authority)", () => {
  it("fully-qualifies every read tool under the ddb-mcp server name", () => {
    expect(ALLOWED_TOOL_IDS).toHaveLength(DDB_READ_TOOLS.length);
    expect(ALLOWED_TOOL_SET.size).toBe(DDB_READ_TOOLS.length);
    for (const tool of DDB_READ_TOOLS) {
      expect(ALLOWED_TOOL_SET.has(`mcp__${MCP_SERVER_NAME}__${tool}`)).toBe(true);
    }
  });

  it("rejects every forbidden tool by its fully-qualified id", () => {
    for (const tool of FORBIDDEN_TOOLS) {
      expect(ALLOWED_TOOL_SET.has(`mcp__${MCP_SERVER_NAME}__${tool}`)).toBe(false);
    }
  });

  it("rejects a bare (unqualified) read-tool name — the gate matches full ids only", () => {
    // canUseTool receives the `mcp__dndbeyond__` prefixed name; a bare name must
    // not match, so the prefix stays load-bearing.
    expect(ALLOWED_TOOL_SET.has("ddb_get_monster")).toBe(false);
  });

  it("rejects the SDK's built-in exec/filesystem tools", () => {
    for (const builtin of ["Bash", "Read", "Write", "Edit"]) {
      expect(ALLOWED_TOOL_SET.has(builtin)).toBe(false);
    }
  });
});

describe("bareToolName", () => {
  it("strips the ddb-mcp server prefix", () => {
    expect(bareToolName(`mcp__${MCP_SERVER_NAME}__ddb_get_monster`)).toBe("ddb_get_monster");
  });

  it("round-trips every allowed id back to its bare tool name", () => {
    for (let i = 0; i < DDB_READ_TOOLS.length; i++) {
      expect(bareToolName(ALLOWED_TOOL_IDS[i])).toBe(DDB_READ_TOOLS[i]);
    }
  });

  it("falls back to a generic mcp prefix strip for another server", () => {
    expect(bareToolName("mcp__other__some_tool")).toBe("some_tool");
  });

  it("leaves a non-mcp name untouched", () => {
    expect(bareToolName("Bash")).toBe("Bash");
  });
});
