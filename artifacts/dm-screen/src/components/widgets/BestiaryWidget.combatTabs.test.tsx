// @vitest-environment jsdom
//
// Component coverage for the Bestiary stat block's derived Attacks / Spells
// tabs.
//
// WHY THIS FILE EXISTS, given statblockCombat.test.ts already covers the parser:
// those tests prove the derivation is RIGHT. Nothing there proves the stat block
// RENDERS it — a widget that computed `deriveCombatOptions` and then never
// showed a tab would leave the whole parser suite green. Only a mounted
// component makes that observable, so this file asserts the round trip: fixture
// prose → parsed fields → visible text, plus which tab opens first.
//
// @/data/monsters (~4.8 MB) is mocked down to one fixture; @/data/spells is
// mocked to the handful of spells the fixture's spell list names, which is what
// the chips resolve against.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { MONSTERS, SPELLS } = vi.hoisted(() => {
  const MONSTERS = [
    {
      name: "Test Wyrm", size: "Huge", type: "dragon", alignment: "chaotic evil",
      ac: 19, acType: "natural armor", hp: "256 (19d12 + 133)", speed: "40 ft., fly 80 ft.",
      str: 27, dex: 10, con: 25, int: 16, wis: 13, cha: 21,
      senses: "darkvision 120 ft.", languages: "Common, Draconic", cr: "17",
      traits: [
        {
          name: "Spellcasting",
          desc: "Its spellcasting ability is Intelligence (spell save DC 18, +10 to hit with spell attacks).\n\nat will: light\n\n1st level (4 slots): magic missile",
        },
      ],
      actions: [
        { name: "Multiattack", desc: "The wyrm makes three Rend attacks." },
        {
          name: "Rend",
          desc: "Melee Attack Roll: +14, reach 10 ft. Hit: 13 (1d10 + 8) Slashing damage plus 5 (2d4) Fire damage.",
        },
        {
          name: "Fire Breath (Recharge 5–6)",
          desc: "Dex Save: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage. Success: Half damage.",
        },
      ],
      reactions: [],
      legendaryActions: [],
      source: "XMM",
    },
  ];
  const spell = (name: string, level: number) => ({
    name, level, school: "Evocation", castingTime: "1 action", range: "60 feet",
    components: "V, S", duration: "Instantaneous", classes: ["Wizard"],
    description: `${name} does something.`, damageSummary: "0 — effect",
  });
  return { MONSTERS, SPELLS: [spell("Light", 0), spell("Magic Missile", 1)] };
});

vi.mock("@/data/monsters", () => ({
  monsters: MONSTERS,
  mod: (n: number) => {
    const v = Math.floor((n - 10) / 2);
    return v >= 0 ? `+${v}` : `${v}`;
  },
  crToNumber: (cr: string) => Number(cr) || 0,
}));

vi.mock("@/data/spells", () => ({ spellData: SPELLS }));

import { BestiaryWidget } from "./BestiaryWidget";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

describe("BestiaryWidget derived combat tabs", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  const openWyrm = () => render(<BestiaryWidget target="Test Wyrm" onTargetClear={() => {}} />);

  it("opens on Attacks — the tab a DM needs first — and shows the parsed fields", async () => {
    openWyrm();
    expect(await screen.findByRole("heading", { name: "Test Wyrm" })).toBeTruthy();

    // Parsed out of the prose, not copied from it: the to-hit, the distance and
    // both damage clauses each come from a different part of the sentence.
    expect(screen.getByText("+14")).toBeTruthy();
    expect(screen.getByText("10 ft.")).toBeTruthy();
    expect(screen.getByText("13 (1d10 + 8) slashing + 5 (2d4) fire")).toBeTruthy();

    // The breath weapon makes no attack roll, so it only appears if save-forcing
    // actions are surfaced alongside attacks.
    expect(screen.getByText(/Fire Breath/)).toBeTruthy();
    expect(screen.getByText("DC 21 DEX")).toBeTruthy();

    // Multiattack governs how many of the above happen in a turn.
    expect(screen.getByText(/three Rend attacks/)).toBeTruthy();
  });

  it("reveals the source sentence when an attack row is expanded", async () => {
    const user = userEvent.setup();
    openWyrm();
    await screen.findByRole("heading", { name: "Test Wyrm" });

    expect(screen.queryByText(/Melee Attack Roll: \+14/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Rend/ }));
    // The parser is heuristic over three upstream prose styles, so the original
    // text must always be one click away.
    expect(screen.getByText(/Melee Attack Roll: \+14, reach 10 ft\./)).toBeTruthy();
  });

  it("lists the creature's spells as chips resolved against the bundled dataset", async () => {
    const user = userEvent.setup();
    openWyrm();
    await screen.findByRole("heading", { name: "Test Wyrm" });

    await user.click(screen.getByRole("button", { name: /^Spells/ }));
    expect(screen.getByText("save DC 18")).toBeTruthy();
    expect(screen.getByText("+10 spell atk")).toBeTruthy();
    // Group headers come from the stat block's own list structure.
    expect(screen.getByText("At Will")).toBeTruthy();
    expect(screen.getByText("1st Level (4 Slots)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Magic Missile/ })).toBeTruthy();
  });

  it("expands a spell chip into its full card without leaving the widget", async () => {
    const user = userEvent.setup();
    openWyrm();
    await screen.findByRole("heading", { name: "Test Wyrm" });
    await user.click(screen.getByRole("button", { name: /^Spells/ }));

    expect(screen.queryByText("Magic Missile does something.")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Magic Missile/ }));
    // Mid-combat the expensive part is leaving the widget you're reading, so the
    // spell text renders in place.
    expect(screen.getByText("Magic Missile does something.")).toBeTruthy();
  });

  it("keeps the verbatim prose tabs alongside the derived ones", async () => {
    const user = userEvent.setup();
    openWyrm();
    await screen.findByRole("heading", { name: "Test Wyrm" });

    // Nothing is replaced — the derived tabs are a re-cut of the same text.
    await user.click(screen.getByRole("button", { name: /^Actions/ }));
    expect(screen.getByText(/Dex Save: DC 21, each creature in a 60-foot Cone/)).toBeTruthy();
  });
});
