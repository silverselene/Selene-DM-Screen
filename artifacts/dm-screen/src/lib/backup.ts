// Full-snapshot backup/restore. Operates on every localStorage key that
// matches the `dm-` prefix — so any state we add later (new widgets,
// versioned key bumps) is included automatically without updating this
// module.
//
// Restore replaces all existing `dm-*` keys with the imported set, then
// reloads the page. Reload is the simplest way to get every widget to
// pick up its new state, because most of them only read localStorage in
// their `useLocalStorage` initializer.
//
// Imported values are validated against a per-key registry below. Known
// keys get shape-checked + clamped; unknown `dm-*` keys are accepted only
// if they're JSON-parseable and under a per-value byte cap (so a future
// app version's backup round-trips through an older importer). Values
// that fail validation are skipped, not fatal — the rest of the import
// proceeds and the caller is told which keys were dropped.

import type { PlayerCharacter, TileEntry } from "@/types";
import { PLACEABLE_WIDGET_TYPES, WIDGET_TYPES, type WidgetType } from "@/types";
import { MAX_PARTY, normalizePartyBatch } from "@/lib/partyStore";
import {
  MAX_COMBATANTS,
  mintCombatantId,
  validateCombatants,
  validateInitiativeActiveId,
} from "@/lib/combatant";
import { parseEnvelopeHead } from "@/lib/envelope";
import { flushPendingWrites } from "@/lib/pendingWrites";

// Re-export so call sites that already import widget constants /
// validators from `@/lib/backup` keep working unchanged.
export { WIDGET_TYPES };
export { mintCombatantId, validateCombatants, validateInitiativeActiveId };
export { MAX_COMBATANTS, MAX_PARTY };

const KEY_PREFIX = "dm-";

// Hard caps. Sized to defend against quota-exhaustion / pathological-input
// attacks without rejecting realistic backups. localStorage is typically
// capped at ~5 MB per origin (iOS Safari is the floor); these stay well
// under that with headroom for the existing state we're replacing.
const MAX_PER_VALUE_BYTES = 1_000_000; // 1 MB — Notepad at 1 MB is ~150k words
// Cap for the RAW stored string (the JSON-wrapped form), which is always
// longer than the inner value it holds: `JSON.stringify` adds surrounding
// quotes plus per-character escapes (`\n`, `\"`, `\uXXXX`, …). A fixed +100 KB
// headroom only covered notes where <10% of characters escape; a session log
// that is mostly short/blank lines (each `\n` doubles to `\n`) can escape far
// more, pushing the wrapped form past the cap so a legit ~1 MB Notepad exports
// fine but is dropped on import. Allow 2× the inner cap — enough for a note
// that is 100% two-char escapes (all newlines/quotes), which no real prose
// approaches — while staying comfortably under `MAX_TOTAL_BYTES`.
const MAX_RAW_VALUE_BYTES = MAX_PER_VALUE_BYTES * 2;
const MAX_TOTAL_BYTES = 4_000_000;     // 4 MB
const MAX_KEYS = 200;                  // current key count is ~33
const MAX_KEY_LENGTH = 200;

interface FullBackupEnvelope {
  schema: "selene-dm-full";
  version: 1;
  exportedAt: string;
  /** Snapshot of every key that matched KEY_PREFIX. Values are stored as
   *  the raw localStorage strings (always JSON-serialized in this app), so
   *  the export is a string→string map. */
  keys: Record<string, string>;
}

function readAllDmKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith(KEY_PREFIX)) continue;
    const v = window.localStorage.getItem(k);
    if (v != null) out[k] = v;
  }
  return out;
}

function listDmKeyNames(): string[] {
  const out: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(KEY_PREFIX)) out.push(k);
  }
  return out;
}

function byteSize(map: Record<string, string>): number {
  let total = 0;
  for (const [k, v] of Object.entries(map)) total += k.length + v.length;
  return total;
}

const IMPORT_PROBE_KEY = "dm-__import_probe__";

