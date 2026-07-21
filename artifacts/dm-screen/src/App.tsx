import { useState, useEffect, useMemo, useRef } from "react";
import { DragonHeader } from "@/components/DragonHeader";
import { DMTile } from "@/components/DMTile";
import { WidgetSelectorModal } from "@/components/WidgetSelectorModal";
import { Sidebar } from "@/components/Sidebar";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  MAX_TILES,
  footprintCells,
  tilesLayoutConsistent,
  validateArrayOfEnum,
  validateBoundedInt,
  validateTiles,
} from "@/lib/backup";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { PLACEABLE_WIDGET_TYPES, SINGLETON_WIDGET_TYPES, type TileEntry, type WidgetType } from "@/types";

const empty = (): TileEntry => ({ widget: "empty", colSpan: 1, rowSpan: 1 });

const getDefaultTiles = (cols: number, rows: number): TileEntry[] =>
  Array.from({ length: cols * rows }, empty);

// Validators paired with each persistent key. Same shape checks the
// backup-import path runs — so a malformed stored value (DevTools edit,
// SW cache mismatch, future write bug) falls back to defaults instead of
// crashing render.
const validateGridDim = validateBoundedInt(2, 4);
const validateRecentWidgets = validateArrayOfEnum(PLACEABLE_WIDGET_TYPES, MAX_TILES);

// Re-pack the non-empty widgets from `tiles` into a fresh cols×rows grid,
// preserving each widget's span where it still fits (falling back to 1×1)
// and reporting the widgets that don't fit at all. Pure — shared by the
// sidebar's grid-resize handler AND the read-path consistency guard in
// AppContent, so the two can never disagree about how a layout is
// repaired.
function repackTiles(
  tiles: TileEntry[],
  newCols: number,
  newRows: number,
): { next: TileEntry[]; dropped: WidgetType[] } {
  const newCount = newCols * newRows;

  // Real (non-empty) widgets currently placed, in order. `null` entries are
  // span placeholders, not content, so they're skipped here.
  const placed = tiles
    .filter((t): t is NonNullable<TileEntry> => t !== null && t.widget !== "empty")
    .map((t) => ({ widget: t.widget, colSpan: t.colSpan, rowSpan: t.rowSpan }));

  // occupied[] tracks cells already claimed by an earlier widget's span so
  // a later one can't overlap it.
  const next: TileEntry[] = Array.from({ length: newCount }, () => empty());
  const occupied = new Array<boolean>(newCount).fill(false);

  const fits = (start: number, cSpan: number, rSpan: number): boolean => {
    const startCol = start % newCols;
    const startRow = Math.floor(start / newCols);
    if (startCol + cSpan > newCols || startRow + rSpan > newRows) return false;
    for (const idx of footprintCells(start, newCols, cSpan, rSpan))
      if (occupied[idx]) return false;
    return true;
  };

  const dropped: WidgetType[] = [];
  for (const w of placed) {
    // Try the widget at its current span first, then fall back to 1×1 so a
    // spanned widget is only discarded when the grid is genuinely full.
    let slot = -1;
    let cSpan: 1 | 2 = w.colSpan;
    let rSpan: 1 | 2 = w.rowSpan;
    const attempts: [1 | 2, 1 | 2][] =
      w.colSpan === 1 && w.rowSpan === 1
        ? [[1, 1]]
        : [[w.colSpan, w.rowSpan], [1, 1]];
    for (const [cs, rs] of attempts) {
      for (let i = 0; i < newCount; i++) {
        if (!occupied[i] && fits(i, cs, rs)) {
          slot = i;
          cSpan = cs;
          rSpan = rs;
          break;
        }
      }
      if (slot !== -1) break;
    }
    if (slot === -1) {
      dropped.push(w.widget);
      continue;
    }
    next[slot] = { widget: w.widget, colSpan: cSpan, rowSpan: rSpan };
    for (const idx of footprintCells(slot, newCols, cSpan, rSpan)) {
      occupied[idx] = true;
      if (idx !== slot) next[idx] = null;
    }
  }

  return { next, dropped };
}

