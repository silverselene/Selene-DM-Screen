// @vitest-environment jsdom
//
// Prepared vs known spells in the Party widget, using Claude Skamos (Wizard 2):
// the row shows prepared spells and tucks the rest of the spellbook behind a
// "+N known" toggle; the character sheet lists them in separate sections; and
// the edit form's circle toggle changes what's prepared and saves it.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("@/data/weapons", () => ({ weaponsData: [] }));
vi.mock("@/data/spells", () => ({
  spellData: [
    { name: "Fire Bolt", level: 0, school: "Evocation", classes: ["Wizard"], description: "" },
    { name: "Chromatic Orb", level: 1, school: "Evocation", classes: ["Wizard"], description: "" },
    { name: "Magic Missile", level: 1, school: "Evocation", classes: ["Wizard"], description: "" },
    { name: "Shield", level: 1, school: "Abjuration", classes: ["Wizard"], description: "" },
  ],
  spellSchools: [],
  spellClasses: [],
}));

import { PartyWidget } from "./PartyWidget";
import { addCharacter, loadParty } from "@/lib/partyStore";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const tomeButton = (name: string) =>
  screen.queryAllByRole("button", { name: `Open ${name} in the Wizard's Tome` });

describe("PartyWidget — prepared vs known spells", () => {
  beforeEach(() => {
    window.localStorage.clear();
    addCharacter({
      name: "Claude Skamos", race: "Tiefling", class: "Wizard", level: 2, ac: 10, hp: 10, weapons: [],
      spells: ["Fire Bolt", "Chromatic Orb", "Magic Missile", "Shield"],
      prepared: ["Fire Bolt", "Chromatic Orb"],
    });
  });
  afterEach(() => cleanup());

  it("shows prepared spells on the row and the spellbook behind '+N known'", () => {
    render(<PartyWidget />);
    expect(tomeButton("Fire Bolt")).toHaveLength(1);
    expect(tomeButton("Chromatic Orb")).toHaveLength(1);
    expect(tomeButton("Magic Missile")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "+2 known" }));
    expect(tomeButton("Magic Missile")).toHaveLength(1);
    expect(tomeButton("Shield")[0].getAttribute("title")).toMatch(/not prepared/);
    fireEvent.click(screen.getByRole("button", { name: "Hide known" }));
    expect(tomeButton("Shield")).toHaveLength(0);
  });

  it("lists prepared and known-only spells in separate sheet sections", () => {
    render(<PartyWidget />);
    fireEvent.click(screen.getByTitle("View character sheet"));
    const prepared = screen.getByText("Prepared spells").parentElement!;
    const known = screen.getByText(/Known — not prepared/).parentElement!;
    expect(within(prepared).queryByText("Chromatic Orb")).toBeTruthy();
    expect(within(prepared).queryByText("Shield")).toBeNull();
    expect(within(known).queryByText("Shield")).toBeTruthy();
    expect(within(known).queryByText("Magic Missile")).toBeTruthy();
  });

  it("prepares / unprepares a spell from the edit form and saves it", () => {
    render(<PartyWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Edit character" }));
    fireEvent.click(screen.getByRole("button", { name: "Prepare Shield" }));
    fireEvent.click(screen.getByRole("button", { name: "Unprepare Chromatic Orb" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(loadParty()[0].prepared).toEqual(["Fire Bolt", "Shield"]);
  });
});
