// @vitest-environment jsdom
//
// Weapons in the Compendium: a weapon entry renders as a WeaponCard whose
// property / mastery chips explain themselves, and the `dm-open-weapon`
// hand-off (Party weapon pills, routed by App as the `target` prop) opens the
// card — or, for a name that isn't bundled, searches it. The bulk rules
// module is mocked; the (small) real weapons dataset is used.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// Just the generated "Unarmed Strike" variant rule — the weapon card
// supersedes it, so it must not show up as a second search result.
vi.mock("@/data/compendiumRules", () => ({
  compendiumRulesData: [
    {
      id: "variant-unarmed-strike",
      title: "Unarmed Strike",
      category: "Variant Rules",
      content: "Instead of using a weapon to make a melee attack…",
      tags: ["variant rule"],
    },
  ],
}));

import { CompendiumWidget } from "./CompendiumWidget";

const read = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? "null");

describe("CompendiumWidget — weapons", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("opens a weapon card from the target and clears the signal", async () => {
    const onTargetClear = vi.fn();
    render(<CompendiumWidget target="dagger" onTargetClear={onTargetClear} />);

    expect(await screen.findByRole("heading", { name: "Dagger" })).toBeTruthy();
    expect(screen.getByText("Simple Melee Weapon")).toBeTruthy();
    expect(screen.getByText("1d4 Piercing")).toBeTruthy();
    expect(screen.getByText("20/60 ft.")).toBeTruthy();
    expect(onTargetClear).toHaveBeenCalledTimes(1);
  });

  it("explains the mastery and properties inline when their chips are clicked", async () => {
    render(<CompendiumWidget target="Dagger" />);
    fireEvent.click(await screen.findByRole("button", { name: /Mastery: Nick/ }));
    const panel = screen.getByRole("region", { name: "Mastery: Nick" });
    expect(panel.textContent).toMatch(/extra attack of the Light property/);

    fireEvent.click(screen.getByRole("button", { name: "Finesse" }));
    expect(screen.getByRole("region", { name: "Property: Finesse" }).textContent).toMatch(
      /Strength or Dexterity/,
    );
    // Clicking the open chip again closes it.
    fireEvent.click(screen.getByRole("button", { name: "Finesse" }));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("falls back to an all-category search for a name that isn't bundled", async () => {
    window.localStorage.setItem("dm-compendium-category-v1", JSON.stringify("Conditions"));
    const onTargetClear = vi.fn();
    render(<CompendiumWidget target="Longsword, +1" onTargetClear={onTargetClear} />);

    expect(
      ((await screen.findByPlaceholderText("Search 5.5e rules…")) as HTMLInputElement).value,
    ).toBe("Longsword, +1");
    expect(read("dm-compendium-category-v1")).toBe("All");
    expect(read("dm-compendium-entry-v1")).toBeNull();
    expect(onTargetClear).toHaveBeenCalledTimes(1);
  });

  it("lists weapons with their damage and mastery, filterable by the Weapons category", async () => {
    window.localStorage.setItem("dm-compendium-category-v1", JSON.stringify("Weapons"));
    window.localStorage.setItem("dm-compendium-query-v1", JSON.stringify("dagger"));
    render(<CompendiumWidget />);
    const row = (await screen.findByText("Dagger")).closest("button")!;
    expect(row.textContent).toMatch(/1d4 P/);
    expect(row.textContent).toMatch(/Nick/);
  });

  it("shows Unarmed Strike as a weapon card with Damage / Grapple / Shove, listed once", async () => {
    render(<CompendiumWidget target="Unarmed Strike" />);
    expect(await screen.findByRole("heading", { name: "Unarmed Strike" })).toBeTruthy();
    for (const o of ["Damage", "Grapple", "Shove"]) expect(screen.getAllByText(o).length).toBeGreaterThan(0);
    expect(screen.getByText("Str mod + Proficiency")).toBeTruthy();

    cleanup();
    window.localStorage.setItem("dm-compendium-query-v1", JSON.stringify("unarmed strike"));
    window.localStorage.setItem("dm-compendium-entry-v1", JSON.stringify(null));
    render(<CompendiumWidget />);
    await screen.findAllByRole("button");
    const titled = screen.getAllByText("Unarmed Strike").filter((el) => el.closest("button"));
    expect(titled).toHaveLength(1);
  });
});
