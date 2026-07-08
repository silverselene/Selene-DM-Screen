/**
 * ddb-mcp is attached under this server name; the model therefore sees each of
 * its tools as `mcp__dndbeyond__<tool>`.
 */
export const MCP_SERVER_NAME = "dndbeyond";

/**
 * Read-only allowlist of ddb-mcp tools the chat model may call.
 *
 * Attaching ddb-mcp exposes ALL ~35 of its tools to the model, so this list is
 * enforced as a hard permission gate in agent.ts (`canUseTool` denies anything
 * not present here) — it is not merely an auto-approval hint. Every entry is
 * annotated read-only in ddb-mcp's own source (READ_ONLY_NET / READ_ONLY_LOCAL,
 * src/index.ts).
 *
 * Deliberately EXCLUDED (never reachable by the chat model), per the epic's
 * non-goals:
 *   Write / destructive : ddb_login, ddb_close_browser, ddb_clear_cache,
 *                         ddb_download_character, ddb_interact
 *   Browser-driving     : ddb_navigate, ddb_get_page, ddb_search_site
 *   Redundant / verbose : ddb_get_character_raw (use ddb_get_character instead)
 */
export const DDB_READ_TOOLS = [
  // Characters & party
  "ddb_list_characters",
  "ddb_get_character",
  "ddb_character_lookup",
  "ddb_get_party",
  "ddb_get_campaign",
  "ddb_list_campaigns",
  // Monsters
  "ddb_search_monsters",
  "ddb_get_monster",
  // Spells
  "ddb_search_spells",
  "ddb_get_spell",
  // Equipment
  "ddb_search_equipment",
  "ddb_get_equipment",
  // Character options
  "ddb_search_races",
  "ddb_search_classes",
  "ddb_search_backgrounds",
  "ddb_search_feats",
  "ddb_search_class_features",
  "ddb_search_racial_traits",
  // Rules & conditions
  "ddb_search_rules",
  "ddb_get_rules",
  "ddb_get_condition",
  // Owned library / rulebooks
  "ddb_list_library",
  "ddb_read_book",
  // Encounter helpers
  "ddb_rate_encounter",
  "ddb_encounter_cr",
  "ddb_roll_treasure",
] as const;

/** Fully-qualified tool ids as the Agent SDK sees them. */
export const ALLOWED_TOOL_IDS: string[] = DDB_READ_TOOLS.map(
  (t) => `mcp__${MCP_SERVER_NAME}__${t}`,
);

export const ALLOWED_TOOL_SET: ReadonlySet<string> = new Set(ALLOWED_TOOL_IDS);
