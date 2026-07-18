// @vitest-environment jsdom
//
// Component coverage for the duplicate-player confirm across the Initiative
// widget's add paths — items 11a/11b of MANUAL-TESTS-post-rebase.md, which
// caught the original "Add to Initiative silently added a duplicate PC" bug by
// hand.
//
// WHY THIS FILE EXISTS, given combatant.test.ts already covers the rules:
// those tests prove `decideInitiativeAdd` is RIGHT. Nothing there proves the
// widget's add paths USE it — a form that called `setCombatants` directly would
// bypass the confirm entirely and leave all of combatant.test.ts green. That
// convergence is only observable with the real component mounted.
//
// This is the only jsdom file in the suite; it opts in via the docblock above
// so the pure-logic tests keep running in the fast Node env. What jsdom CANNOT
// do (and stays manual / Playwright): real modal semantics — jsdom's
// window.confirm throws "Not implemented", so it is stubbed here and these
// tests assert the prompt's CONTENT and its EFFECT, not that a browser drew a
// dialog; layout-dependent behavior (AnchoredDropdown's flip needs a real
// getBoundingClientRect); and localStorage quota.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Combatant, PlayerCharacter } from "@/types";

// InitiativeWidget → monsterSearch → src/data/monsters.ts is 4.7 MB of
// TypeScript, and none of these tests care WHICH monsters the index holds — only
// that the monster form's add goes through the same rule as every other path.
// So mock the module down to one fixture hit rather than make every run in this
// file pay to transform the dataset.
vi.mock("@/lib/monsterSearch", () => ({
  searchMonsters: () => [
    {
      id: "index:Goblin:MM",
      name: "Goblin",
      size: "Small",
      type: "humanoid",
      ac: 15,
      acType: "leather armor",
      hp: "7 (2d6)",
      cr: "1/4",
      source: "MM",
      isLegendary: false,
      initiativeModifier: 2,
      hasFullStatBlock: false,
    },
  ],
}));

import { InitiativeWidget } from "./InitiativeWidget";
import {
  addCombatantToInitiative,
  confirmDuplicateViaWindow,
  INITIATIVE_STORAGE_KEY,
  MAX_COMBATANTS,
  mintCombatantId,
} from "@/lib/combatant";

const PARTY_STORAGE_KEY = "dm-party-v1";

function aragornCombatant(initiative = 18): Combatant {
  return {
    id: mintCombatantId(),
    name: "Aragorn",
    initiative,
    hp: 30,
    maxHp: 30,
    ac: 16,
    isPlayer: true,
  };
}

function aragornPc(): PlayerCharacter {
  return {
    id: 1,
    name: "Aragorn",
    race: "Human",
    class: "Ranger",
    level: 5,
    ac: 16,
    hp: 30,
    spells: [],
    weapons: [],
  };
}

/** Seed the tracker with an Aragorn already rolled at 18. */
function seedInitiativeWithAragorn() {
  window.localStorage.setItem(
    INITIATIVE_STORAGE_KEY,
    JSON.stringify([aragornCombatant(18)]),
  );
}

/** The combatant list as the widget has actually committed it. useLocalStorage
 *  writes through synchronously on every setCombatants, so this is the DM's
 *  persisted encounter — a sturdier observable than scraping rows out of the
 *  markup for "what ended up in the tracker". */
function committed(): Combatant[] {
  const raw = window.localStorage.getItem(INITIATIVE_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Combatant[]) : [];
}

const confirmMock = () => vi.mocked(window.confirm);
const alertMock = () => vi.mocked(window.alert);
const confirmMessage = () => String(confirmMock().mock.calls[0]?.[0] ?? "");

/** The player form's three number inputs, in DOM order. They have <label>s but
 *  no htmlFor and no wrapping, so getByLabelText can't reach them; number
 *  inputs expose the spinbutton role, which can. */
