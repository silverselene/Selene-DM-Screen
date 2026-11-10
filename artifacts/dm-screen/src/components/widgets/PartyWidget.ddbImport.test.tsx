// @vitest-environment jsdom
//
// Component coverage for the Party widget's "Import from D&D Beyond" flow:
// an import must land in the editable form (never straight in the roster),
// canonicalize names against the bundled datasets, save through the normal
// add path, and — when a same-named PC exists — refresh that one instead of
// adding a duplicate. Also covers the fetch → paste fallback. The heavy
// datasets are mocked with small sets.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/data/weapons", () => ({
  weaponsData: [
    { id: "w1", name: "Quarterstaff", category: "simple", damage: "1d6", damage_type: "bludgeoning", properties: ["Versatile"] },
  ],
}));
vi.mock("@/data/spells", () => ({
  spellData: [{ name: "Fire Bolt", level: 0, school: "Evocation", classes: ["Wizard"], description: "zap" }],
  spellSchools: ["Evocation"],
  spellClasses: ["Wizard"],
}));

import { PartyWidget } from "./PartyWidget";
import { addCharacter, loadParty } from "@/lib/partyStore";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const stats = [8, 14, 14, 16, 12, 10].map((value, i) => ({ id: i + 1, value }));

const ddbJson = JSON.stringify({
  success: true,
  data: {
    id: 42,
    name: "Selene",
    race: { fullName: "High Elf" },
    classes: [{ level: 5, isStartingClass: true, definition: { name: "Wizard" } }],
    stats,
    baseHitPoints: 27,
    modifiers: {},
    inventory: [
      { id: 1, equipped: true, definition: { id: 1, name: "quarterstaff", filterType: "Weapon" } },
    ],
    classSpells: [{ spells: [{ prepared: false, definition: { name: "fire bolt", level: 0 } }] }],
  },
});

function openPasteAndImport(json: string) {
  fireEvent.click(screen.getByRole("button", { name: "Import from D&D Beyond" }));
  fireEvent.click(screen.getByText("Paste the character JSON instead"));
  fireEvent.change(screen.getByLabelText("D&D Beyond character JSON"), { target: { value: json } });
  fireEvent.click(screen.getByRole("button", { name: "Use pasted JSON" }));
}

describe("PartyWidget — D&D Beyond import", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("prefills the New character form for review, then saves on demand", () => {
    render(<PartyWidget />);
    openPasteAndImport(ddbJson);

    expect(screen.getByText("New character")).toBeTruthy();
    expect(screen.getByText(/Imported from D&D Beyond/)).toBeTruthy();
    expect((screen.getByPlaceholderText("Name *") as HTMLInputElement).value).toBe("Selene");
    // Nothing written until the DM saves.
    expect(loadParty()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Save Character" }));
    const [pc] = loadParty();
    expect(pc).toMatchObject({
      name: "Selene",
      race: "High Elf",
      class: "Wizard",
      level: 5,
      ac: 12,
      hp: 37,
      // Canonicalized to the bundled datasets' spelling.
      weapons: ["Quarterstaff"],
      spells: ["Fire Bolt"],
      // The import fills the D&D Beyond link from the character's id.
      ddbUrl: "https://www.dndbeyond.com/characters/42",
    });
    expect(screen.queryByText(/Imported from D&D Beyond/)).toBeNull();
  });

  it("updates an existing same-named character instead of adding a duplicate", () => {
    addCharacter({ name: "selene", race: null, class: null, level: 1, ac: 10, hp: 8, spells: [], weapons: [] });
    render(<PartyWidget />);
    openPasteAndImport(ddbJson);

    expect(screen.queryByText("New character")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const party = loadParty();
    expect(party).toHaveLength(1);
    expect(party[0]).toMatchObject({ name: "Selene", level: 5, hp: 37 });
  });

  it("shows the parse error and keeps the panel open on bad JSON", () => {
    render(<PartyWidget />);
    openPasteAndImport("{ not json");
    expect(screen.getByRole("alert").textContent).toMatch(/valid JSON/);
    expect(screen.queryByText("New character")).toBeNull();
  });

  it("fetches by link, and on a blocked fetch offers the JSON link to paste from", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    render(<PartyWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Import from D&D Beyond" }));
    fireEvent.change(screen.getByLabelText("D&D Beyond character link or ID"), {
      target: { value: "https://www.dndbeyond.com/characters/42" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Couldn't reach D&D Beyond/));
    const link = screen.getByRole("link", { name: /character JSON/ }) as HTMLAnchorElement;
    expect(link.href).toBe("https://character-service.dndbeyond.com/character/v5/character/42");
    expect(screen.getByLabelText("D&D Beyond character JSON")).toBeTruthy();
  });

  it("fills the form straight from a successful fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(ddbJson, { status: 200 })));
    render(<PartyWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Import from D&D Beyond" }));
    fireEvent.change(screen.getByLabelText("D&D Beyond character link or ID"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => expect(screen.getByText("New character")).toBeTruthy());
    expect((screen.getByPlaceholderText("Name *") as HTMLInputElement).value).toBe("Selene");
  });
});
