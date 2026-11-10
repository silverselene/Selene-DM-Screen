// @vitest-environment jsdom
//
// Component coverage for the Wizard's Tome `target` hand-off (`dm-open-spell`
// from the Party widget's spell pills, routed by App). A case-insensitive
// dataset match opens the spell card; a miss falls back to searching the name
// with every filter cleared (never a dead click). Either way the one-shot
// signal is cleared via onTargetClear. @/data/spells is mocked.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/data/spells", () => ({
  spellData: [
    {
      name: "Fireball", level: 3, school: "Evocation", castingTime: "1 action", range: "150 feet",
      components: "V, S, M", duration: "Instantaneous", classes: ["Wizard"],
      description: "A bright streak flashes.", damageSummary: "8d6 fire",
    },
    {
      name: "Shield", level: 1, school: "Abjuration", castingTime: "1 reaction", range: "Self",
      components: "V, S", duration: "1 round", classes: ["Wizard"],
      description: "An invisible barrier.", damageSummary: "—",
    },
  ],
  spellSchools: ["Evocation", "Abjuration"],
  spellClasses: ["Wizard"],
}));

import { WizardsTomeWidget } from "./WizardsTomeWidget";

const read = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? "null");

describe("WizardsTomeWidget target consumption", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("opens the matching spell (case-insensitively) and clears the signal", async () => {
    const onTargetClear = vi.fn();
    render(<WizardsTomeWidget target="fireball" onTargetClear={onTargetClear} />);

    expect(await screen.findByRole("button", { name: /Back/ })).toBeTruthy();
    expect(screen.getByText("Fireball")).toBeTruthy();
    expect(read("dm-tome-selected-v1")).toBe("Fireball");
    expect(onTargetClear).toHaveBeenCalledTimes(1);
  });

  it("falls back to searching the name, with filters cleared, on a miss", async () => {
    window.localStorage.setItem("dm-tome-level-v1", JSON.stringify(1));
    window.localStorage.setItem("dm-tome-school-v1", JSON.stringify("Abjuration"));
    const onTargetClear = vi.fn();
    render(<WizardsTomeWidget target="Tasha's Hideous Laughter" onTargetClear={onTargetClear} />);

    expect(await screen.findByText(/No spells found/)).toBeTruthy();
    expect((screen.getByPlaceholderText("Search spells…") as HTMLInputElement).value).toBe(
      "Tasha's Hideous Laughter",
    );
    expect(read("dm-tome-level-v1")).toBe(-1);
    expect(read("dm-tome-school-v1")).toBe("");
    expect(onTargetClear).toHaveBeenCalledTimes(1);
  });
});
