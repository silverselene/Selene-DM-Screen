// @vitest-environment jsdom
//
// Component coverage for the Compendium's render cap + footer and the
// precomputed search index. The real data modules (compendiumRules.ts is
// ~660 kB) are mocked with a small synthetic set so the counts are controlled
// and the transform stays cheap.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// vi.mock is hoisted above module scope, so the mock data must live in
// vi.hoisted (not plain consts) to be referenceable inside the factories.
const { HAND, RULES } = vi.hoisted(() => {
  // 250 same-category rules → a one-word query matches all of them, exceeding
  // the 200 render cap. Distinct titles so each is a real row.
  const RULES = Array.from({ length: 250 }, (_, i) => ({
    id: `rule-${i}`,
    title: `Testrule ${String(i).padStart(3, "0")}`,
    category: "Rules",
    content: "matches the query token widgettoken",
    tags: ["rules"],
  }));
  const HAND = [
    { id: "h-1", title: "Grappling", category: "Combat", content: "UPPERCASEBODY only here", tags: ["combat"] },
  ];
  return { HAND, RULES };
});

vi.mock("@/data/compendium", () => ({ compendiumData: HAND }));
vi.mock("@/data/compendiumRules", () => ({ compendiumRulesData: RULES }));

import { CompendiumWidget } from "./CompendiumWidget";

const seedQuery = (q: string) =>
  window.localStorage.setItem("dm-compendium-query-v1", JSON.stringify(q));

describe("CompendiumWidget cap + footer + search index", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("previews only 7 unfiltered with a 'search to filter' footer", async () => {
    render(<CompendiumWidget />);
    // 7 preview rows (mock total is 251), and the unfiltered footer.
    expect(await screen.findByText(/search to filter/i)).toBeTruthy();
    expect(screen.getByText(/Showing 7 of 251/)).toBeTruthy();
  });

  it("caps a broad filtered match at 200 rows with a 'refine your search' footer", async () => {
    seedQuery("widgettoken"); // matches all 250 synthetic rules via content
    render(<CompendiumWidget />);
    expect(await screen.findByText(/refine your search/i)).toBeTruthy();
    expect(screen.getByText(/Showing first 200 of 250/)).toBeTruthy();
  });

  it("matches content case-insensitively through the precomputed index", async () => {
    seedQuery("uppercasebody"); // lower-case query vs UPPERCASE content
    render(<CompendiumWidget />);
    const list = await screen.findByText("Grappling");
    expect(list).toBeTruthy();
    // Only the one hand-curated entry matches — no rules footer.
    expect(screen.queryByText(/refine your search/i)).toBeNull();
  });

  it("shows a no-results state for a query that matches nothing", async () => {
    seedQuery("zzz-nonexistent-token");
    render(<CompendiumWidget />);
    expect(await screen.findByText(/No entries found/i)).toBeTruthy();
  });
});
