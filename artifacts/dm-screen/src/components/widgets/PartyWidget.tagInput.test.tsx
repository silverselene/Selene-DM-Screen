// @vitest-environment jsdom
//
// Component coverage for the weapon tag-input's refocus-reopen behavior: after
// an outside-click dismiss (AnchoredDropdown fires onRequestClose on an outside
// pointerdown, which sets open=false but leaves the cached suggestions intact),
// refocusing the field with a query present must reopen the list — otherwise it
// was unreachable without changing the query. SpellTagInput carries the
// identical onFocus handler. The heavy datasets are mocked with small sets.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/data/weapons", () => ({
  weaponsData: [
    { id: "w1", name: "Longsword", category: "martial", damage: "1d8", damage_type: "slashing", properties: ["Versatile"] },
    { id: "w2", name: "Longbow", category: "martial", damage: "1d8", damage_type: "piercing", properties: ["Ammunition"] },
  ],
}));
vi.mock("@/data/spells", () => ({
  spellData: [{ name: "Fireball", level: 3, school: "Evocation", classes: ["Wizard"], description: "boom" }],
  spellSchools: ["Evocation"],
  spellClasses: ["Wizard"],
}));

import { PartyWidget } from "./PartyWidget";

// AnchoredDropdown observes its anchor via ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const WEAPON_PLACEHOLDER = "Search or type a weapon…";

describe("PartyWidget weapon tag input — refocus reopens suggestions", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("reopens the cached suggestion list on refocus after an outside-click dismiss", async () => {
    render(<PartyWidget />);

    // Open the add-character form, then type into the weapon field.
    fireEvent.click(screen.getByText("Add Character"));
    const input = screen.getByPlaceholderText(WEAPON_PLACEHOLDER);
    fireEvent.change(input, { target: { value: "long" } });

    // Debounced (80 ms) filter opens the dropdown with both matches.
    expect(await screen.findByText("Longsword")).toBeTruthy();

    // Outside-click dismiss: AnchoredDropdown closes on an outside pointerdown.
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Longsword")).toBeNull();

    // Refocus with the query still present → the list comes back.
    fireEvent.focus(input);
    expect(await screen.findByText("Longsword")).toBeTruthy();
  });
});
