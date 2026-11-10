// @vitest-environment jsdom
//
// Structural guard for the "form clipped out of reach" bug. Party and
// Initiative used to render their add forms as fixed (shrink-0) blocks ABOVE a
// separately-scrolling list, so in a short tile the form's lower half — Save /
// "Add to Initiative" included — was clipped by the tile and unreachable.
// The fix puts every growable block in ONE scroll body with the list.
//
// jsdom has no layout, so the clipping itself can't be measured here (that's
// covered by a Playwright check during review); what IS checkable is the
// invariant the fix rests on: each form shares its nearest scroll container
// with the list it sits above.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/data/weapons", () => ({ weaponsData: [] }));
vi.mock("@/data/spells", () => ({ spellData: [], spellSchools: [], spellClasses: [] }));
vi.mock("@/lib/monsterSearch", () => ({
  findCombatantMonster: () => null,
  searchMonsters: () => [],
}));

import { PartyWidget } from "./PartyWidget";
import { InitiativeWidget } from "./InitiativeWidget";
import { addCharacter } from "@/lib/partyStore";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

/** Nearest ancestor that scrolls vertically (by its Tailwind class). */
const scroller = (el: Element) => el.closest(".overflow-y-auto");

describe("forms share one scroll body with their list", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("Party: add form, D&D Beyond panel and roster scroll together", () => {
    addCharacter({ name: "Selene", race: null, class: null, level: 1, ac: null, hp: null, spells: [], weapons: [] });
    render(<PartyWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Add Character" }));
    fireEvent.click(screen.getByRole("button", { name: "Import from D&D Beyond" }));

    const body = scroller(screen.getByTitle("View character sheet"));
    expect(body).not.toBeNull();
    expect(scroller(screen.getByRole("button", { name: "Save Character" }))).toBe(body);
    expect(scroller(screen.getByRole("button", { name: "Fetch" }))).toBe(body);
    // ...and the header (with the buttons that open them) stays outside it.
    expect(body!.contains(screen.getByRole("button", { name: "Add Character" }))).toBe(false);
  });

  it("Initiative: add form and combatant list scroll together", () => {
    render(<InitiativeWidget />);
    fireEvent.click(screen.getByTitle("Add a combatant"));

    const body = scroller(screen.getByText(/No combatants yet/));
    expect(body).not.toBeNull();
    expect(scroller(screen.getByRole("button", { name: "Add Monster to Initiative" }))).toBe(body);
    expect(body!.contains(screen.getByTitle("Add a combatant"))).toBe(false);
  });
});
