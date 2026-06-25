// Portal-rendered dropdown anchored to a target element. Used by every
// search-style suggestion list in the app so the list escapes the tile's
// `overflow: hidden` clipping and floats above adjacent UI.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function AnchoredDropdown({
  anchor,
  open,
  children,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  children: ReactNode;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open || !anchor) {
      setRect(null);
      return;
    }
    const update = () => setRect(anchor.getBoundingClientRect());
    update();
    // capture: catch scrolls in any ancestor, not just window.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchor]);

  if (!open || !rect) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        top: rect.bottom + 2,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      }}
      className="bg-gray-900 border border-gray-700 rounded shadow-xl max-h-48 overflow-y-auto"
    >
      {children}
    </div>,
    document.body,
  );
}
