// @vitest-environment jsdom
//
// Component coverage for the AI Chat mount guard. singletonWidget.test.ts
// proves the slot's ownership rules are RIGHT; nothing there proves the
// exported AIChatWidget USES them — a widget that rendered the session
// unconditionally would leave that file green while two mounted tiles clobber
// the shared dm-ai-chat-v1 transcript last-writer-wins. That convergence is
// only observable with the real component mounted twice.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// The bridge client would fetch() a real /health on mount; reject it so every
// instance settles in the bridge-down state (the chat view with a banner) —
// this suite only cares which instance renders a chat view at all.
vi.mock("@/lib/aiBridge", () => {
  class BridgeOriginError extends Error {}
  class BridgeUnreachableError extends Error {}
  return {
    checkHealth: vi.fn(() => Promise.reject(new BridgeUnreachableError("down"))),
    streamChat: vi.fn(),
    stallTimeoutForTurn: () => 1_000,
    friendlyToolName: (name: string) => name,
    BridgeOriginError,
    BridgeUnreachableError,
  };
});

// localLookup (imported by the widget and by ChatToolCard) transitively pulls
// the multi-MB bundled datasets; none of these tests look anything up.
vi.mock("@/lib/localLookup", () => ({
  parseLookupCommand: () => null,
  lookupDataset: () => ({ exact: null, candidates: [] }),
  autoDetectLocal: () => null,
  LOCAL_TOOL: "local_lookup",
  resolveBundledSpell: () => null,
}));

import { AIChatWidget } from "./AIChatWidget";

const COMPOSER_PLACEHOLDER = "Ask Selene…";
const DUPLICATE_NOTICE = /already open in another tile/i;

describe("AIChatWidget singleton mount guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("mounts one live chat and renders the duplicate tile as a placeholder", async () => {
    render(
      <>
        <AIChatWidget key="a" />
        <AIChatWidget key="b" />
      </>,
    );

    // The losing instance explains itself instead of mounting a second copy of
    // the transcript store…
    expect(await screen.findByText(DUPLICATE_NOTICE)).toBeTruthy();
    // …and exactly one live chat view exists (composer = the session mounted).
    expect(await screen.findAllByPlaceholderText(COMPOSER_PLACEHOLDER)).toHaveLength(1);
  });

  it("hands the slot to the surviving tile when the owning tile unmounts", async () => {
    const { rerender } = render(
      <>
        <AIChatWidget key="a" />
        <AIChatWidget key="b" />
      </>,
    );
    await screen.findByText(DUPLICATE_NOTICE);

    // Remove the first (owning) instance; keyed reconciliation keeps "b" alive.
    rerender(
      <>
        <AIChatWidget key="b" />
      </>,
    );

    // The former duplicate takes over as a real chat view.
    expect(await screen.findByPlaceholderText(COMPOSER_PLACEHOLDER)).toBeTruthy();
    expect(screen.queryByText(DUPLICATE_NOTICE)).toBeNull();
  });

  it("a single mount never shows the duplicate placeholder", async () => {
    render(<AIChatWidget />);
    await screen.findByPlaceholderText(COMPOSER_PLACEHOLDER);
    expect(screen.queryByText(DUPLICATE_NOTICE)).toBeNull();
  });
});