// Which cells are claimed by some OTHER tile's footprint, for validating a
// drag-to-resize target. `excludeIdx`'s own footprint (including any cells
// it currently spans into) is left unmarked — the tile being resized is
// always free to shrink or regrow over its own prior space. A plain 1×1
// "empty" tile doesn't block — growing into open space is the point of the
// gesture — but a *stretched* empty placeholder (colSpan/rowSpan > 1) does,
// same as a real widget: it's cells a DM deliberately reserved, unlike the
// old expand/contract buttons, which only ever checked a single neighboring
// cell and could silently orphan a stretched empty tile's second cell.
function computeOccupancyExcluding(
  gridTiles: TileEntry[],
  cols: number,
  excludeIdx: number,
): boolean[] {
  const occ = new Array<boolean>(gridTiles.length).fill(false);
  for (let idx = 0; idx < gridTiles.length; idx++) {
    const t = gridTiles[idx];
    if (t === null || idx === excludeIdx) continue;
    const blocks = t.widget !== "empty" || t.colSpan > 1 || t.rowSpan > 1;
    if (!blocks) continue;
    for (const cell of footprintCells(idx, cols, t.colSpan, t.rowSpan))
      if (cell < occ.length) occ[cell] = true;
  }
  return occ;
}

// A tile is drag-reorderable only at 1×1 — swapping is a plain array-index
// exchange, which isn't well-defined for a spanned tile that covers more
// than one grid cell.
function canDragTile(entry: TileEntry): boolean {
  return entry !== null && entry.widget !== "empty" && entry.colSpan === 1 && entry.rowSpan === 1;
}

interface ResizePreview {
  index: number;
  colSpan: 1 | 2;
  rowSpan: 1 | 2;
  valid: boolean;
}

