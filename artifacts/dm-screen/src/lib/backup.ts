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
import { WIDGET_TYPES, type WidgetType } from "@/types";
import { normalizePartyBatch } from "@/lib/partyStore";
import { validateCombatants, validateInitiativeActiveId } from "@/lib/combatant";
import { parseEnvelopeHead } from "@/lib/envelope";

// Re-export so call sites that already import widget constants /
// validators from `@/lib/backup` keep working unchanged.
export { WIDGET_TYPES };
export { validateCombatants, validateInitiativeActiveId };

const KEY_PREFIX = "dm-";

// Hard caps. Sized to defend against quota-exhaustion / pathological-input
// attacks without rejecting realistic backups. localStorage is typically
// capped at ~5 MB per origin (iOS Safari is the floor); these stay well
// under that with headroom for the existing state we're replacing.
const MAX_PER_VALUE_BYTES = 1_000_000; // 1 MB — Notepad at 1 MB is ~150k words
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

/** Parse + validate an envelope without touching storage. Throws on a
 *  malformed file using the same error messages as the importer. */
function parseEnvelope(text: string): FullBackupEnvelope {
  const env = parseEnvelopeHead(text, "selene-dm-full", "full backup");
  if (!env.keys || typeof env.keys !== "object") {
    throw new Error("Envelope is missing a `keys` map.");
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
export const MAX_PARTY = 50;

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

function validateStringMax(maxLen: number): ShapeValidator<string> {
  return (parsed) => {
    if (typeof parsed !== "string" || parsed.length > maxLen) return undefined;
    return parsed;
  };
}

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
// Accepts any JSON-parseable value under the per-value byte cap so that a
// backup taken from a future version round-trips through this importer
// (the future widget can read its own data; today's widgets don't see it).
function unknownKeyValidator(raw: string): string | undefined {
  if (raw.length > MAX_PER_VALUE_BYTES) return undefined;
  try {
    JSON.parse(raw);
  } catch {
    return undefined;
  }
  return raw;
}

// Initiative widget's add-mode tab selector. Exported so the widget can
// validate its own reads against the same allowlist.
export const INITIATIVE_MODES = ["player", "monster", "party"] as const;
export type InitiativeMode = (typeof INITIATIVE_MODES)[number];

// Registry of known keys with strict validators. Everything else with the
// `dm-` prefix falls through to `unknownKeyValidator`.
const KEY_VALIDATORS: Record<string, KeyValidator> = {
  // App grid / layout
  "dm-grid-cols": lift(validateBoundedInt(2, 4)),
  "dm-grid-rows": lift(validateBoundedInt(2, 4)),
  "dm-tiles-v3": lift(validateTiles),
  "dm-recent-widgets": lift(validateArrayOfEnum(WIDGET_TYPES, MAX_TILES)),

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
  // reads it; `migrateTurnIndexToActiveId` (InitiativeWidget) converts
  // it to `dm-initiative-active-id-v1` on next page load.
  "dm-initiative-turn-v1": lift(validateBoundedInt(0, 999)),
  "dm-initiative-active-id-v1": lift(validateInitiativeActiveId),
  "dm-round-v1": lift(validateBoundedInt(1, 9999)),
  "dm-initiative-mode-v1": lift(validateEnum(INITIATIVE_MODES)),
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
      `Backup contains ${dmEntries.length} dm-* keys (max ${MAX_KEYS}). Refusing to import.`,
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
    if (rawValue.length > MAX_PER_VALUE_BYTES) {
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

  // Enforce atomic-group invariants. If any group member is in `skipped`
  // (failed validation), evict any surviving members from `pairs` so the
  // consumer doesn't see half-applied state.
  for (const group of ATOMIC_KEY_GROUPS) {
    const anyFailed = group.some((k) => skipped.includes(k));
    if (!anyFailed) continue;
    for (const k of group) {
      const idx = pairs.findIndex((p) => p.key === k);
      if (idx >= 0) {
        pairs.splice(idx, 1);
        if (!skipped.includes(k)) skipped.push(k);
      }
    }
  }

  let bytes = 0;
  for (const { key, value } of pairs) bytes += key.length + value.length;
  if (bytes > MAX_TOTAL_BYTES) {
    throw new Error(
      `Backup totals ${(bytes / 1_000_000).toFixed(2)} MB (max ${MAX_TOTAL_BYTES / 1_000_000} MB). Refusing to import.`,
    );
  }
  return { pairs, skipped, bytes };
}

export function exportFullBackupAsJson(): string {
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
  /** Apply the import. Wipes exactly the `dm-*` keys present at
   *  `prepareImport` time, then writes the validated pairs. Atomic:
   *  rolls back the snapshot if any write throws. Caller reloads the
   *  page after success so widgets pick up the restored state. */
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
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so the click has time to fire in all browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    const cleanup = () => input.remove();
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        cleanup();
        resolve(String(reader.result ?? ""));
      };
      reader.onerror = () => {
        const err = reader.error ?? new Error("Read failed.");
        cleanup();
        reject(err);
      };
      reader.readAsText(file);
    };
    input.oncancel = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    input.click();
  });
}