function playerFormNumbers() {
  const [initiative, hp, ac] = screen.getAllByRole("spinbutton") as HTMLInputElement[];
  return { initiative, hp, ac };
}

const nameInput = () => screen.getByPlaceholderText("Name") as HTMLInputElement;
const playerCheckbox = () =>
  screen.getByLabelText("Player Character") as HTMLInputElement;

async function openAddForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle("Add a combatant"));
}

/** Drive the monster tab as far as a selected Goblin, ready to commit. The
 *  result list is debounced 80ms behind the query, hence the find*. */
async function selectGoblin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Monster" }));
  await user.type(screen.getByPlaceholderText("Search monsters…"), "gob");
  await user.click(await screen.findByRole("button", { name: /Goblin.*CR 1\/4/ }));
}

beforeEach(() => {
  window.localStorage.clear();
  // jsdom defines window.confirm/alert but throws "Not implemented" on call.
  // Default the confirm to "declined" — the test that needs acceptance says so.
  vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("11a · the duplicate-PC confirm fires from every add path", () => {
  it("manual form, with the Player Character box ticked", async () => {
    const user = userEvent.setup();
    seedInitiativeWithAragorn();
    render(<InitiativeWidget />);

    await openAddForm(user);
    await user.type(nameInput(), "Aragorn");
    // The form defaults to isPlayer: false (freshForm) — an unticked box is a
    // custom monster/NPC and must NOT warn, so ticking it is the point here.
    await user.click(playerCheckbox());
    await user.click(screen.getByRole("button", { name: "Add to Initiative" }));

    expect(confirmMock()).toHaveBeenCalledOnce();
    // Names the PC and its existing roll — that's what tells the DM whether
    // this is a mis-click or a deliberate re-roll.
    expect(confirmMessage()).toContain("Aragorn");
    expect(confirmMessage()).toContain("18");
    expect(committed()).toHaveLength(1);
  });

  it("manual form does NOT warn when the Player Character box is left unticked", async () => {
    // The negative half of the same path: an unticked box is a monster/NPC, and
    // five goblins in one fight is routine.
    const user = userEvent.setup();
    seedInitiativeWithAragorn();
    render(<InitiativeWidget />);

    await openAddForm(user);
    await user.type(nameInput(), "Aragorn");
    await user.click(screen.getByRole("button", { name: "Add to Initiative" }));

    expect(confirmMock()).not.toHaveBeenCalled();
    expect(committed()).toHaveLength(2);
  });

  it("Add from party", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PARTY_STORAGE_KEY, JSON.stringify([aragornPc()]));
    seedInitiativeWithAragorn();
    render(<InitiativeWidget />);

    await openAddForm(user);
    await user.click(screen.getByRole("button", { name: "Party" }));
    // Pick Aragorn out of the roster list, then commit. The roster button's
    // accessible name carries the race/class line; the commit button below
    // doesn't — that's what keeps these two "Aragorn" buttons apart.
    await user.click(screen.getByRole("button", { name: /Aragorn.*Ranger/ }));
    await user.click(
      screen.getByRole("button", { name: "Add Aragorn to Initiative" }),
    );

    expect(confirmMock()).toHaveBeenCalledOnce();
    expect(confirmMessage()).toContain("18");
    expect(committed()).toHaveLength(1);
  });

  it("a Party-widget / AI-chat-card dispatch reaching the mounted widget", async () => {
    // Those two widgets add through addCombatantToInitiative, exactly as called
    // here. combatant.test.ts covers this round trip against a MODEL of the
    // consumer; this runs it against the real mounted widget, which is the part
    // that model can't vouch for.
    seedInitiativeWithAragorn();
    render(<InitiativeWidget />);

    let result: string | undefined;
    act(() => {
      result = addCombatantToInitiative(aragornCombatant(4), {
        confirmDuplicate: confirmDuplicateViaWindow,
      });
    });

    expect(confirmMock()).toHaveBeenCalledOnce();
    expect(result).toBe("cancelled");
    expect(committed()).toHaveLength(1);
  });
});

