// One-shot localStorage migrations from pre-v1 / superseded key shapes.
// Imported from `main.tsx` so the IIFE runs on app boot regardless of
// which widget the DM opens first — if any of these migrations lived
// inside a widget module, lazy-loading that widget (or simply never
// opening it) would leave the legacy keys behind to be swept into every
// full backup forever.
//
// Every migration is idempotent: re-running it after success is a
// no-op. Each step is wrapped in try/catch so a single failure (quota,
// private mode, SecurityError) can't block subsequent migrations.

import { validateCombatants } from "@/lib/combatant";

const LEGACY_INITIATIVE_KEYS: Record<string, string> = {
  "dm-initiative": "dm-initiative-v1",
  "dm-initiative-turn": "dm-initiative-turn-v1",
  "dm-round": "dm-round-v1",
};

// `null` and the literal JSON string `"null"` both mean "v1 is empty"
// for migration purposes — the latter happens if anything ever wrote
// `null` via `JSON.stringify(null)` (DevTools edit, an early bug, an
// importer).
export function isV1Empty(raw: string | null): boolean {
  return raw == null || raw === "null";
}

// Copy each legacy unversioned initiative key into its `*-v1`
// counterpart, then delete the legacy key. The copy only runs when the
// v1 destination is empty — current state wins over a stale
// resurrection if both happen to be present.
function migrateLegacyInitiativeKeys(): void {
  for (const [legacy, current] of Object.entries(LEGACY_INITIATIVE_KEYS)) {
    try {
      const raw = window.localStorage.getItem(legacy);
      if (raw == null) continue;
      // Two cases reach `removeItem(legacy)` below:
      //  - v1 was empty → we copied legacy → v1 and now drop legacy.
      //  - v1 was already populated → no copy, but legacy is stale and
      //    safe to drop (current state already wins on read).
      // The only way to skip the removeItem is the `setItem` throw
      // path, where the catch below preserves legacy as a fallback for
      // `legacyInitialValue` to surface on next mount.
      if (isV1Empty(window.localStorage.getItem(current))) {
        window.localStorage.setItem(current, raw);
      }
      window.localStorage.removeItem(legacy);
    } catch {
      // storage unavailable / quota — leave both keys as-is so the
      // read-path fallback can recover the data.
    }
  }
}

// Convert the old sort-index-based "current turn" pointer to an
// id-based one. The runtime now tracks the active combatant by id so
// removing the active combatant (or any initiative re-sort) can't
// silently re-point the highlight to whoever shifts into that index.
// Runs after `migrateLegacyInitiativeKeys` so the v1 key is populated
// if the unversioned legacy key existed.
function migrateTurnIndexToActiveId(): void {
  const NEW_KEY = "dm-initiative-active-id-v1";
  const OLD_KEY = "dm-initiative-turn-v1";
  try {
    if (window.localStorage.getItem(NEW_KEY) != null) {
      window.localStorage.removeItem(OLD_KEY);
      return;
    }
    const oldRaw = window.localStorage.getItem(OLD_KEY);
    if (oldRaw == null) return;
    let oldIdx: unknown;
    try {
      oldIdx = JSON.parse(oldRaw);
    } catch {
      window.localStorage.removeItem(OLD_KEY);
      return;
    }
    if (typeof oldIdx !== "number" || !Number.isFinite(oldIdx)) {
      window.localStorage.removeItem(OLD_KEY);
      return;
    }
    const combRaw = window.localStorage.getItem("dm-initiative-v1");
    if (combRaw) {
      try {
        const validated = validateCombatants(JSON.parse(combRaw));
        if (validated && validated.length > 0) {
          const sorted = [...validated].sort(
            (a, b) => b.initiative - a.initiative,
          );
          const idx = Math.max(
            0,
            Math.min(Math.trunc(oldIdx), sorted.length - 1),
          );
          // Persist the validated list BEFORE the pointer: validation may
          // have minted fresh ids (missing / duplicate ids in legacy or
          // hand-edited data), and the pointer below references THOSE. If
          // the raw list stayed in storage, the widget's read path would
          // re-validate it and mint different ids — the pointer would
          // dangle and the widget's reconciliation effect would reset it
          // to null, silently undoing this migration's one job.
          window.localStorage.setItem(
            "dm-initiative-v1",
            JSON.stringify(validated),
          );
          window.localStorage.setItem(NEW_KEY, JSON.stringify(sorted[idx].id));
        }
      } catch {
        // Malformed combatants — leave OLD_KEY alone too; the read
        // path on `dm-initiative-v1` will fall back to defaults.
        return;
      }
    }
    window.localStorage.removeItem(OLD_KEY);
  } catch {
    // storage unavailable — leave both keys as-is.
  }
}

// The Oracle widget moved from a single `dm-oracle-result-v1` string + a
// flat `dm-oracle-history-v1` array to a per-tab `dm-oracle-history-v2` map
// (so switching tabs no longer wipes another tab's history). The two old
// keys are never read again; drop them so they don't linger in every full
// backup. Pure deletion — nothing to migrate, the new shape starts empty.
function dropLegacyOracleKeys(): void {
  for (const key of ["dm-oracle-result-v1", "dm-oracle-history-v1"]) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // storage unavailable — harmless; the key just stays put.
    }
  }
}

// Guarded so any future SSR / test import of this module doesn't blow
// up at parse time. In a real browser this runs exactly once on app
// boot from `main.tsx`.
export function runMigrationsOnce(): void {
  if (typeof window === "undefined") return;
  migrateLegacyInitiativeKeys();
  migrateTurnIndexToActiveId();
  dropLegacyOracleKeys();
}