/**
 * Prove the validated payload can be written BEFORE the commit wipes the
 * current state, so an over-quota import fails without touching the DM's
 * data instead of half-restoring it.
 *
 * Storage currently holds `currentBytes` of `dm-*` data that, by
 * definition, fits. The commit frees all of it, then writes `newBytes`.
 * If `newBytes <= currentBytes` the write is guaranteed to fit — we free
 * at least what we write, so no probe is needed. If the import is larger,
 * probe only the DELTA: write one temporary key of that extra size
 * alongside the existing state; if `currentBytes + delta` fits, then
 * `newBytes` fits after the wipe. `byteSize` counts UTF-16 code units
 * (`k.length + v.length`), which is how browsers meter the quota, so a
 * one-char-per-unit probe string matches the accounting.
 *
 * localStorage has no real transaction, so this pre-flight plus the
 * snapshot rollback in `commit`/`rollback` is best-effort, not a hard
 * atomicity guarantee — but it closes the common quota-failure window.
 */
function preflightQuota(currentBytes: number, newBytes: number): void {
  const delta = newBytes - currentBytes;
  if (delta <= 0) return;
  try {
    // +1 char of headroom; the probe key name itself is negligible next to
    // the multi-hundred-KB payloads this guards.
    window.localStorage.setItem(IMPORT_PROBE_KEY, "x".repeat(delta + 1));
  } catch {
    throw new Error(
      "Not enough browser storage to import this backup. Free up space " +
        "(or clear other sites' data) and try again — your current data " +
        "has been left untouched.",
    );
  } finally {
    window.localStorage.removeItem(IMPORT_PROBE_KEY);
  }
}

/** Parse + validate an envelope without touching storage. Throws on a
 *  malformed file using the same error messages as the importer. */
function parseEnvelope(text: string): FullBackupEnvelope {
  const env = parseEnvelopeHead(text, "selene-dm-full", "full backup");
  if (!env.keys || typeof env.keys !== "object") {
    throw new Error(
      "This backup file is incomplete or corrupted. Try exporting a fresh backup.",
    );
  }
  return env as unknown as FullBackupEnvelope;
}

// ── Core shape validators (operate on already-parsed values) ─────────────
// These are the canonical "is this stored shape valid?" checks for each
// widget's state. They're exported so the same defense can run on the
// READ path (`useLocalStorage`) — not only at backup-import time — so
// DevTools edits, service-worker cache mismatches, and future write bugs
// can't strand a widget on a malformed value.
//
// Convention: return the cleaned value if salvageable, or `undefined` to
// mean "fall back to default." `undefined` (not `null`) is the sentinel
// so validators of nullable types (e.g. `validateInitiativeActiveId`,
// `T = string | null`) can return `null` as a legitimate cleaned value
// without colliding with the rejection signal. Cores never throw.

export type ShapeValidator<T> = (parsed: unknown) => T | undefined;

export const MAX_TILES = 16; // grid is 2-4 × 2-4
// MAX_PARTY lives in partyStore.ts (re-exported above) so the store's own
// write paths can enforce the same cap this importer validates against.

export function validateBoundedInt(
  min: number,
  max: number,
): ShapeValidator<number> {
  return (parsed) => {
    if (typeof parsed !== "number") return undefined;
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return undefined;
    if (parsed < min || parsed > max) return undefined;
    return parsed;
  };
}

export function validateEnum<T extends string>(
  allowed: readonly T[],
): ShapeValidator<T> {
  return (parsed) => {
    if (typeof parsed !== "string") return undefined;
    if (!(allowed as readonly string[]).includes(parsed)) return undefined;
    return parsed as T;
  };
}

export function validateArrayOfEnum<T extends string>(
  allowed: readonly T[],
  maxLen: number,
): ShapeValidator<T[]> {
  return (parsed) => {
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .filter(
        (x): x is T =>
          typeof x === "string" && (allowed as readonly string[]).includes(x),
      )
      .slice(0, maxLen);
  };
}