function AppContent() {
  const { isDark } = useTheme();
  const [cols, setCols] = useLocalStorage<number>("dm-grid-cols", 3, validateGridDim);
  const [rows, setRows] = useLocalStorage<number>("dm-grid-rows", 3, validateGridDim);
  const [tiles, setTiles] = useLocalStorage<TileEntry[]>(
    "dm-tiles-v3",
    getDefaultTiles(3, 3),
    validateTiles,
  );
  const [recentWidgets, setRecentWidgets] = useLocalStorage<WidgetType[]>(
    "dm-recent-widgets",
    [],
    validateRecentWidgets,
  );
  const [selectingTile, setSelectingTile] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bestiaryTarget, setBestiaryTarget] = useState<string | null>(null);

  // Drag-to-reorder + drag-to-resize UI state. Neither is persisted — both
  // reset to nothing on reload, same as any other in-flight gesture.
  const [dragSrc, setDragSrc] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Cross-key consistency guard, mirroring the import path's grid-triple
  // eviction in backup.ts: cols/rows/tiles are three independent setItem
  // writes (and useLocalStorage swallows a quota throw per key), so a
  // failure between them — or a DevTools edit — can persist dimensions
  // that disagree with tiles.length OR a tiles array of the right length
  // whose span placeholders don't line up (a colSpan:2 tile missing its
  // trailing `null`). Each key validates fine in isolation, then the span
  // math (`i + cols`) nulls the wrong cells or renders overlaps. Render
  // from a reconciled array (re-packing the placed widgets into the
  // cols×rows grid, same repair the resize handler applies — repackTiles
  // always emits a footprint-consistent layout) and heal storage below.
  const gridTiles = useMemo(
    () =>
      tilesLayoutConsistent(tiles, cols, rows)
        ? tiles
        : repackTiles(tiles, cols, rows).next,
    [tiles, cols, rows],
  );
  useEffect(() => {
    if (gridTiles !== tiles) setTiles(gridTiles);
  }, [gridTiles, tiles, setTiles]);

  // Widget types currently on the dashboard — used to refuse a second copy of
  // a singleton widget (AI Chat: two mounted copies clobber the shared saved
  // transcript) in the selector and the recent-widgets restore. The widget
  // itself carries a mount-time guard too, for tiles that arrive by other
  // routes (restored backup, hand-edited storage).
  const placedWidgets = useMemo(
    () =>
      new Set<WidgetType>(
        gridTiles.flatMap((t) => (t !== null && t.widget !== "empty" ? [t.widget] : [])),
      ),
    [gridTiles],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail?.name;
      if (!name) return;
      setBestiaryTarget(name);
      setTiles((prev) => {
        const hasBestiary = prev.some((t) => t !== null && t.widget === "bestiary");
        if (hasBestiary) return prev;
        const next = [...prev];
        const firstEmpty = next.findIndex((t) => t !== null && t.widget === "empty");
        if (firstEmpty !== -1) {
          next[firstEmpty] = { widget: "bestiary", colSpan: 1, rowSpan: 1 };
        }
        return next;
      });
    };
    window.addEventListener("dm-open-bestiary", handler);
    return () => window.removeEventListener("dm-open-bestiary", handler);
  }, [setTiles]);

  const update = (fn: (draft: TileEntry[]) => TileEntry[]) =>
    setTiles((prev) => fn([...prev]));

  const pushRecent = (widget: WidgetType) => {
    if (widget === "empty") return;
    setRecentWidgets((prev) =>
      [widget, ...prev.filter((w) => w !== widget)].slice(0, 8)
    );
  };

  const handleSelectWidget = (widget: WidgetType) => {
    if (selectingTile === null) return;
    // The modal renders an already-placed singleton widget disabled; this
    // holds the no-duplicates invariant even if that UI changes. Close the
    // modal rather than no-op silently — a dead click would otherwise strand it
    // open with no feedback (the widget is already on the board).
    if (SINGLETON_WIDGET_TYPES.has(widget) && placedWidgets.has(widget)) {
      setSelectingTile(null);
      return;
    }
    update((t) => {
      const entry = t[selectingTile];
      if (entry) t[selectingTile] = { ...entry, widget };
      return t;
    });
    setSelectingTile(null);
  };

  const handleClear = (i: number) => {
    update((t) => {
      const entry = t[i];
      if (!entry) return t;
      pushRecent(entry.widget);
      if (entry.colSpan === 2 && i + 1 < t.length) t[i + 1] = empty();
      if (entry.rowSpan === 2 && i + cols < t.length) t[i + cols] = empty();
      if (entry.colSpan === 2 && entry.rowSpan === 2 && i + cols + 1 < t.length)
        t[i + cols + 1] = empty();
      t[i] = { widget: "empty", colSpan: 1, rowSpan: 1 };
      return t;
    });
  };

  // Replaces the old four expand/contract buttons: one corner drag commits
  // whatever footprint the pointer settled on (see `startResize`), growing
  // or shrinking in either dimension in a single gesture.
  const handleResizeTile = (i: number, newColSpan: 1 | 2, newRowSpan: 1 | 2) => {
    update((t) => {
      const entry = t[i];
      if (!entry) return t;
      const { colSpan: oldColSpan, rowSpan: oldRowSpan } = entry;
      // Free every cell the old footprint covered, then re-claim the new
      // one fresh — simpler and more robust than diffing old vs. new spans.
      for (let r = 0; r < oldRowSpan; r++)
        for (let c = 0; c < oldColSpan; c++) {
          const idx = i + r * cols + c;
          if (idx !== i && idx < t.length) t[idx] = empty();
        }
      t[i] = { ...entry, colSpan: newColSpan, rowSpan: newRowSpan };
      for (let r = 0; r < newRowSpan; r++)
        for (let c = 0; c < newColSpan; c++) {
          const idx = i + r * cols + c;
          if (idx !== i && idx < t.length) t[idx] = null;
        }
      return t;
    });
  };

  // Pointer-driven corner resize. Reads the grid's live pixel geometry once
  // at drag start, then on every move recomputes the snapped target span
  // from scratch against the original pointer-down position (not the
  // previous frame) so there's no drift, and validates it against every
  // other tile's current footprint before letting `resizePreview` show gold
  // (valid) or red (would overlap something).
  const startResize = (e: React.PointerEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const gridEl = gridRef.current;
    const entry = gridTiles[i];
    if (!gridEl || !entry) return;

    const rect = gridEl.getBoundingClientRect();
    const gap = 10;
    const cellW = (rect.width - (cols - 1) * gap) / cols;
    const cellH = (rect.height - (rows - 1) * gap) / rows;
    const col0 = i % cols;
    const row0 = Math.floor(i / cols);
    const startColSpan = entry.colSpan;
    const startRowSpan = entry.rowSpan;
    const startX = e.clientX;
    const startY = e.clientY;
    const occ = computeOccupancyExcluding(gridTiles, cols, i);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let newColSpan: 1 | 2 = startColSpan;
      let newRowSpan: 1 | 2 = startRowSpan;
      if (dx > cellW * 0.4) newColSpan = 2;
      else if (dx < -cellW * 0.4) newColSpan = 1;
      if (dy > cellH * 0.4) newRowSpan = 2;
      else if (dy < -cellH * 0.4) newRowSpan = 1;
      if (col0 + newColSpan > cols) newColSpan = (cols - col0) as 1 | 2;
      if (row0 + newRowSpan > rows) newRowSpan = (rows - row0) as 1 | 2;

      let valid = true;
      for (let r = 0; r < newRowSpan && valid; r++) {
        for (let c = 0; c < newColSpan; c++) {
          if (r === 0 && c === 0) continue;
          if (occ[(row0 + r) * cols + (col0 + c)]) { valid = false; break; }
        }
      }
      setResizePreview({ index: i, colSpan: newColSpan, rowSpan: newRowSpan, valid });
    };

    const onUp = () => {
      setResizePreview((prev) => {
        if (prev && prev.index === i && prev.valid) {
          handleResizeTile(i, prev.colSpan, prev.rowSpan);
        }
        return null;
      });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Drag-to-reorder: swap two 1×1 tiles (dropping onto an empty 1×1 slot
  // just moves the dragged tile there — swapping its content with "empty"
  // is already exactly that). Spanned tiles opt out via `canDragTile`.
  const handleTileDrop = (targetIdx: number) => {
    const srcIdx = dragSrc;
    setDragSrc(null);
    setDragOverIdx(null);
    if (srcIdx === null || srcIdx === targetIdx) return;
    const src = gridTiles[srcIdx];
    const dest = gridTiles[targetIdx];
    if (!canDragTile(src)) return;
    if (dest === null || dest.colSpan !== 1 || dest.rowSpan !== 1) return;
    update((t) => {
      const tmp = t[targetIdx];
      t[targetIdx] = t[srcIdx];
      t[srcIdx] = tmp;
      return t;
    });
  };

  const handleRestoreRecent = (widget: WidgetType) => {
    // A singleton widget can sit in "recently removed" while a copy of it was
    // re-added through the selector; restoring the chip then would place a
    // duplicate tile. It's already on the board — just retire the stale chip.
    if (SINGLETON_WIDGET_TYPES.has(widget) && placedWidgets.has(widget)) {
      setRecentWidgets((prev) => prev.filter((w) => w !== widget));
      return;
    }
    const firstEmpty = tiles.findIndex(
      (t) => t !== null && t.widget === "empty"
    );
    if (firstEmpty === -1) return;
    update((t) => {
      t[firstEmpty] = { widget, colSpan: 1, rowSpan: 1 };
      return t;
    });
    setRecentWidgets((prev) => prev.filter((w) => w !== widget));
  };

  const handleGridResize = (newCols: number, newRows: number) => {
    const { next, dropped: droppedWidgets } = repackTiles(tiles, newCols, newRows);

    if (droppedWidgets.length > 0) {
      const ok = window.confirm(
        `Resizing to ${newCols}×${newRows} doesn't leave room for ${droppedWidgets.length} widget${droppedWidgets.length === 1 ? "" : "s"}, which will be discarded. Continue?`,
      );
      if (!ok) return;
      // Past the early-return guard: the resize is committing, so leave each
      // discarded widget in the "recently removed" list (mirrors handleClear)
      // for one-click restore. Skipped on Cancel so no state mutates there.
      droppedWidgets.forEach(pushRecent);
    }

    setCols(newCols);
    setRows(newRows);
    setTiles(next);
  };

  return (
    <div
      // `light-mode` itself is applied to <html> by ThemeProvider so
      // portaled dropdowns (document.body) pick up the theme too.
      className="h-screen w-screen flex flex-col overflow-hidden transition-colors duration-300"
      style={{
        background: isDark
          ? "linear-gradient(135deg, #170e21 0%, #1e1329 50%, #140b1c 100%)"
          : "var(--dm-bg-page)",
      }}
    >
      <DragonHeader />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((p) => !p)}
          cols={cols}
          rows={rows}
          onGridResize={handleGridResize}
          recentWidgets={recentWidgets}
          onRestoreRecent={handleRestoreRecent}
          onClearRecent={() => setRecentWidgets([])}
        />

        <main className="flex-1 p-3 overflow-hidden">
          <div
            ref={gridRef}
            className="h-full"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              gap: "10px",
              position: "relative",
            }}
          >
            {gridTiles.map((entry, i) => {
              if (entry === null) return null;
              const tileRow = Math.floor(i / cols) + 1;
              const tileCol = (i % cols) + 1;
              const colSpan = (entry as { colSpan: number }).colSpan ?? 1;
              const rowSpan = (entry as { rowSpan: number }).rowSpan ?? 1;
              // A drop is only offered visually (preventDefault) when the
              // hovered cell is actually a valid 1×1 target — otherwise the
              // browser's native "not-allowed" drop cursor does the talking.
              const isValidDropTarget =
                colSpan === 1 && rowSpan === 1 && dragSrc !== null && canDragTile(gridTiles[dragSrc]);

              return (
                <div
                  key={i}
                  // minHeight/minWidth: 0 turn off the CSS Grid item default
                  // (`auto` = `min-content`) which would otherwise let a tall
                  // widget grow the row past its `1fr` track size. overflow:
                  // hidden clips anything the widget can't fit, so content
                  // overflow visually respects the grid cell boundary.
                  style={{
                    gridColumn: `${tileCol} / span ${colSpan}`,
                    gridRow: `${tileRow} / span ${rowSpan}`,
                    minHeight: 0,
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                  className={dragOverIdx === i && isValidDropTarget ? "dm-drop-target" : undefined}
                  onDragOver={(e) => {
                    if (!isValidDropTarget || dragSrc === i) return;
                    e.preventDefault();
                    if (dragOverIdx !== i) setDragOverIdx(i);
                  }}
                  onDragLeave={() => setDragOverIdx((prev) => (prev === i ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleTileDrop(i);
                  }}
                >
                  <DMTile
                    entry={entry}
                    onAdd={() => setSelectingTile(i)}
                    onClear={() => handleClear(i)}
                    canDrag={canDragTile(entry)}
                    isDragging={dragSrc === i}
                    onDragStart={() => setDragSrc(i)}
                    onDragEnd={() => { setDragSrc(null); setDragOverIdx(null); }}
                    onResizeStart={(e) => startResize(e, i)}
                    bestiaryTarget={entry.widget === "bestiary" ? bestiaryTarget : null}
                    onBestiaryTargetClear={() => setBestiaryTarget(null)}
                  />
                </div>
              );
            })}

            {resizePreview && (
              <div
                aria-hidden
                className="pointer-events-none rounded-lg border-2 border-dashed"
                style={{
                  gridColumn: `${(resizePreview.index % cols) + 1} / span ${resizePreview.colSpan}`,
                  gridRow: `${Math.floor(resizePreview.index / cols) + 1} / span ${resizePreview.rowSpan}`,
                  borderColor: resizePreview.valid ? "#e0bd6e" : "#e0716f",
                  background: resizePreview.valid ? "rgba(212,175,106,0.10)" : "rgba(224,113,111,0.10)",
                  zIndex: 5,
                }}
              />
            )}
          </div>
        </main>
      </div>

      {selectingTile !== null && (
        <WidgetSelectorModal
          onSelect={handleSelectWidget}
          onClose={() => setSelectingTile(null)}
          placedWidgets={placedWidgets}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
