// Portal-rendered dropdown anchored to a target element. Used by every
// search-style suggestion list in the app so the list escapes the tile's
// `overflow: hidden` clipping and floats above adjacent UI.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const MARGIN = 4; // gap between the anchor and the floating list
const MAX_HEIGHT = 192; // matches the previous max-h-48 (12rem) ceiling

export function AnchoredDropdown({
  anchor,
  open,
  children,
  role,
  id,
  onRequestClose,
  autoWidth = false,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  children: ReactNode;
  /** ARIA role for the floating container (e.g. "listbox"). Optional — tag
   *  inputs leave it unset; the Combobox sets it for combobox semantics. */
  role?: string;
  id?: string;
  /** When provided, the dropdown requests a close on an outside pointerdown
   *  or an Escape keypress. Opt-in — anchors that already close on blur
   *  (e.g. the Combobox) don't need it; tag inputs that don't, do. */
  onRequestClose?: () => void;
  /** Size to the content instead of matching the anchor's width, using the
   *  anchor width only as a floor. For compact pickers whose options are wider
   *  than the trigger (search inputs, which are wider than their options, leave
   *  this off so the list matches the field). Capped to the viewport so a wide
   *  menu next to the right edge stays on-screen. */
  autoWidth?: boolean;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Outside-dismiss (opt-in). pointerdown — not click — so an option's
  // `onMouseDown` pick still wins, and a scroll-drag that starts elsewhere
  // dismisses cleanly. Ignore presses on the anchor or inside the list.
  useEffect(() => {
    if (!open || !onRequestClose) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (anchor?.contains(t) || dropdownRef.current?.contains(t)) return;
      onRequestClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, anchor, onRequestClose]);

  if (!open || !rect) return null;

  // Placement: prefer opening downward, but flip above the anchor when the
  // space below would clip the list and there's more room above (an anchor in
  // a bottom grid row, or a short tile). Cap the height to the chosen side so
  // the list never runs off-screen — it scrolls instead.
  const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
  const spaceAbove = rect.top - MARGIN;
  const placeAbove = spaceBelow < MAX_HEIGHT && spaceAbove > spaceBelow;
  const maxHeight = Math.max(
    64,
    Math.min(MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow),
  );

  const style: CSSProperties = {
    position: "fixed",
    left: rect.left,
    // Default: match the anchor's width. autoWidth: size to content with the
    // anchor width as a floor, capped to the space up to the viewport's right
    // edge so a menu wider than its trigger doesn't run off-screen.
    ...(autoWidth
      ? { width: "max-content", minWidth: rect.width, maxWidth: window.innerWidth - rect.left - MARGIN }
      : { width: rect.width }),
    zIndex: 9999,
    maxHeight,
    ...(placeAbove
      ? { bottom: window.innerHeight - rect.top + MARGIN }
      : { top: rect.bottom + MARGIN }),
  };

  return createPortal(
    <div
      ref={dropdownRef}
      role={role}
      id={id}
      style={style}
      className="bg-gray-900 border border-gray-700 rounded shadow-xl overflow-y-auto"
    >
      {children}
    </div>,
    document.body,
  );
}