export function validateStringMax(maxLen: number): ShapeValidator<string> {
  return (parsed) => {
    if (typeof parsed !== "string" || parsed.length > maxLen) return undefined;
    return parsed;
  };
}

// For nullable-string keys ("selected entry" persistence, where `null`
// means nothing selected). `null` is a legitimate cleaned value here —
// `undefined` stays the rejection sentinel, per the ShapeValidator
// convention above.
export function validateNullableStringMax(
  maxLen: number,
): ShapeValidator<string | null> {
  return (parsed) => {
    if (parsed === null) return null;
    if (typeof parsed !== "string" || parsed.length > maxLen) return undefined;
    return parsed;
  };
}

// The per-value byte cap, exported so widgets (e.g. Notepad) can defend
// their READ path with the same limit the import path enforces.
export const NOTEPAD_MAX_CHARS = MAX_PER_VALUE_BYTES;

export function validateTiles(parsed: unknown): TileEntry[] | undefined {
  if (!Array.isArray(parsed) || parsed.length > MAX_TILES) return undefined;
  return parsed.map((entry: unknown): TileEntry => {
    if (entry === null) return null;
    if (!entry || typeof entry !== "object") {
      return { widget: "empty", colSpan: 1, rowSpan: 1 };
    }
    const e = entry as { widget?: unknown; colSpan?: unknown; rowSpan?: unknown };
    const widget: WidgetType =
      typeof e.widget === "string" &&
      (WIDGET_TYPES as readonly string[]).includes(e.widget)
        ? (e.widget as WidgetType)
        : "empty";
    const colSpan: 1 | 2 = e.colSpan === 2 ? 2 : 1;
    const rowSpan: 1 | 2 = e.rowSpan === 2 ? 2 : 1;
    return { widget, colSpan, rowSpan };
  });
}

export function validateParty(parsed: unknown): PlayerCharacter[] | undefined {
  if (!Array.isArray(parsed)) return undefined;
  if (parsed.length > MAX_PARTY) {
    // Hostile-input defense that would otherwise silently eat legitimate
    // rows: `addCharacter` refuses at MAX_PARTY so stored state should
    // never exceed it, but warn if an oversized roster reaches us (old
    // pre-cap state, hand-edited backup) so the drop is diagnosable.
    console.warn(
      `validateParty: dropping ${parsed.length - MAX_PARTY} characters beyond the ${MAX_PARTY} cap`,
    );
  }
  return normalizePartyBatch(parsed.slice(0, MAX_PARTY));
}

// ── Per-key import-path validators ───────────────────────────────────────
// `KeyValidator` is the import-path signature: raw stored string in → raw
// stored string out (or `undefined` to skip). Each one wraps a
// `ShapeValidator` from above with JSON.parse + JSON.stringify so
// backup-import and localStorage-read share the same shape-check logic.

type KeyValidator = (raw: string) => string | undefined;

function lift<T>(core: ShapeValidator<T>): KeyValidator {
  return (raw) => {
    try {
      const validated = core(JSON.parse(raw));
      return validated === undefined ? undefined : JSON.stringify(validated);
    } catch {
      return undefined;
    }
  };
}

// Bare-string enum (NOT JSON-wrapped). Used for `dm-theme`, the only key
// written via direct `localStorage.setItem` rather than through
// `useLocalStorage` / `JSON.stringify`.
function bareEnum(allowed: readonly string[]): KeyValidator {
  return (raw) => (allowed.includes(raw) ? raw : undefined);
}

// Generic forward-compat validator for `dm-*` keys not in the registry.
// Accepts any value under the per-value byte cap so that a backup taken
// from a future version round-trips through this importer (the future
// widget can read its own data; today's widgets don't see it). This
// deliberately does NOT require JSON-parseability: `dm-theme` set a
// precedent for bare-string values (written via direct `setItem`, not
// `useLocalStorage`), so a future key that copies that pattern must
// still round-trip — a JSON gate here would silently drop it on import.
// The size cap is the real defense; these values only ever go back into
// localStorage, never into object merges or render paths.
function unknownKeyValidator(raw: string): string | undefined {
  if (raw.length > MAX_RAW_VALUE_BYTES) return undefined;
  return raw;
}

