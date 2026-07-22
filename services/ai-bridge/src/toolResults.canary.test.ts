import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { parseSheetSpells, parseToolResult } from "./toolResults";

const require = createRequire(import.meta.url);

/**
 * The toolResults parsers are string-scrapers pinned to the plain-text shape
 * ddb-mcp emits. They degrade gracefully (by design) when the format drifts, so
 * a shape change ships silently. There's no way to replay the installed
 * package's *real* output offline (it ships only a README, no fixtures, and real
 * output needs a live DDB session), so these canaries pin the two drift signals
 * we CAN see: the package version the fixtures were captured against, and the
 * exact format boundaries where the parsers are known to degrade.
 */
describe("ddb-mcp output canaries", () => {
  // Bumping @iamjameslennon/ddb-mcp can change the tool-result text shape these
  // parsers scrape. This fails on any version change so a human re-captures
  // sample output and re-verifies toolResults.ts before shipping the bump —
  // update this constant in the same commit once that's done.
  const CAPTURED_DDB_MCP_VERSION = "2.10.2";

  it("is pinned to the ddb-mcp version its fixtures were captured against", () => {
    const { version } = require("@iamjameslennon/ddb-mcp/package.json") as { version: string };
    expect(
      version,
      `ddb-mcp is ${version} but toolResults.ts fixtures are from ${CAPTURED_DDB_MCP_VERSION} — ` +
        `re-capture sample output, re-verify the parsers, then bump CAPTURED_DDB_MCP_VERSION.`,
    ).toBe(CAPTURED_DDB_MCP_VERSION);
  });

  // --- Known degradation boundaries (documented, so a change is visible) ---

  // The level-annotation stripper only removes `(L#…)`; any other parenthetical
  // (e.g. `(at will)`) rides along, so the name won't match the party roster.
  it("KNOWN DRIFT: a non-(L#) spell annotation like (at will) is not stripped", () => {
    const text = ["SPELLS", "  Cantrips: Fire Bolt", "  Spells: Bless (L1), Command (at will)"].join("\n");
    expect(parseSheetSpells(text)).toEqual(["Fire Bolt", "Bless", "Command (at will)"]);
  });

  // The SPELLS scraper is line-anchored to a `Label:` prefix; a wrapped
  // continuation line carries no label and is silently dropped.
  it("KNOWN DRIFT: a wrapped Spells: continuation line is dropped", () => {
    const text = ["SPELLS", "  Spells: Bless (L1),", "    Command (L1)"].join("\n");
    expect(parseSheetSpells(text)).toEqual(["Bless"]);
  });

  // The monster subtitle (type/alignment) is recognized only as ASTERISK italic
  // (`*…*`); an underscore-italic subtitle yields no `type` field (AC still
  // parses, so the card isn't empty — the degradation is partial and quiet).
  it("KNOWN DRIFT: an underscore-italic monster subtitle yields no type field", () => {
    const text = ["# Goblin", "", "_Small humanoid, neutral evil_", "", "**Armor Class** 15"].join("\n");
    const card = parseToolResult("ddb_get_monster", text);
    expect(card?.type).toBe("tool_result");
    expect(card && "fields" in card ? card.fields?.type : undefined).toBeUndefined();
    expect(card && "fields" in card ? card.fields?.ac : undefined).toBe("15");
  });

  // The positive control: an asterisk-italic subtitle IS captured, so the canary
  // above is pinning a real boundary, not a broken parser.
  it("captures an asterisk-italic monster subtitle (control for the drift case)", () => {
    const text = ["# Goblin", "", "*Small humanoid, neutral evil*", "", "**Armor Class** 15"].join("\n");
    const card = parseToolResult("ddb_get_monster", text);
    expect(card && "fields" in card ? card.fields?.type : undefined).toBe("Small humanoid, neutral evil");
  });
});
