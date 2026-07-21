// @vitest-environment jsdom
//
// Component coverage for the Wizard's Tome render cap + footer. @/data/spells
// (~590 kB) is mocked with a small synthetic set so the counts are controlled.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { SPELLS } = vi.hoisted(() => {
  // 250 Wizard spells → a class filter matches all of them, over the 200 cap.
  // One spell carries a unique token so the search index can be exercised.
  const SPELLS = Array.from({ length: 250 }, (_, i) => ({
    name: `Testspell ${String(i).padStart(3, "0")}`,
    level: i % 10,
    school: "Evocation",
    castingTime: "1 action",
    range: "60 feet",
    components: "V, S",
    duration: "Instantaneous",
    classes: ["Wizard"],
    description: `desc widgettoken${i === 0 ? " uniquetoken" : ""}`,
    damageSummary: "0 — effect",
  }));
  return { SPELLS };
});

vi.mock("@/data/spells", () => ({
  spellData: SPELLS,
  spellSchools: ["Evocation", "Abjuration"],
  spellClasses: ["Wizard", "Cleric"],
}));

import { WizardsTomeWidget } from "./WizardsTomeWidget";

const seed = (key: string, val: unknown) =>
  window.localStorage.setItem(key, JSON.stringify(val));

describe("WizardsTomeWidget cap + footer", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("previews only 7 unfiltered with a 'search to filter' footer", async () => {
    render(<WizardsTomeWidget />);
    expect(await screen.findByText(/search to filter/i)).toBeTruthy();
    expect(screen.getByText(/Showing 7 of 250/)).toBeTruthy();
  });

  it("caps a broad filtered match at 200 rows with a 'refine your search' footer", async () => {
    seed("dm-tome-class-v1", "Wizard"); // matches all 250
    render(<WizardsTomeWidget />);
    expect(await screen.findByText(/refine your search/i)).toBeTruthy();
    expect(screen.getByText(/Showing first 200 of 250/)).toBeTruthy();
  });

  it("matches name+description through the precomputed index", async () => {
    seed("dm-tome-query-v1", "uniquetoken"); // only spell 000 has it
    render(<WizardsTomeWidget />);
    expect(await screen.findByText("Testspell 000")).toBeTruthy();
    expect(screen.queryByText(/refine your search/i)).toBeNull();
    expect(screen.getByText(/^1 spell$/)).toBeTruthy();
  });
});