// Initiative widget's add-mode tab selector. Exported so the widget can
// validate its own reads against the same allowlist.
export const INITIATIVE_MODES = ["player", "monster", "party"] as const;
export type InitiativeMode = (typeof INITIATIVE_MODES)[number];

// Widget enum allowlists. Defined here (not in the widgets) for the same
// reason as INITIATIVE_MODES: the import path below and each widget's
// read path must validate against the SAME list, and the widgets already
// import from this module.
export const ORACLE_TABS = ["names", "loot", "items", "places"] as const;
export type OracleTab = (typeof ORACLE_TABS)[number];
export const BESTIARY_SORT_MODES = ["alpha", "cr"] as const;
export type BestiarySortMode = (typeof BESTIARY_SORT_MODES)[number];
export const BESTIARY_CR_FILTERS = [
  "All", "0–1", "2–4", "5–10", "11–16", "17+",
] as const;
export type BestiaryCrFilter = (typeof BESTIARY_CR_FILTERS)[number];

// Caps for widget UI-state strings. Search queries / combobox picks /
// selected-entry names are all short in practice; these are generous
// ceilings so a hand-edited or hostile value can't smuggle megabytes
// into a key every widget mount re-reads.
export const WIDGET_QUERY_MAX = 200;

// Oracle roll history: 5 entries kept per tab today; validate with
// headroom so a future "keep more history" bump doesn't invalidate
// existing stored state.
const ORACLE_HISTORY_MAX_ENTRIES = 10;
const ORACLE_HISTORY_MAX_CHARS = 1_000;

export function validateOracleHistory(
  parsed: unknown,
): Record<OracleTab, string[]> | undefined {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const obj = parsed as Record<string, unknown>;
  const out = {} as Record<OracleTab, string[]>;
  for (const tab of ORACLE_TABS) {
    const entries = obj[tab];
    out[tab] = Array.isArray(entries)
      ? entries
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.slice(0, ORACLE_HISTORY_MAX_CHARS))
          .slice(0, ORACLE_HISTORY_MAX_ENTRIES)
      : [];
  }
  return out;
}

