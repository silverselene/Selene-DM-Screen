import type { ReactNode } from "react";
import { useSingletonSlot, type SingletonSlot } from "@/lib/singletonWidget";

// Shared mount-time guard for singleton widgets. A widget whose whole persisted
// state lives on one storage key (with per-mount in-memory snapshots and
// whole-value writes, no same-tab change event) silently last-writer-wins
// clobbers itself when two live copies mount — see SINGLETON_WIDGET_TYPES in
// types.ts. The selector UI already refuses to place a second tile, but tiles
// also arrive via restored backups, the recent-widgets list, and hand-edited
// storage, so the widget itself needs this guard: whichever instance claims the
// slot first renders, any other renders an "already open" placeholder, and the
// slot hands over automatically when the owner unmounts.
//
// Wrap the real (hooks-holding) body as `children`: the element is created each
// render, but React only mounts it — and runs its hooks — when this returns it,
// so a duplicate never spins up a second stateful copy. Initiative and AI Chat
// pre-date this helper and inline the same three-branch pattern.
export function SingletonGate({
  slot,
  icon,
  name,
  children,
}: {
  slot: SingletonSlot;
  icon: ReactNode;
  /** Widget label, e.g. "Notepad" — filled into the placeholder sentence. */
  name: string;
  children: ReactNode;
}) {
  const mount = useSingletonSlot(slot);
  // "pending" is the pre-layout-effect first render — render nothing, not the
  // placeholder. The claim resolves before paint (see useSingletonSlot), so a
  // legitimate single mount reaches "owner" without this frame ever painting.
  if (mount === "pending") return null;
  if (mount === "duplicate") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4">
        {icon}
        <p className="text-xs leading-relaxed max-w-[16rem]" style={{ color: "var(--dm-t3)" }}>
          {name} is already open in another tile. It keeps one saved state, so it
          can only be open once — remove this tile, or close the other one to use
          it here.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
