// @vitest-environment jsdom
//
// Component coverage for AI Chat's degraded-mode banner: the mount health probe
// settles status to "offline" (unreachable) or "blocked" (origin-refused, a
// 403 → BridgeOriginError), each with its own banner, and the chat view stays
// mounted either way. Also pins the banner-transition gap: a successful Retry
// clears the banner. Only checkHealth is mocked; the rest of aiBridge is real.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/lib/aiBridge", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/aiBridge")>();
  return { ...actual, checkHealth: vi.fn() };
});

import { AIChatWidget } from "./AIChatWidget";
import { checkHealth, BridgeOriginError, type BridgeHealth } from "@/lib/aiBridge";

const mockedCheckHealth = vi.mocked(checkHealth);
const ONLINE: BridgeHealth = { billing: "subscription", ddbMcpFound: true } as BridgeHealth;

// jsdom lacks these; AnchoredDropdown/auto-scroll touch them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

const OFFLINE_BANNER = /AI bridge not running/i;
const BLOCKED_BANNER = /AI bridge refused this page/i;

describe("AIChatWidget degraded-mode banner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedCheckHealth.mockReset();
  });
  afterEach(() => cleanup());

  it("shows the 'not running' banner when the bridge is unreachable", async () => {
    mockedCheckHealth.mockRejectedValue(new Error("ECONNREFUSED"));
    render(<AIChatWidget />);
    expect(await screen.findByText(OFFLINE_BANNER)).toBeTruthy();
    // Composer stays mounted — bundled-data lookups remain usable.
    expect(screen.getByPlaceholderText(/Ask Selene/i)).toBeTruthy();
  });

  it("shows the 'refused this page' banner on an origin block (403)", async () => {
    mockedCheckHealth.mockRejectedValue(new BridgeOriginError());
    render(<AIChatWidget />);
    expect(await screen.findByText(BLOCKED_BANNER)).toBeTruthy();
    expect(screen.queryByText(OFFLINE_BANNER)).toBeNull();
  });

  it("shows no banner when the bridge is online", async () => {
    mockedCheckHealth.mockResolvedValue(ONLINE);
    render(<AIChatWidget />);
    expect(await screen.findByPlaceholderText(/Ask Selene/i)).toBeTruthy();
    expect(screen.queryByText(OFFLINE_BANNER)).toBeNull();
    expect(screen.queryByText(BLOCKED_BANNER)).toBeNull();
  });

  it("clears the banner on a successful Retry", async () => {
    mockedCheckHealth.mockRejectedValueOnce(new Error("down"));
    render(<AIChatWidget />);
    await screen.findByText(OFFLINE_BANNER);

    mockedCheckHealth.mockResolvedValue(ONLINE); // next probe succeeds
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await vi.waitFor(() => expect(screen.queryByText(OFFLINE_BANNER)).toBeNull());
  });
});