// Registry of known keys with strict validators. Everything else with the
// `dm-` prefix falls through to `unknownKeyValidator`.
const KEY_VALIDATORS: Record<string, KeyValidator> = {
  // App grid / layout
  "dm-grid-cols": lift(validateBoundedInt(2, 4)),
  "dm-grid-rows": lift(validateBoundedInt(2, 4)),
  "dm-tiles-v3": lift(validateTiles),
  "dm-recent-widgets": lift(validateArrayOfEnum(PLACEABLE_WIDGET_TYPES, MAX_TILES)),

  // Theme — bare string, NOT JSON-stringified (written via direct setItem
  // by ThemeContext)
  "dm-theme": bareEnum(["dark", "light"]),

  // Notepad — capped to defend against quota-exhaustion attack
  "dm-notepad": lift(validateStringMax(MAX_PER_VALUE_BYTES)),

  // Party + Initiative (the keys whose contents flow into stat-block math)
  "dm-party-v1": lift(validateParty),
  "dm-initiative-v1": lift(validateCombatants),
  // Legacy turn-index key — kept in the registry so backups written by
  // older builds still shape-check on import. The runtime no longer
  // reads it; `migrateTurnIndexToActiveId` (src/lib/migrations.ts, run
  // at boot from main.tsx) converts it to `dm-initiative-active-id-v1`
  // on next page load.
  "dm-initiative-turn-v1": lift(validateBoundedInt(0, 999)),
  "dm-initiative-active-id-v1": lift(validateInitiativeActiveId),
  "dm-round-v1": lift(validateBoundedInt(1, 9999)),
  "dm-initiative-mode-v1": lift(validateEnum(INITIATIVE_MODES)),

  // Per-widget UI state (queries, filters, selections, roll history).
  // These never feed stat-block math, but they DO feed unguarded
  // expressions on the read path (`query.toLowerCase()`, `history[tab]`),
  // so an unvalidated import could plant a value that throws on every
  // render — a permanently crash-looping tile the ErrorBoundary's
  // "Reload app" can't heal. Each entry pairs with the same validator at
  // the widget's `useLocalStorage` call site.
  "dm-bestiary-query-v1": lift(validateStringMax(WIDGET_QUERY_MAX)),
  "dm-bestiary-selected-v1": lift(validateNullableStringMax(WIDGET_QUERY_MAX)),
  "dm-bestiary-sort-v1": lift(validateEnum(BESTIARY_SORT_MODES)),
  "dm-bestiary-cr-v1": lift(validateEnum(BESTIARY_CR_FILTERS)),
  "dm-tome-query-v1": lift(validateStringMax(WIDGET_QUERY_MAX)),
  "dm-tome-level-v1": lift(validateBoundedInt(-1, 9)), // -1 = "all levels"
  "dm-tome-class-v1": lift(validateStringMax(WIDGET_QUERY_MAX)),
  "dm-tome-school-v1": lift(validateStringMax(WIDGET_QUERY_MAX)),
  "dm-tome-selected-v1": lift(validateNullableStringMax(WIDGET_QUERY_MAX)),
  "dm-compendium-query-v1": lift(validateStringMax(WIDGET_QUERY_MAX)),
  "dm-compendium-category-v1": lift(validateStringMax(WIDGET_QUERY_MAX)),
  "dm-compendium-entry-v1": lift(validateNullableStringMax(WIDGET_QUERY_MAX)),
  "dm-oracle-tab-v1": lift(validateEnum(ORACLE_TABS)),
  "dm-oracle-race-v1": lift(validateStringMax(WIDGET_QUERY_MAX)),
  "dm-oracle-cr-v1": lift(validateStringMax(WIDGET_QUERY_MAX)),
  "dm-oracle-settlement-v1": lift(validateStringMax(WIDGET_QUERY_MAX)),
  "dm-oracle-history-v2": lift(validateOracleHistory),
};

function validatorFor(key: string): KeyValidator {
  return KEY_VALIDATORS[key] ?? unknownKeyValidator;
}

// Atomic key groups: if any member fails per-key validation, the
// surviving members are also dropped so consumers see a consistent
// state. Today's only group is the grid-layout triple — `dm-grid-cols`
// and `dm-grid-rows` size the CSS grid; `dm-tiles-v3` holds the per-cell
// widget placement. Keeping a tiles array against defaulted cols/rows
// leaves stray un-rendered tiles or under-rendered cells.
//
// Keys MISSING from the envelope entirely (legitimate older / forward-
// compat format) do NOT trigger the drop — we only enforce atomicity
// when we've seen evidence of malformed data (a member in `skipped`).
const ATOMIC_KEY_GROUPS: readonly (readonly string[])[] = [
  ["dm-grid-cols", "dm-grid-rows", "dm-tiles-v3"],
];

interface ValidatedPair {
  key: string;
  value: string;
}

interface ValidationResult {
  pairs: ValidatedPair[];
  skipped: string[];
  bytes: number;
}

/** Run every importable key through its validator. Skipped keys are
 *  reported but not fatal. Throws only on the hard caps (key count,
 *  total bytes, key length) — those represent payloads we won't even
 *  consider, not legitimate v2 data. */
