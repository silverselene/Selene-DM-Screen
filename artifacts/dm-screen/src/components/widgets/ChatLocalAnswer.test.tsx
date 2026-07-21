// @vitest-environment jsdom
//
// Component coverage for the "Ask Selene instead" escalate affordance on a
// bundled-data answer. The headline case is the streaming guard: escalate()
// bails on an in-flight turn, so the link must be DISABLED (not a silent no-op)
// while a turn streams. Also pins when the link shows at all.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ChatLocalAnswer } from "./ChatLocalAnswer";
import type { LocalAnswer } from "@/lib/chatHistory";

// A "no match in bundled data" answer renders the escalate link without needing
// a ToolResultCard fixture (card/candidates paths would replace the list).
const NO_MATCH: LocalAnswer = { noMatch: "goblin" };
const LINK = /ask selene instead/i;

afterEach(() => cleanup());

describe("ChatLocalAnswer escalate link", () => {
  it("shows the link and escalates on click when idle", () => {
    const onEscalate = vi.fn();
    render(<ChatLocalAnswer answer={NO_MATCH} escalated={false} onEscalate={onEscalate} />);
    const btn = screen.getByRole("button", { name: LINK }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onEscalate).toHaveBeenCalledTimes(1);
  });

  it("disables the link (no silent no-op) while a turn is streaming", () => {
    const onEscalate = vi.fn();
    render(<ChatLocalAnswer answer={NO_MATCH} escalated={false} busy onEscalate={onEscalate} />);
    const btn = screen.getByRole("button", { name: LINK }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // jsdom honors `disabled`: the click never reaches onClick.
    fireEvent.click(btn);
    expect(onEscalate).not.toHaveBeenCalled();
  });

  it("hides the link once the answer has been escalated", () => {
    render(<ChatLocalAnswer answer={NO_MATCH} escalated onEscalate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: LINK })).toBeNull();
  });

  it("hides the link for a bare-command usage hint (a nudge, not an answer)", () => {
    render(
      <ChatLocalAnswer answer={{ hint: "Try /spell <name>" }} escalated={false} onEscalate={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: LINK })).toBeNull();
  });
});