describe("the monster form converges on the same rule as the rest", () => {
  // The fourth add path (InitiativeWidget.tsx names three local forms plus the
  // dm-add-to-initiative handler). The duplicate confirm is vacuous here —
  // findDuplicatePlayer ignores monsters, since five goblins in one fight is
  // routine — so the observable that proves addMonster goes through commitAdd
  // rather than calling setCombatants itself is the OTHER rule commitAdd
  // enforces: the MAX_COMBATANTS refusal.
  it("adds a monster without prompting, even against a same-named PC", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      INITIATIVE_STORAGE_KEY,
      JSON.stringify([{ ...aragornCombatant(18), name: "Goblin" }]),
    );
    render(<InitiativeWidget />);

    await openAddForm(user);
    await selectGoblin(user);
    await user.click(screen.getByRole("button", { name: "Add Monster to Initiative" }));

    // A doppelganger of a PC is a deliberate DM move, not a mistake.
    expect(confirmMock()).not.toHaveBeenCalled();
    expect(committed()).toHaveLength(2);
  });

  it("refuses at the MAX_COMBATANTS cap and says so", async () => {
    const user = userEvent.setup();
    const full = Array.from({ length: MAX_COMBATANTS }, () => ({
      ...aragornCombatant(10),
      name: "Filler",
      isPlayer: false,
    }));
    window.localStorage.setItem(INITIATIVE_STORAGE_KEY, JSON.stringify(full));
    render(<InitiativeWidget />);

    await openAddForm(user);
    await selectGoblin(user);
    await user.click(screen.getByRole("button", { name: "Add Monster to Initiative" }));

    expect(alertMock()).toHaveBeenCalledOnce();
    expect(String(alertMock().mock.calls[0]?.[0])).toContain("full");
    expect(committed()).toHaveLength(MAX_COMBATANTS);
  });
});

describe("11b · declining loses nothing, accepting adds the row", () => {
  it("Cancel adds nothing and leaves the typed row intact", async () => {
    const user = userEvent.setup();
    seedInitiativeWithAragorn();
    render(<InitiativeWidget />);

    await openAddForm(user);
    await user.type(nameInput(), "Aragorn");
    await user.click(playerCheckbox());
    await user.clear(playerFormNumbers().initiative);
    await user.type(playerFormNumbers().initiative, "7");

    await user.click(screen.getByRole("button", { name: "Add to Initiative" }));

    expect(confirmMock()).toHaveBeenCalledOnce();
    expect(committed()).toHaveLength(1);
    // The heart of 11b: a mis-click must not cost the DM their typed row. The
    // form stays open and populated, ready for a second attempt.
    expect(nameInput().value).toBe("Aragorn");
    expect(playerFormNumbers().initiative.value).toBe("7");
    expect(playerCheckbox().checked).toBe(true);
  });

  it("OK adds the second entry and closes the form", async () => {
    const user = userEvent.setup();
    confirmMock().mockReturnValue(true);
    seedInitiativeWithAragorn();
    render(<InitiativeWidget />);

    await openAddForm(user);
    await user.type(nameInput(), "Aragorn");
    await user.click(playerCheckbox());
    await user.clear(playerFormNumbers().initiative);
    await user.type(playerFormNumbers().initiative, "7");

    await user.click(screen.getByRole("button", { name: "Add to Initiative" }));

    expect(confirmMock()).toHaveBeenCalledOnce();
    const list = committed();
    expect(list).toHaveLength(2);
    // Sorted descending by initiative — the accepted duplicate lands below.
    expect(list.map((c) => c.initiative)).toEqual([18, 7]);
    // Form closed and reset on success, so both Aragorns are list rows.
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
    expect(screen.getAllByText("Aragorn")).toHaveLength(2);
    expect(alertMock()).not.toHaveBeenCalled();
  });
});