function validateEnvelope(env: FullBackupEnvelope): ValidationResult {
  // Only `dm-*` keys are ever written to localStorage; everything else in
  // the envelope is forward-compat / sibling metadata that we silently
  // ignore. Filter first so the MAX_KEYS cap counts what's actually
  // going to be applied — otherwise a backup with a few `dm-*` keys plus
  // hundreds of unrelated keys gets rejected by an unrelated cap.
  const dmEntries = Object.entries(env.keys).filter(([k]) =>
    k.startsWith(KEY_PREFIX),
  );
  if (dmEntries.length > MAX_KEYS) {
    throw new Error(
      `This backup has too many items to import (${dmEntries.length}; max ${MAX_KEYS}). It may be corrupted.`,
    );
  }
  const pairs: ValidatedPair[] = [];
  const skipped: string[] = [];
  for (const [key, rawValue] of dmEntries) {
    if (key.length > MAX_KEY_LENGTH) {
      skipped.push(key.slice(0, 40) + "…");
      continue;
    }
    if (typeof rawValue !== "string") {
      skipped.push(key);
      continue;
    }
    if (rawValue.length > MAX_RAW_VALUE_BYTES) {
      skipped.push(key);
      continue;
    }
    const validate = validatorFor(key);
    const cleaned = validate(rawValue);
    if (cleaned === undefined) {
      skipped.push(key);
      continue;
    }
    pairs.push({ key, value: cleaned });
  }

  // Evict every member of a group from `pairs` and mark it skipped, so the
  // consumer never sees a half-applied group.
  const evictGroup = (group: readonly string[]) => {
    for (const k of group) {
      const idx = pairs.findIndex((p) => p.key === k);
      if (idx >= 0) pairs.splice(idx, 1);
      if (!skipped.includes(k)) skipped.push(k);
    }
  };

  // Enforce atomic-group invariants. If any group member is in `skipped`
  // (failed validation), evict the surviving members too.
  for (const group of ATOMIC_KEY_GROUPS) {
    if (group.some((k) => skipped.includes(k))) evictGroup(group);
  }

  // Cross-field consistency for the grid triple: each member can be
  // individually valid yet mutually inconsistent (a hand-edited backup with
  // `cols: 4, rows: 4` but a 9-element `tiles` array). App's `dm-tiles-v3`
  // default is a fixed 3×3, so dropping only `tiles` would leave it mismatched
  // against the imported cols/rows — evict the whole triple so all three fall
  // back to their consistent defaults instead of rendering blank/overrun cells.
  const gridPair = (key: string) => pairs.find((p) => p.key === key)?.value;
  const colsRaw = gridPair("dm-grid-cols");
  const rowsRaw = gridPair("dm-grid-rows");
  const tilesRaw = gridPair("dm-tiles-v3");
  if (colsRaw !== undefined && rowsRaw !== undefined && tilesRaw !== undefined) {
    try {
      const cols = JSON.parse(colsRaw) as number;
      const rows = JSON.parse(rowsRaw) as number;
      const tiles = JSON.parse(tilesRaw) as unknown[];
      if (Array.isArray(tiles) && tiles.length !== cols * rows) {
        evictGroup(["dm-grid-cols", "dm-grid-rows", "dm-tiles-v3"]);
      }
    } catch {
      // Values already passed their per-key validators, so a parse throw here
      // is not expected; evict the triple defensively if it somehow happens.
      evictGroup(["dm-grid-cols", "dm-grid-rows", "dm-tiles-v3"]);
    }
  }

  let bytes = 0;
  for (const { key, value } of pairs) bytes += key.length + value.length;
  if (bytes > MAX_TOTAL_BYTES) {
    throw new Error(
      `This backup is too large to import (${(bytes / 1_000_000).toFixed(2)} MB; max ${MAX_TOTAL_BYTES / 1_000_000} MB). It may be corrupted.`,
    );
  }
  return { pairs, skipped, bytes };
}

export function exportFullBackupAsJson(): string {
  // Land any debounced widget writes (e.g. the Notepad's 300 ms-deferred
  // note) before sweeping: this function reads localStorage directly, so
  // a pending write would otherwise be silently absent from the backup.
  flushPendingWrites();
  const env: FullBackupEnvelope = {
    schema: "selene-dm-full",
    version: 1,
    exportedAt: new Date().toISOString(),
    keys: readAllDmKeys(),
  };
  return JSON.stringify(env, null, 2);
}

