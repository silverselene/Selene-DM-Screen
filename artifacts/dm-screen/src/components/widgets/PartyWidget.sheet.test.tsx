// @vitest-environment jsdom
//
// Party widget: collapsing a row to one line (and that it persists), the
// character sheet's layout (combat numbers, ability scores, weapons + spells),
// and entering ability scores in the edit form.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("@/data/weapons", () => ({
  weaponsData: [{ id: 1, name: "Dagger", category: "simple", damage: "1d4", damage_type: "Piercing", properties: ["Finesse"], mastery: ["Nick"] }],
}));
vi.mock("@/data/spells", () => ({
  spellData: [{ name: "Fire Bolt", level: 0, school: "Evocation", classes: ["Wizard"], description: "" }],
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

const CLAUDE = {
  name: "Claude Skamos", race: "Tiefling", class: "Wizard", level: 2, ac: 10, hp: 10,
  spells: ["Fire Bolt"], weapons: ["Dagger"],
  abilities: { str: 8, dex: 10, con: 12, int: 16, wis: 13, cha: 14 },
};

describe("PartyWidget — collapsed rows + character sheet", () => {
  beforeEach(() => {
    window.localStorage.clear();
    addCharacter(CLAUDE);
  });
  afterEach(() => cleanup());

  it("collapses a row to one line, keeps the sheet clickable, and remembers it", () => {
    const { unmount } = render(<PartyWidget />);
    expect(screen.getByText("Tiefling · Wizard")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Dagger in the Compendium" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Claude Skamos to one line" }));
    expect(screen.queryByText("Tiefling · Wizard")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Dagger in the Compendium" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Fire Bolt in the Wizard's Tome" })).toBeNull();

    // Clicking the name still opens the sheet.
    fireEvent.click(screen.getByText("Claude Skamos"));
    expect(screen.getByRole("dialog", { name: /Claude Skamos/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Survives a remount (persisted), and expands again.
    unmount();
    render(<PartyWidget />);
    expect(screen.queryByText("Tiefling · Wizard")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Claude Skamos" }));
    expect(screen.getByText("Tiefling · Wizard")).toBeTruthy();
  });

  it("lays the sheet out with combat numbers, abilities on the left, weapons + spells on the right", () => {
    render(<PartyWidget />);
    fireEvent.click(screen.getByTitle("View character sheet"));
    const sheet = screen.getByRole("dialog", { name: /Claude Skamos/ });

    const abilities = within(sheet).getByRole("region", { name: "Ability scores" });
    const int = within(abilities).getByTitle("Intelligence");
    expect(int.textContent).toContain("+3");
    expect(int.textContent).toContain("16");
    // Initiative = DEX mod, proficiency from level 2.
    expect(within(sheet).getByText("Initiative").parentElement!.textContent).toContain("+0");
    expect(within(sheet).getByText("Proficiency").parentElement!.textContent).toContain("+2");

    const weapons = within(sheet).getByRole("region", { name: "Weapons" });
    // STR 8 → −1: Unarmed Strike to hit −1 + 2 = +1, damage 1 − 1 = 0.
    expect(weapons.textContent).toContain("+1 to hit · 0 Bludgeoning");
    expect(within(weapons).getByText("Dagger")).toBeTruthy();
    expect(within(within(sheet).getByRole("region", { name: "Spells" })).getByText("Fire Bolt")).toBeTruthy();
  });

  it("saves ability scores entered in the edit form", () => {
    render(<PartyWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Edit character" }));
    fireEvent.change(screen.getByLabelText("Strength"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Charisma"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(loadParty()[0].abilities).toEqual({ str: 15, dex: 10, con: 12, int: 16, wis: 13, cha: null });
  });

  it("adds, opens, changes and removes a D&D Beyond link from the sheet", () => {
    render(<PartyWidget />);
    fireEvent.click(screen.getByTitle("View character sheet"));
    const sheet = () => screen.getByRole("dialog", { name: /Claude Skamos/ });

    fireEvent.click(within(sheet()).getByRole("button", { name: "Add D&D Beyond link" }));
    const input = within(sheet()).getByLabelText("D&D Beyond link");
    fireEvent.change(input, { target: { value: "https://evil.example/x" } });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Save" }));
    expect(within(sheet()).getByRole("alert").textContent).toMatch(/dndbeyond\.com/);
    expect(loadParty()[0].ddbUrl).toBeNull();

    fireEvent.change(within(sheet()).getByLabelText("D&D Beyond link"), {
      target: { value: "dndbeyond.com/characters/12345678" },
    });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Save" }));
    const link = within(sheet()).getByRole("link", { name: /Open on D&D Beyond/ }) as HTMLAnchorElement;
    expect(link.href).toBe("https://dndbeyond.com/characters/12345678");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(loadParty()[0].ddbUrl).toBe("https://dndbeyond.com/characters/12345678");

    fireEvent.click(within(sheet()).getByRole("button", { name: "Remove D&D Beyond link" }));
    expect(within(sheet()).queryByRole("link", { name: /Open on D&D Beyond/ })).toBeNull();
    expect(loadParty()[0].ddbUrl).toBeNull();
  });

  it("edits the link in the edit form, refusing to save a non-D&D Beyond address", () => {
    render(<PartyWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Edit character" }));
    const field = screen.getByLabelText("D&D Beyond link");
    fireEvent.change(field, { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/isn't a dndbeyond\.com address/)).toBeTruthy();
    expect(loadParty()[0].ddbUrl).toBeNull();

    fireEvent.change(screen.getByLabelText("D&D Beyond link"), { target: { value: "98765" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(loadParty()[0].ddbUrl).toBe("https://www.dndbeyond.com/characters/98765");
  });
});
