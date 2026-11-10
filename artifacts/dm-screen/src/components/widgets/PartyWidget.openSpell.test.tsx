// @vitest-environment jsdom
//
// Party → Wizard's Tome: clicking a spell pill on a roster row, or a spell row
// in the mini character sheet, dispatches `dm-open-spell` with that spell's
// name (App routes it to the Tome). The sheet is a full-screen modal, so it
// must close on the way out or the Tome stays hidden behind it.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/data/weapons", () => ({
  weaponsData: [
    { id: 1, name: "Dagger", category: "simple", damage: "1d4", damage_type: "Piercing", properties: ["Finesse"], mastery: ["Nick"] },
  ],
}));
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
  const weaponsOpened: string[] = [];
  const onOpenWeapon = (e: Event) =>
    weaponsOpened.push((e as CustomEvent<{ name: string }>).detail.name);

  beforeEach(() => {
    window.localStorage.clear();
    opened.length = 0;
    weaponsOpened.length = 0;
    window.addEventListener("dm-open-spell", onOpen);
    window.addEventListener("dm-open-weapon", onOpenWeapon);
    addCharacter({
      name: "Selene", race: "Elf", class: "Wizard", level: 5, ac: 12, hp: 30,
      spells: ["Fireball", "Homebrew Bolt"], weapons: ["Dagger"],
    });
  });
  afterEach(() => {
    window.removeEventListener("dm-open-spell", onOpen);
    window.removeEventListener("dm-open-weapon", onOpenWeapon);
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

  it("dispatches dm-open-weapon from a roster weapon pill and from the sheet", () => {
    render(<PartyWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Open Dagger in the Compendium" }));
    expect(weaponsOpened).toEqual(["Dagger"]);

    fireEvent.click(screen.getByTitle("View character sheet"));
    // The sheet shows the weapon's mastery…
    expect(screen.getByTitle("Weapon Mastery").textContent).toBe("Nick");
    // …and its row opens the Compendium, closing the sheet.
    const buttons = screen.getAllByRole("button", { name: "Open Dagger in the Compendium" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(weaponsOpened).toEqual(["Dagger", "Dagger"]);
    expect(screen.queryByRole("heading", { name: "Selene" })).toBeNull();
  });

  it("shows Unarmed Strike on every character, row and sheet, linking to the Compendium", () => {
    addCharacter({ name: "Brawler", race: null, class: null, level: 1, ac: null, hp: null, spells: [], weapons: [] });
    render(<PartyWidget />);
    // One Unarmed Strike pill per character (Selene + Brawler), even with no weapons.
    const pills = screen.getAllByRole("button", { name: "Open Unarmed Strike in the Compendium" });
    expect(pills).toHaveLength(2);
    expect(pills[0].textContent).toMatch(/1 \+ Str/);
    fireEvent.click(pills[1]);
    expect(weaponsOpened).toEqual(["Unarmed Strike"]);

    fireEvent.click(screen.getAllByTitle("View character sheet")[1]);
    expect(screen.getAllByRole("button", { name: "Open Unarmed Strike in the Compendium" })).toHaveLength(3);
  });
});
