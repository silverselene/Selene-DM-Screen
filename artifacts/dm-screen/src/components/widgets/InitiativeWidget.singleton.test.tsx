// @vitest-environment jsdom
//
// Component coverage for the Initiative mount guard, mirroring
// AIChatWidget.singleton.test.tsx. Each mounted Initiative copy holds an
// independent useLocalStorage snapshot of dm-initiative-v1 and writes the
// whole combatant list back, and the hook has no same-tab change event —
// so two live copies silently clobber each other's mid-encounter HP/turn
// state last-writer-wins (only the dm-add-to-initiative event path is
// first-consumer-guarded). The selector refuses a second tile via
// SINGLETON_WIDGET_TYPES; this guard covers tiles arriving by other routes
// (restored backup, hand-edited storage).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// InitiativeWidget → monsterSearch → src/data/monsters.ts is 4.7 MB of
// TypeScript; none of these tests search monsters, so mock the module out
// rather than pay to transform the dataset (same as the addPaths suite).
vi.mock("@/lib/monsterSearch", () => ({
  searchMonsters: () => [],
}));

import { InitiativeWidget } from "./InitiativeWidget";
import { SINGLETON_WIDGET_TYPES } from "@/types";

// A live tracker renders its add-combatant control; the duplicate renders
// an explanatory placeholder instead.
const LIVE_CONTROL_TITLE = "Add a combatant";
const DUPLICATE_NOTICE = /already open in another tile/i;

describe("InitiativeWidget singleton mount guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("is refused at placement time via SINGLETON_WIDGET_TYPES", () => {
    expect(SINGLETON_WIDGET_TYPES.has("initiative")).toBe(true);
  });

  it("mounts one live tracker and renders the duplicate tile as a placeholder", async () => {
    render(
      <>
        <InitiativeWidget key="a" />
        <InitiativeWidget key="b" />
      </>,
    );

    expect(await screen.findByText(DUPLICATE_NOTICE)).toBeTruthy();
    expect(await screen.findAllByTitle(LIVE_CONTROL_TITLE)).toHaveLength(1);
  });

  it("hands the slot to the surviving tile when the owning tile unmounts", async () => {
    const { rerender } = render(
      <>
        <InitiativeWidget key="a" />
        <InitiativeWidget key="b" />
      </>,
    );
    await screen.findByText(DUPLICATE_NOTICE);

    rerender(
      <>
        <InitiativeWidget key="b" />
      </>,
    );

    expect(await screen.findByTitle(LIVE_CONTROL_TITLE)).toBeTruthy();
    expect(screen.queryByText(DUPLICATE_NOTICE)).toBeNull();
  });

  it("a single mount never shows the duplicate placeholder", async () => {
    render(<InitiativeWidget />);
    await screen.findByTitle(LIVE_CONTROL_TITLE);
    expect(screen.queryByText(DUPLICATE_NOTICE)).toBeNull();
  });
});
