// Tier-1 (Node env) coverage for the shared import-envelope parser used by
// BOTH JSON import surfaces (full backup + party export). backup.test.ts and
// partyStore.test.ts exercise it only indirectly through their own importers;
// this pins the schema/version contract — and, crucially, the cross-surface
// "you picked the wrong file" hint — on the shared module directly, so a change
// here can't quietly weaken both importers at once.
import { describe, it, expect } from "vitest";
import { parseEnvelopeHead } from "@/lib/envelope";

const FULL = "selene-dm-full";
const PARTY = "selene-dm-party";

function head(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("parseEnvelopeHead", () => {
  it("returns the parsed object so the caller can read its payload", () => {
    const out = parseEnvelopeHead(
      head({ schema: FULL, version: 1, payload: { foo: "bar" } }),
      FULL,
      "full backup",
    );
    expect(out).toMatchObject({ schema: FULL, version: 1, payload: { foo: "bar" } });
  });

  it("rejects syntactically invalid JSON", () => {
    expect(() => parseEnvelopeHead("{not json", FULL, "full backup")).toThrow(
      /isn't valid JSON/i,
    );
  });

  it("rejects JSON that parses to a non-object (null / number / string)", () => {
    // `null` parses fine but is falsy; numbers/strings are objects-of-wrong-kind.
    for (const text of ["null", "42", '"a string"', "true"]) {
      expect(() => parseEnvelopeHead(text, FULL, "full backup")).toThrow(
        /isn't a full backup/i,
      );
    }
  });

  it("rejects a wrong, unknown schema with no misleading hint", () => {
    let msg = "";
    try {
      parseEnvelopeHead(head({ schema: "some-other-app", version: 1 }), FULL, "full backup");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/isn't a full backup/i);
    // No "This looks like a …" hint for an unrecognized schema.
    expect(msg).not.toMatch(/looks like/i);
  });

  it("points the user at the right surface when they picked the OTHER known Selene file", () => {
    // Loading a party export into the full-backup importer names the party file
    // and where it belongs, rather than leaking the raw schema string.
    let msg = "";
    try {
      parseEnvelopeHead(head({ schema: PARTY, version: 1 }), FULL, "full backup");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/looks like a Party export/i);
    expect(msg).toMatch(/Import button in the Party widget/i);
  });

  it("points a full backup loaded into the party importer at the BACKUP panel", () => {
    let msg = "";
    try {
      parseEnvelopeHead(head({ schema: FULL, version: 1 }), PARTY, "Party export");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/looks like a full backup/i);
    expect(msg).toMatch(/BACKUP panel/i);
  });

  it("treats a missing version as v1 (legacy pre-version-check envelopes)", () => {
    expect(() =>
      parseEnvelopeHead(head({ schema: FULL }), FULL, "full backup"),
    ).not.toThrow();
  });

  it("treats a non-numeric or non-finite version as v1 (lenient)", () => {
    for (const version of ["5", null, NaN, Infinity]) {
      expect(() =>
        parseEnvelopeHead(head({ schema: FULL, version }), FULL, "full backup"),
      ).not.toThrow();
    }
  });

  it("accepts the current numeric version", () => {
    expect(() =>
      parseEnvelopeHead(head({ schema: FULL, version: 1 }), FULL, "full backup"),
    ).not.toThrow();
  });

  it("rejects a forward-incompatible (newer) numeric version", () => {
    expect(() =>
      parseEnvelopeHead(head({ schema: FULL, version: 2 }), FULL, "full backup"),
    ).toThrow(/version 2 is newer/i);
  });
});
