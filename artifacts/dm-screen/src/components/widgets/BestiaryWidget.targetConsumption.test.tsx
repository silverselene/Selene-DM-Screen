// @vitest-environment jsdom
//
// Component coverage for the Bestiary's target-consumption effect: the
// `dm-open-bestiary` hand-off from Initiative arrives as the `target` prop.
// A dataset match opens that monster's detail view; a miss falls back to
// searching the name (never a dead click). Either way the one-shot signal is
// cleared via onTargetClear. @/data/monsters (~4.7 MB) is mocked.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { MONSTERS } = vi.hoisted(() => {
  const MONSTERS = [
    {
      name: "Goblin Boss", size: "Small", type: "humanoid", alignment: "neutral evil",
      ac: 17, acType: "leather armor, shield", hp: "21 (6d6)", speed: "30 ft.",
      str: 10, dex: 14, con: 10, int: 10, wis: 8, cha: 10,
      senses: "darkvision 60 ft.", languages: "Common, Goblin", cr: "1",
      traits: [], actions: [{ name: "Scimitar", desc: "Melee weapon attack." }],
      reactions: [], legendaryActions: [], source: "XMM",
    },
  ];
  return { MONSTERS };
});

vi.mock("@/data/monsters", () => ({
  monsters: MONSTERS,
  // Real `mod` returns a signed string (e.g. "+2") — AbilityScore calls
  // `.startsWith("+")` on it.
  mod: (n: number) => {
    const v = Math.floor((n - 10) / 2);
    return v >= 0 ? `+${v}` : `${v}`;
  },
  crToNumber: (cr: string) => (cr === "1" ? 1 : Number(cr) || 0),
}));

import { BestiaryWidget } from "./BestiaryWidget";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

describe("BestiaryWidget target consumption", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("opens the matching monster's detail view and clears the signal", async () => {
    const onTargetClear = vi.fn();
    render(<BestiaryWidget target="Goblin Boss" onTargetClear={onTargetClear} />);

    // Detail view: the back control + the monster name heading.
    expect(await screen.findByText(/Back to list/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Goblin Boss" })).toBeTruthy();
    expect(onTargetClear).toHaveBeenCalledTimes(1);
  });

  it("falls back to searching the name on a miss (no dead click)", async () => {
    const onTargetClear = vi.fn();
    render(<BestiaryWidget target="Nonexistent Wyrm" onTargetClear={onTargetClear} />);

    // No detail view; the search box is primed with the unmatched name.
    const input = (await screen.findByPlaceholderText(/Search .* monsters/i)) as HTMLInputElement;
    expect(input.value).toBe("Nonexistent Wyrm");
    expect(screen.queryByText(/Back to list/i)).toBeNull();
    expect(onTargetClear).toHaveBeenCalledTimes(1);
  });
});