export interface BackupSummary {
  /** Number of keys that pass validation and will be written. */
  accepted: number;
  /** Keys that fail validation and will be skipped (malformed values,
   *  unrecognized shapes, oversized blobs). The corresponding widgets
   *  fall back to defaults. */
  skipped: string[];
  /** Total bytes the import will write (sum of key + value lengths). */
  bytes: number;
  /** Total bytes the commit will replace. Frozen at prepare time, so it
   *  matches what the commit actually wipes — `dm-*` keys added by other
   *  tabs between prepare and commit are preserved, not silently
   *  destroyed. */
  currentBytes: number;
  /** When the file was exported. */
  exportedAt: string;
}

export interface ImportResult {
  /** Number of keys written. */
  written: number;
  /** Keys that were skipped because their values failed validation. */
  skipped: string[];
}

export interface PreparedImport {
  /** What the commit will do, computed once at prepare time. */
  summary: BackupSummary;
  /** Apply the import. Pre-flights the payload against the storage quota
   *  (so an over-quota import aborts before touching anything), then wipes
   *  exactly the `dm-*` keys present at `prepareImport` time and writes the
   *  validated pairs. Best-effort atomic: rolls back to the pre-import
   *  snapshot if a write throws (localStorage has no true transaction, so
   *  a failure that also defeats the rollback re-write is surfaced as an
   *  explicit unrecoverable error). Caller reloads the page after success
   *  so widgets pick up the restored state. */
  commit: () => ImportResult;
}

/** Two-phase import: validate + snapshot now, commit later (after the
 *  user confirms). Closes the TOCTOU window between summary-time and
 *  commit-time — the summary's `currentBytes` matches what the commit
 *  wipes, and the validated pairs (including any Math.random-generated
 *  ids) are captured in closure so the commit can't drift from what the
 *  user agreed to. Throws on a malformed envelope or hard-cap
 *  violation; bad individual values are reported via `summary.skipped`,
 *  not thrown.
 *
 *  Caveat — multi-tab: the snapshot is read at `prepareImport` time.
 *  Any `dm-*` mutations another tab makes between prepare and commit
 *  will be wiped on the commit's `removeItem` sweep AND, on the
 *  rollback path, will not be restored (rollback uses the same
 *  prepare-time snapshot). DMs are assumed to run a single tab; cross-
 *  tab last-write-wins is already documented in the per-key model. */
export function prepareImport(text: string): PreparedImport {
  const env = parseEnvelope(text);
  const { pairs, skipped, bytes } = validateEnvelope(env);

  // Land any debounced widget writes before snapshotting, for two
  // reasons: (a) the rollback path restores THIS snapshot, so a pending
  // write missing from it would be lost even when the import is safely
  // rolled back; (b) flushing now clears `writePending`, so the reload
  // after commit can't fire a pagehide flush that re-writes a stale
  // in-memory value over the freshly imported one.
  flushPendingWrites();

  // Snapshot existing state in memory NOW so the commit (a) wipes exactly
  // what the summary measured, and (b) can roll back to it if a write
  // throws. Captured by both the BackupSummary above and the commit
  // closure below — single source of truth.
  const snapshot = readAllDmKeys();
  const currentBytes = byteSize(snapshot);

  const summary: BackupSummary = {
    accepted: pairs.length,
    skipped,
    bytes,
    currentBytes,
    exportedAt: env.exportedAt,
  };

  const commit = (): ImportResult => {
    // Prove the payload fits before wiping anything. Throws (leaving the
    // current state untouched) if it can't — no wipe, no partial write.
    preflightQuota(currentBytes, bytes);
    try {
      for (const k of Object.keys(snapshot)) {
        window.localStorage.removeItem(k);
      }
      for (const { key, value } of pairs) {
        window.localStorage.setItem(key, value);
      }
      return { written: pairs.length, skipped };
    } catch (err) {
      rollback(snapshot, err);
    }
  };

  return { summary, commit };
}

/** Restore the snapshot, then throw a user-facing error. Never returns
 *  normally — the call expression is `never`. */
