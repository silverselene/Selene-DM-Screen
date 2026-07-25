// @vitest-environment jsdom
//
// Component coverage for manual HP entry on an Initiative row: click the HP
// readout to replace it with a number input, for the "cast Heal for 70" /
// "rolled 34 damage" case where the +/- one-at-a-time buttons aren't
// realistic. combatant.test.ts covers `applyHpDelta` (the +/- path); this
// file covers the OTHER path, which lives entirely in the widget's own local
// state (`editingHpId`/`hpDraft`) and so is only observable mounted.
//
// @/lib/monsterSearch is mocked to keep the 4.8 MB monsters dataset out of
// this run — none of these tests care about monster resolution.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Combatant } from "@/types";

vi.mock("@/lib/monsterSearch", () => ({
  searchMonsters: () => [],
  findCombatantMonster: () => null,
}));

import { InitiativeWidget } from "./InitiativeWidget";
import { INITIATIVE_STORAGE_KEY } from "@/lib/combatant";

const combatant = (over: Partial<Combatant>): Combatant => ({
  id: "c-1", name: "Goblin", initiative: 14, hp: 7, maxHp: 20, isPlayer: false, ...over,
});

function seed(list: Combatant[]) {
  window.localStorage.setItem(INITIATIVE_STORAGE_KEY, JSON.stringify(list));
}

function committed(): Combatant[] {
  const raw = window.localStorage.getItem(INITIATIVE_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Combatant[]) : [];
}

const hpDisplay = (name: string) => screen.getByRole("button", { name: `Edit HP for ${name}` });
// A numeric-mode TEXT field, not `type="number"` — see the component comment
// next to it for why (Firefox throws on selection APIs for number inputs).
const hpField = (name: string) => screen.getByRole("textbox", { name: `Set HP for ${name}` }) as HTMLInputElement;

describe("InitiativeWidget manual HP entry", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("shows the current HP as a clickable readout, not editable by default", () => {
    seed([combatant({ hp: 7, maxHp: 20 })]);
    render(<InitiativeWidget />);

    expect(hpDisplay("Goblin").textContent).toBe("7/20");
    expect(screen.queryByRole("textbox", { name: /Set HP/ })).toBeNull();
  });

  it("replaces the readout with a pre-filled, selected number field on click", async () => {
    const user = userEvent.setup();
    seed([combatant({ hp: 7, maxHp: 20 })]);
    render(<InitiativeWidget />);

    await user.click(hpDisplay("Goblin"));

    const field = hpField("Goblin");
    expect(field.value).toBe("7");
    // Selected on focus so typing a new value replaces "7" outright, rather
    // than the DM having to clear it first.
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(1);
  });

  it("commits a typed value on Enter and closes the field", async () => {
    const user = userEvent.setup();
    seed([combatant({ hp: 7, maxHp: 20 })]);
    render(<InitiativeWidget />);

    await user.click(hpDisplay("Goblin"));
    await user.clear(hpField("Goblin"));
    await user.type(hpField("Goblin"), "34{Enter}");

    expect(hpDisplay("Goblin").textContent).toBe("34/20");
    expect(committed()[0].hp).toBe(34);
    expect(screen.queryByRole("textbox", { name: /Set HP/ })).toBeNull();
  });

  it("commits on blur (clicking elsewhere), not only on Enter", async () => {
    const user = userEvent.setup();
    seed([combatant({ hp: 7, maxHp: 20 })]);
    render(<InitiativeWidget />);

    await user.click(hpDisplay("Goblin"));
    await user.clear(hpField("Goblin"));
    await user.type(hpField("Goblin"), "12");
    // Click the round counter — any element outside the field — to blur it.
    await user.click(screen.getByText("Round"));

    expect(committed()[0].hp).toBe(12);
  });

  it("discards the edit on Escape and leaves the stored HP untouched", async () => {
    const user = userEvent.setup();
    seed([combatant({ hp: 7, maxHp: 20 })]);
    render(<InitiativeWidget />);

    await user.click(hpDisplay("Goblin"));
    await user.clear(hpField("Goblin"));
    await user.type(hpField("Goblin"), "999");
    await user.keyboard("{Escape}");

    expect(hpDisplay("Goblin").textContent).toBe("7/20");
    expect(committed()[0].hp).toBe(7);
  });

  it("allows HP above maxHp, e.g. temporary HP stacked on a near-full pool", async () => {
    const user = userEvent.setup();
    seed([combatant({ hp: 18, maxHp: 20 })]);
    render(<InitiativeWidget />);

    await user.click(hpDisplay("Goblin"));
    await user.clear(hpField("Goblin"));
    await user.type(hpField("Goblin"), "25{Enter}");

    expect(hpDisplay("Goblin").textContent).toBe("25/20");
    expect(committed()[0].hp).toBe(25);
  });

  it("clamps a typed value to the shared HP bounds, matching every other HP entry point", async () => {
    const user = userEvent.setup();
    seed([combatant({ hp: 7, maxHp: 20 })]);
    render(<InitiativeWidget />);

    await user.click(hpDisplay("Goblin"));
    await user.clear(hpField("Goblin"));
    await user.type(hpField("Goblin"), "-40{Enter}");

    expect(committed()[0].hp).toBe(0);
  });

  it("falls back to the pre-edit HP on an empty commit rather than zeroing it", async () => {
    const user = userEvent.setup();
    seed([combatant({ hp: 7, maxHp: 20 })]);
    render(<InitiativeWidget />);

    await user.click(hpDisplay("Goblin"));
    await user.clear(hpField("Goblin"));
    await user.keyboard("{Enter}");

    expect(committed()[0].hp).toBe(7);
  });

  it("lets a dead (0 HP) row be revived by typing a new value", async () => {
    const user = userEvent.setup();
    seed([combatant({ hp: 0, maxHp: 20 })]);
    render(<InitiativeWidget />);

    expect(hpDisplay("Goblin").textContent).toBe("DEAD");
    await user.click(hpDisplay("Goblin"));
    await user.type(hpField("Goblin"), "5{Enter}");

    expect(hpDisplay("Goblin").textContent).toBe("5/20");
  });

  it("edits each row independently", async () => {
    const user = userEvent.setup();
    seed([
      combatant({ id: "c-1", name: "Goblin A", initiative: 15, hp: 7, maxHp: 20 }),
      combatant({ id: "c-2", name: "Goblin B", initiative: 9, hp: 12, maxHp: 20 }),
    ]);
    render(<InitiativeWidget />);

    await user.click(hpDisplay("Goblin A"));
    expect(screen.queryByRole("textbox", { name: "Set HP for Goblin B" })).toBeNull();

    await user.clear(hpField("Goblin A"));
    await user.type(hpField("Goblin A"), "11{Enter}");
    expect(hpDisplay("Goblin A").textContent).toBe("11/20");
    // Untouched.
    expect(hpDisplay("Goblin B").textContent).toBe("12/20");
  });

  it("still supports the +/- buttons alongside manual entry", async () => {
    const user = userEvent.setup();
    seed([combatant({ hp: 7, maxHp: 20 })]);
    render(<InitiativeWidget />);

    await user.click(screen.getByRole("button", { name: "Heal Goblin" }));
    expect(hpDisplay("Goblin").textContent).toBe("8/20");
    await user.click(screen.getByRole("button", { name: "Damage Goblin" }));
    await user.click(screen.getByRole("button", { name: "Damage Goblin" }));
    expect(hpDisplay("Goblin").textContent).toBe("6/20");
  });
});
