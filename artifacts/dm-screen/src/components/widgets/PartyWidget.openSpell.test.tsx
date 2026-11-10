// @vitest-environment jsdom
//
// Party → Wizard's Tome: clicking a spell pill on a roster row, or a spell row
// in the mini character sheet, dispatches `dm-open-spell` with that spell's
// name (App routes it to the Tome). The sheet is a full-screen modal, so it
// must close on the way out or the Tome stays hidden behind it.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/data/weapons", () => ({ weaponsData: [] }));
vi.mock("@/data/spells", () => ({
  spellData: [{ name: "Fireball", level: 3, school: "Evocation", classes: ["Wizard"], description: "boom" }],
  spellSchools: ["Evocation"],
  spellClasses: ["Wizard"],
}));

import { PartyWidget } from "./PartyWidget";
import { addCharacter } from "@/lib/partyStore";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

describe("PartyWidget — open a spell in the Wizard's Tome", () => {
  const opened: string[] = [];
  const onOpen = (e: Event) => opened.push((e as CustomEvent<{ name: string }>).detail.name);

  beforeEach(() => {
    window.localStorage.clear();
    opened.length = 0;
    window.addEventListener("dm-open-spell", onOpen);
    addCharacter({
      name: "Selene", race: "Elf", class: "Wizard", level: 5, ac: 12, hp: 30,
      spells: ["Fireball", "Homebrew Bolt"], weapons: [],
    });
  });
  afterEach(() => {
    window.removeEventListener("dm-open-spell", onOpen);
    cleanup();
  });

  it("dispatches dm-open-spell from a roster spell pill without opening the sheet", () => {
    render(<PartyWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Open Fireball in the Wizard's Tome" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Homebrew Bolt in the Wizard's Tome" }));
    expect(opened).toEqual(["Fireball", "Homebrew Bolt"]);
    expect(screen.queryByRole("heading", { name: "Selene" })).toBeNull();
  });

  it("dispatches from the character sheet and closes the sheet", () => {
    render(<PartyWidget />);
    fireEvent.click(screen.getByTitle("View character sheet"));
    expect(screen.getByRole("heading", { name: "Selene" })).toBeTruthy();

    // Two "Open Fireball…" buttons now exist (row pill + sheet row); the sheet's is last.
    const buttons = screen.getAllByRole("button", { name: "Open Fireball in the Wizard's Tome" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(opened).toEqual(["Fireball"]);
    expect(screen.queryByRole("heading", { name: "Selene" })).toBeNull();
  });
});
