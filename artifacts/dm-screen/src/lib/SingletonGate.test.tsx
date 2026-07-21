// @vitest-environment jsdom
//
// Component coverage for the shared SingletonGate mount guard. Notepad,
// Bestiary, Compendium, Wizard's Tome, Portal, and Oracle each wrap their
// stateful body in this gate (AI Chat and Initiative pre-date it and inline the
// same pattern, covered by their own suites). Testing the gate directly with a
// trivial child covers all six without transforming their heavy data modules:
// the guard is what stops two live copies from clobbering the single storage
// key they share.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SingletonGate } from "./SingletonGate";
import { createSingletonSlot } from "./singletonWidget";
import { SINGLETON_WIDGET_TYPES } from "@/types";

const DUPLICATE_NOTICE = /already open in another tile/i;
const BODY = "live-body";

function Gate({ slot }: { slot: ReturnType<typeof createSingletonSlot> }) {
  return (
    <SingletonGate slot={slot} name="Widget" icon={<span>icon</span>}>
      <div>{BODY}</div>
    </SingletonGate>
  );
}

describe("SingletonGate", () => {
  afterEach(() => cleanup());

  it("mounts one live body and renders any duplicate as a placeholder", async () => {
    const slot = createSingletonSlot();
    render(
      <>
        <Gate key="a" slot={slot} />
        <Gate key="b" slot={slot} />
      </>,
    );
    expect(await screen.findByText(DUPLICATE_NOTICE)).toBeTruthy();
    expect(screen.getAllByText(BODY)).toHaveLength(1);
  });

  it("hands the slot to the surviving mount when the owner unmounts", async () => {
    const slot = createSingletonSlot();
    const { rerender } = render(
      <>
        <Gate key="a" slot={slot} />
        <Gate key="b" slot={slot} />
      </>,
    );
    await screen.findByText(DUPLICATE_NOTICE);

    rerender(
      <>
        <Gate key="b" slot={slot} />
      </>,
    );
    expect(await screen.findByText(BODY)).toBeTruthy();
    expect(screen.queryByText(DUPLICATE_NOTICE)).toBeNull();
  });

  it("a single mount never shows the duplicate placeholder", async () => {
    const slot = createSingletonSlot();
    render(<Gate slot={slot} />);
    await screen.findByText(BODY);
    expect(screen.queryByText(DUPLICATE_NOTICE)).toBeNull();
  });

  it("keeps every stateful widget in SINGLETON_WIDGET_TYPES", () => {
    for (const type of ["notepad", "oracle", "bestiary", "compendium", "wizard-tome", "portal"] as const) {
      expect(SINGLETON_WIDGET_TYPES.has(type)).toBe(true);
    }
  });
});
