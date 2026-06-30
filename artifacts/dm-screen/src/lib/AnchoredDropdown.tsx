// Portal-rendered dropdown anchored to a target element. Used by every
// search-style suggestion list in the app so the list escapes the tile's
// `overflow: hidden` clipping and floats above adjacent UI.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function AnchoredDropdown({
  anchor,
  open,
  children,
  role,
  id,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  children: ReactNode;
  /** ARIA role for the floating container (e.g. "listbox"). Optional — tag
   *  inputs leave it unset; the Combobox sets it for combobox semantics. */
  role?: string;
  id?: string;
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
    // The anchor can also move for reasons that fire neither scroll nor
    // resize: a sidebar collapse, a tile/grid resize, or an async webfont
    // landing all reflow layout in place. Observe the anchor itself and the
    // document root so the dropdown re-measures instead of sticking to a
    // stale rect.
    const ro = new ResizeObserver(update);
    ro.observe(anchor);
    ro.observe(document.documentElement);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [open, anchor]);

  if (!open || !rect) return null;
  return createPortal(
    <div
      role={role}
      id={id}
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
