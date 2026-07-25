// @vitest-environment jsdom
//
// Component coverage for the Initiative tracker's per-combatant stat-block
// panel: a monster row can expand in place to show what that creature can
// actually do this turn, without the DM navigating to the Bestiary mid-encounter.
//
// WHY THIS FILE EXISTS: statblockCombat.test.ts proves the parse, and
// monsterSearch.test.ts proves a combatant name resolves to a stat block.
// Neither proves the tracker WIRES the two together — a row that resolved a
// monster but never rendered the toggle would leave both suites green. The
// convergence is only observable with the widget mounted (same reasoning as
// InitiativeWidget.addPaths.test.tsx).
//
// The heavy data modules are mocked: @/lib/monsterSearch (which pulls in the
// 4.8 MB monsters dataset) and @/data/spells.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Combatant } from "@/types";

const { GOBLIN, SPELLS } = vi.hoisted(() => {
  const GOBLIN = {
    name: "Goblin", ac: 15, acType: "leather armor", hp: "7 (2d6)", cr: "1/4",
    size: "Small", type: "humanoid", alignment: "neutral evil", source: "XMM",
    environment: "", pageNumber: null, isLegendary: false,
    initiativeModifier: 2, initiativeRoll: 12,
    actions: [
      {
        name: "Scimitar",
        desc: "Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.",
      },
      {
        name: "Spellcasting",
        desc: "Its spellcasting ability is Charisma (spell save DC 11).\n\nat will: light",
      },
    ],
  };
  const SPELLS = [
    {
      name: "Light", level: 0, school: "Evocation", castingTime: "1 action",
      range: "Touch", components: "V, M", duration: "1 hour", classes: ["Wizard"],
      description: "You touch one object.", damageSummary: "0 — effect",
    },
  ];
  return { GOBLIN, SPELLS };
});

// Only rows whose name resolves to a stat block get the toggle, so the mock is
// what decides which fixture row is expandable.
vi.mock("@/lib/monsterSearch", () => ({
  searchMonsters: () => [],
  findCombatantMonster: (displayName: string, monsterName?: string) =>
    /goblin/i.test(monsterName ?? displayName) ? GOBLIN : null,
}));

vi.mock("@/data/spells", () => ({ spellData: SPELLS }));

import { InitiativeWidget } from "./InitiativeWidget";
import { INITIATIVE_STORAGE_KEY } from "@/lib/combatant";

const combatant = (over: Partial<Combatant>): Combatant => ({
  id: "c-1", name: "Goblin", initiative: 14, hp: 7, maxHp: 7, isPlayer: false, ...over,
});

function seed(list: Combatant[]) {
  window.localStorage.setItem(INITIATIVE_STORAGE_KEY, JSON.stringify(list));
}

const toggleFor = (name: string) =>
  screen.getByRole("button", { name: new RegExp(`attacks and spells for ${name}`, "i") });

describe("InitiativeWidget stat-block panel", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("offers the toggle only on rows that resolve to a stat block", () => {
    seed([
      combatant({ id: "c-1", name: "Goblin" }),
      combatant({ id: "c-2", name: "Cult Enforcer" }),
      combatant({ id: "c-3", name: "Tamsin", isPlayer: true }),
    ]);
    render(<InitiativeWidget />);

    expect(toggleFor("Goblin")).toBeTruthy();
    // Homebrew name with no dataset entry, and a PC — neither has a bestiary
    // stat block to show, so neither gets a dead button.
    expect(screen.queryByRole("button", { name: /attacks and spells for Cult Enforcer/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /attacks and spells for Tamsin/i })).toBeNull();
  });

  it("shows the creature's attacks and spells in place when expanded", async () => {
    const user = userEvent.setup();
    seed([combatant({})]);
    render(<InitiativeWidget />);

    // Collapsed by default: an encounter of 20 combatants must not open as a
    // wall of stat blocks.
    expect(screen.queryByText("5 (1d6 + 2) slashing")).toBeNull();

    await user.click(toggleFor("Goblin"));
    expect(screen.getByText("+4")).toBeTruthy();
    expect(screen.getByText("5 (1d6 + 2) slashing")).toBeTruthy();
    expect(screen.getByText("save DC 11")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Light/ })).toBeTruthy();
  });

  it("collapses again on a second click", async () => {
    const user = userEvent.setup();
    seed([combatant({})]);
    render(<InitiativeWidget />);

    await user.click(toggleFor("Goblin"));
    expect(screen.getByText("5 (1d6 + 2) slashing")).toBeTruthy();
    await user.click(toggleFor("Goblin"));
    expect(screen.queryByText("5 (1d6 + 2) slashing")).toBeNull();
  });

  it("resolves a renamed row through its stored monsterName", async () => {
    const user = userEvent.setup();
    // The display name alone ("Grix") resolves to nothing; the row is only
    // expandable because the add path recorded which bestiary entry it came from.
    seed([combatant({ name: "Grix the Sneak", monsterName: "Goblin" })]);
    render(<InitiativeWidget />);

    await user.click(toggleFor("Grix the Sneak"));
    expect(screen.getByText("5 (1d6 + 2) slashing")).toBeTruthy();
  });

  it("expands one row at a time, independently", async () => {
    const user = userEvent.setup();
    seed([
      combatant({ id: "c-1", name: "Goblin #1", initiative: 15 }),
      combatant({ id: "c-2", name: "Goblin #2", initiative: 9 }),
    ]);
    render(<InitiativeWidget />);

    await user.click(toggleFor("Goblin #1"));
    // Each row owns its own disclosure state — opening one must not open every
    // copy of the same monster.
    expect(screen.getAllByText("5 (1d6 + 2) slashing")).toHaveLength(1);
    await user.click(toggleFor("Goblin #2"));
    expect(screen.getAllByText("5 (1d6 + 2) slashing")).toHaveLength(2);
  });
});
