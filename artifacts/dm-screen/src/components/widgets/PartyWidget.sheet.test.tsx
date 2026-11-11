// @vitest-environment jsdom
//
// Party widget: collapsing a row to one line (and that it persists), the
// character sheet's layout (combat numbers, ability scores, weapons + spells),
// and entering ability scores in the edit form.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("@/data/weapons", () => ({
  weaponsData: [{ id: 1, name: "Dagger", category: "simple", damage: "1d4", damage_type: "Piercing", properties: ["Finesse", "Thrown", "Range 20/60"], mastery: ["Nick"], kind: "melee" }],
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
    // Passive Perception is the fifth combat tile, right after Proficiency.
    const tiles = [...sheet.querySelectorAll("[data-combat-stat]")].map((t) => t.textContent);
    expect(tiles).toHaveLength(5);
    expect(tiles[3]).toContain("Proficiency");
    expect(tiles[4]).toContain("Passive Perception");
    expect(tiles[4]).toContain("11"); // 10 + WIS 13 → +1

    const weapons = within(sheet).getByRole("region", { name: "Weapons" });
    // STR 8 → −1: Unarmed Strike to hit −1 + 2 = +1, damage 1 − 1 = 0.
    expect(weapons.textContent).toContain("+1 to hit · 0 Bludgeoning");
    expect(within(weapons).getByText("Dagger")).toBeTruthy();
    // Reach / range sit on the damage line; the range isn't repeated as a property chip.
    const dagger = within(weapons).getByText("Dagger").closest("button")!;
    const damageLine = within(dagger).getByText("1d4 Piercing").parentElement!;
    expect(damageLine.textContent).toContain("Reach 5 ft");
    expect(damageLine.textContent).toContain("Range 20/60 ft");
    expect(within(dagger).queryByText("Range 20/60")).toBeNull();
    expect(weapons.textContent).toContain("+1 to hit · 0 BludgeoningReach 5 ft");
    expect(within(within(sheet).getByRole("region", { name: "Spells" })).getByText("Fire Bolt")).toBeTruthy();
  });

  it("shows each weapon pill's range (or reach) right after its damage", () => {
    render(<PartyWidget />);
    const dagger = screen.getByRole("button", { name: "Open Dagger in the Compendium" });
    expect(dagger.textContent).toBe("Dagger1d4 P20/60 ft");
    const unarmed = screen.getByRole("button", { name: "Open Unarmed Strike in the Compendium" });
    expect(unarmed.textContent).toBe("Unarmed Strike1 + Str B5 ft");
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

  it("lists all 18 skills with modifiers, and cycles proficiency by clicking a circle", () => {
    render(<PartyWidget />);
    fireEvent.click(screen.getByTitle("View character sheet"));
    const skills = within(screen.getByRole("dialog", { name: /Claude Skamos/ })).getByRole("group", { name: "Skills" });
    expect(within(skills).getAllByRole("listitem")).toHaveLength(18);

    const arcanaRow = () => within(skills).getByText("Arcana").closest("li")!;
    expect(arcanaRow().textContent).toContain("+3"); // INT 16, not proficient
    fireEvent.click(within(skills).getByRole("button", { name: "Arcana: not proficient" }));
    expect(arcanaRow().textContent).toContain("+5"); // + PB 2
    expect(loadParty()[0].skills).toEqual({ arcana: "proficient" });
    fireEvent.click(within(skills).getByRole("button", { name: "Arcana: proficient" }));
    expect(arcanaRow().textContent).toContain("+7"); // expertise
    expect(within(skills).queryByText("Passive Perception")).toBeNull(); // moved to the top tiles
  });

  it("keeps skills when the character is edited and saved", () => {
    window.localStorage.clear();
    addCharacter({ ...CLAUDE, skills: { arcana: "expertise" } });
    render(<PartyWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Edit character" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(loadParty()[0].skills).toEqual({ arcana: "expertise" });
  });
});
