// Shared schema+version check for the two JSON import surfaces (full
// backup, party export). Lives in its own module so both `backup.ts` and
// `partyStore.ts` can share the parse without creating an import cycle
// (backup → partyStore is already one-way).

interface EnvelopeHead {
  schema?: unknown;
  version?: unknown;
}

const CURRENT_VERSION = 1;

/** Parse `text` as JSON, verify the envelope's `schema` matches and that
 *  its `version` is compatible with the current build. Returns the
 *  parsed object so the caller can read its payload field. Throws a
 *  user-facing `Error` describing the specific failure mode: invalid
 *  JSON, wrong schema, or a newer-version envelope this build can't
 *  read. A missing or non-numeric `version` is treated as v1 — the
 *  pre-version-check builds shipped envelopes without it, and our own
 *  exporter has always written `version: 1`, so accepting "absent" as
 *  v1 keeps backward compat without weakening the forward-incompat
 *  guard. */
export function parseEnvelopeHead(
  text: string,
  expectedSchema: string,
  kind: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("File isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`File isn't a ${kind}.`);
  }
  const env = parsed as EnvelopeHead;
  if (env.schema !== expectedSchema) {
    throw new Error(
      `Unexpected schema "${String(env.schema ?? "?")}" — looking for "${expectedSchema}".`,
    );
  }
  const v = env.version;
  // Missing / non-numeric `version` → treat as v1 (legacy lenient
  // behavior). Explicit numeric value still gates the forward-incompat
  // check below.
  const effectiveVersion =
    typeof v === "number" && Number.isFinite(v) ? v : CURRENT_VERSION;
  if (effectiveVersion > CURRENT_VERSION) {
    throw new Error(
      `${kind} version ${effectiveVersion} is newer than this build can read. Please update the app.`,
    );
  }
  return parsed as Record<string, unknown>;
}