function rollback(snapshot: Record<string, string>, originalErr: unknown): never {
  let rollbackErr: unknown = null;
  try {
    // Clear whatever's in storage now (could be a partial import, or the
    // already-wiped state) and re-write the snapshot from scratch.
    for (const k of listDmKeyNames()) window.localStorage.removeItem(k);
    for (const [k, v] of Object.entries(snapshot)) {
      window.localStorage.setItem(k, v);
    }
  } catch (e) {
    rollbackErr = e;
  }

  const origMsg =
    originalErr instanceof Error ? originalErr.message : String(originalErr);
  if (rollbackErr) {
    const rbMsg =
      rollbackErr instanceof Error
        ? rollbackErr.message
        : String(rollbackErr);
    throw new Error(
      `Restore failed AND rollback failed — your data may now be in an inconsistent state. ` +
        `Do not reload the page; export what you can from any open tab. ` +
        `(Original: ${origMsg}. Rollback: ${rbMsg}.)`,
    );
  }
  throw new Error(
    `Restore failed — your previous data has been restored unchanged. ` +
      `The backup may exceed your browser's localStorage quota (typically ~5 MB). ` +
      `(${origMsg})`,
  );
}

// ── DOM helpers used by both export buttons ───────────────────────────────

export function downloadJsonFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Revoke on a generous timer, NOT on the next animation frame: engines
  // may start a blob download asynchronously (Safari historically), and a
  // one-frame revoke can race it into a zero-byte or failed file — the
  // worst possible failure for a *backup*, and invisible until the DM
  // tries to restore. The cost of the wait is a few MB of blob memory
  // pinned for a minute per export; the pre-revoke pagehide sweep keeps a
  // quickly-closed tab from leaking it. `revoke` also detaches itself
  // from `pagehide`: `{ once: true }` only auto-removes when pagehide
  // actually fires, so on the normal timer path each export would
  // otherwise leave a dangling listener behind for the life of the tab.
  const revoke = () => {
    window.removeEventListener("pagehide", revoke);
    URL.revokeObjectURL(url);
  };
  window.setTimeout(revoke, 60_000);
  window.addEventListener("pagehide", revoke, { once: true });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Open a native file picker and resolve with the text contents. Rejects
 *  with a DOMException whose `name === "AbortError"` if the user cancels
 *  the picker (so callers can distinguish cancel from a real read failure
 *  and silently no-op on the former). */
export function promptForJsonFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    document.body.appendChild(input);

    // Settle exactly once. Every exit path (file read, read error, explicit
    // cancel, or the focus fallback below) funnels through here so the
    // Promise can't be left forever-pending and the hidden <input> can't leak.
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      fn();
    };
    const cancel = () =>
      settle(() => reject(new DOMException("Cancelled", "AbortError")));

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        cancel();
        return;
      }
      const reader = new FileReader();
      reader.onload = () => settle(() => resolve(String(reader.result ?? "")));
      reader.onerror = () =>
        settle(() => reject(reader.error ?? new Error("Read failed.")));
      reader.readAsText(file);
    };
    input.oncancel = cancel;

    // Fallback for browsers that fire NEITHER `change` nor `cancel` when the
    // picker is dismissed (a known gap on some engines): the window regains
    // focus as the dialog closes. Defer past the `change` event — which fires
    // first when a file WAS chosen — so a real selection isn't clobbered as a
    // cancel. If a file is present, the `change` handler owns the outcome.
    //
    // Guard against a spurious `focus` that arrives while the picker is STILL
    // open (some engines deliver one when the user alt-tabs back to the
    // browser mid-dialog). While a native file dialog owns focus the page's
    // `document.hasFocus()` is false; only treat this as a dismissal once the
    // page has genuinely regained focus AND no file was chosen — otherwise a
    // later selection would be silently dropped by the premature cancel.
    const onFocus = () => {
      setTimeout(() => {
        if (input.files && input.files.length > 0) return;
        if (!document.hasFocus()) return;
        cancel();
      }, 300);
    };
    window.addEventListener("focus", onFocus);

    input.click();
  });
}
