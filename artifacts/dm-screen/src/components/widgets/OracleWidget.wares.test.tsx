// @vitest-environment jsdom
//
// Component coverage for the Oracle's new Wares tab: a shop dropdown
// (Tavern/Blacksmith/Trader/Alchemist) that rolls 3-5 priced items.
//
// WHY THIS FILE EXISTS, given generators.test.ts already covers
// `generateWares`/`rollWarePrice`: those prove the DATA is right. Nothing
// there proves the WIDGET renders it correctly — `parseWareLines` and the
// result/history JSX live entirely in OracleWidget.tsx and split on the
// generator's `"Name — price"` line format by hand, so a format drift
// between the two would only show up here. Also covers the tab-switch
// invariant every other Oracle tab already relies on: each tab keeps its
// own history, so rolling Wares must not disturb Names' last result.
//
// Math.random is mocked to a constant so which items get picked (and their
// rolled prices) is fully deterministic — see the trace in the comment
// above the mock.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OracleWidget } from "./OracleWidget";

function mockRandom(value: number) {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

// The shop dropdown's <option> text and the result card's shop-name header
// render the same string ("Tavern", "Blacksmith", ...), so a plain
// `getByText` is ambiguous between them — this picks the header specifically.
function shopHeader(name: string): HTMLElement {
  const matches = screen.getAllByText(name);
  const header = matches.find((el) => el.tagName === "SPAN");
  if (!header) throw new Error(`no result-card header found for "${name}"`);
  return header;
}

describe("OracleWidget — Wares tab", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("offers the four requested shop types, defaulting to Tavern", async () => {
    const user = userEvent.setup();
    render(<OracleWidget />);
    await user.click(screen.getByRole("button", { name: "Wares" }));

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("Tavern");
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      "Tavern", "Blacksmith", "Trader", "Alchemist",
    ]);
  });

  it("rolls 3-5 distinct priced items and renders each as its own row", async () => {
    // With Math.random pinned at 0: count clamps to the minimum (3), and the
    // distinct-pick loop always takes the pool's current head, so the roll is
    // deterministic — see generators.test.ts's rollWarePrice trace for why
    // this pins the price at each entry's `min`.
    mockRandom(0);
    const user = userEvent.setup();
    render(<OracleWidget />);
    await user.click(screen.getByRole("button", { name: "Wares" }));
    await user.click(screen.getByRole("button", { name: /Generate/ }));

    expect(shopHeader("Tavern")).toBeTruthy();
    expect(screen.getByText("Tankard of Ale")).toBeTruthy();
    expect(screen.getByText("3 sp")).toBeTruthy();
    expect(screen.getByText("Mug of Dwarven Stout")).toBeTruthy();
    expect(screen.getByText("6 sp")).toBeTruthy();
    expect(screen.getByText("Bottle of Common Wine")).toBeTruthy();
    expect(screen.getByText("2 gp")).toBeTruthy();
  });

  it("rolls from the selected shop's own table, not the default", async () => {
    mockRandom(0);
    const user = userEvent.setup();
    render(<OracleWidget />);
    await user.click(screen.getByRole("button", { name: "Wares" }));
    await user.selectOptions(screen.getByRole("combobox"), "Blacksmith");
    await user.click(screen.getByRole("button", { name: /Generate/ }));

    expect(shopHeader("Blacksmith")).toBeTruthy();
    // Blacksmith's first three entries in min=0 order (see waresByShop).
    expect(screen.getByText("Dagger")).toBeTruthy();
    expect(screen.getByText("Handaxe")).toBeTruthy();
    expect(screen.getByText("Shortsword")).toBeTruthy();
    // A Tavern item must not leak in just because it was the prior selection.
    expect(screen.queryByText("Tankard of Ale")).toBeNull();
  });

  it("keeps Wares history separate from every other tab's history", async () => {
    mockRandom(0);
    const user = userEvent.setup();
    render(<OracleWidget />);

    // Roll on Names first (default tab).
    await user.click(screen.getByRole("button", { name: /Generate/ }));
    const namesResult = screen.getByText((_, el) => el?.tagName === "DIV" && el.className.includes("font-semibold") && el.textContent !== "");

    // Switch to Wares, roll, then switch back.
    await user.click(screen.getByRole("button", { name: "Wares" }));
    await user.click(screen.getByRole("button", { name: /Generate/ }));
    expect(screen.getByText("Tankard of Ale")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Names" }));
    // Names' result is exactly what it was before Wares was touched.
    expect(namesResult.textContent).not.toBe("");
    expect(screen.queryByText("Tankard of Ale")).toBeNull();
  });

  it("folds a previous wares roll into one condensed history line", async () => {
    mockRandom(0);
    const user = userEvent.setup();
    render(<OracleWidget />);
    await user.click(screen.getByRole("button", { name: "Wares" }));

    // Two rolls so the first one drops into "Previous Results".
    await user.click(screen.getByRole("button", { name: /Generate/ }));
    await user.click(screen.getByRole("button", { name: /Generate/ }));

    // Scoped to the history section specifically — the result card ABOVE it
    // shows an identical roll (same mocked Math.random), so an unscoped query
    // for "Tankard of Ale" would match both.
    const historySection = within(screen.getByText("Previous Results").parentElement!);
    expect(historySection.getByText("Previous Results")).toBeTruthy();
    // The condensed line joins name+price pairs with " · " rather than
    // rendering the raw "\n"-joined string, which HTML would collapse to
    // unreadable run-together text.
    const historyLine = historySection.getByText("Tankard of Ale").closest("div")!;
    expect(historyLine.textContent).toContain("Tankard of Ale (3 sp)");
    expect(historyLine.textContent).toContain("Mug of Dwarven Stout (6 sp)");
    expect(historyLine.textContent).toContain(" · ");
  });
});
