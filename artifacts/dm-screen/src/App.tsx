import { useState, useEffect } from "react";
import { DragonHeader } from "@/components/DragonHeader";
import { DMTile } from "@/components/DMTile";
import { WidgetSelectorModal } from "@/components/WidgetSelectorModal";
import { Sidebar } from "@/components/Sidebar";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import type { TileEntry, WidgetType } from "@/types";

const empty = (): TileEntry => ({ widget: "empty", colSpan: 1, rowSpan: 1 });

const getDefaultTiles = (cols: number, rows: number): TileEntry[] =>
  Array.from({ length: cols * rows }, empty);

function AppContent() {
  const { isDark } = useTheme();
  const [cols, setCols] = useLocalStorage<number>("dm-grid-cols", 3);
  const [rows, setRows] = useLocalStorage<number>("dm-grid-rows", 3);
  const [tiles, setTiles] = useLocalStorage<TileEntry[]>(
    "dm-tiles-v3",
    getDefaultTiles(3, 3)
  );
  const [recentWidgets, setRecentWidgets] = useLocalStorage<WidgetType[]>(
    "dm-recent-widgets",
    []
  );
  const [selectingTile, setSelectingTile] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bestiaryTarget, setBestiaryTarget] = useState<string | null>(null);

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

  const handleExpandRight = (i: number) => {
    update((t) => {
      const entry = t[i];
      if (!entry || entry.colSpan === 2) return t;
      t[i] = { ...entry, colSpan: 2 };
      t[i + 1] = null;
      if (entry.rowSpan === 2 && i + cols + 1 < t.length) t[i + cols + 1] = null;
      return t;
    });
  };

  const handleExpandDown = (i: number) => {
    update((t) => {
      const entry = t[i];
      if (!entry || entry.rowSpan === 2) return t;
      t[i] = { ...entry, rowSpan: 2 };
      t[i + cols] = null;
      if (entry.colSpan === 2 && i + cols + 1 < t.length) t[i + cols + 1] = null;
      return t;
    });
  };

  const handleContractRight = (i: number) => {
    update((t) => {
      const entry = t[i];
      if (!entry || entry.colSpan === 1) return t;
      t[i] = { ...entry, colSpan: 1 };
      if (i + 1 < t.length) t[i + 1] = empty();
      if (entry.rowSpan === 2 && i + cols + 1 < t.length) t[i + cols + 1] = empty();
      return t;
    });
  };

  const handleContractDown = (i: number) => {
    update((t) => {
      const entry = t[i];
      if (!entry || entry.rowSpan === 1) return t;
      t[i] = { ...entry, rowSpan: 1 };
      if (i + cols < t.length) t[i + cols] = empty();
      if (entry.colSpan === 2 && i + cols + 1 < t.length) t[i + cols + 1] = empty();
      return t;
    });
  };

  const handleRestoreRecent = (widget: WidgetType) => {
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
    const newCount = newCols * newRows;
    const existing: WidgetType[] = tiles
      .filter((t): t is NonNullable<TileEntry> => t !== null)
      .map((t) => (t as { widget: WidgetType; colSpan: number; rowSpan: number }).widget);
    const next: TileEntry[] = Array.from({ length: newCount }, (_, i) => ({
      widget: existing[i] ?? "empty",
      colSpan: 1 as const,
      rowSpan: 1 as const,
    }));
    setCols(newCols);
    setRows(newRows);
    setTiles(next);
  };

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden transition-colors duration-300${!isDark ? " light-mode" : ""}`}
      style={{
        background: isDark
          ? "linear-gradient(135deg, #090010 0%, #0d0018 50%, #080012 100%)"
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
            className="h-full"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              gap: "10px",
            }}
          >
            {tiles.map((entry, i) => {
              if (entry === null) return null;
              const tileRow = Math.floor(i / cols) + 1;
              const tileCol = (i % cols) + 1;
              const colSpan = (entry as { colSpan: number }).colSpan ?? 1;
              const rowSpan = (entry as { rowSpan: number }).rowSpan ?? 1;

              const canExpandRight =
                colSpan === 1 &&
                tileCol < cols &&
                (tiles[i + 1] === null || tiles[i + 1]?.widget === "empty");
              const canExpandDown =
                rowSpan === 1 &&
                tileRow < rows &&
                i + cols < tiles.length &&
                (tiles[i + cols] === null || tiles[i + cols]?.widget === "empty");

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
                >
                  <DMTile
                    index={i}
                    entry={entry}
                    cols={cols}
                    onAdd={() => setSelectingTile(i)}
                    onClear={() => handleClear(i)}
                    canExpandRight={canExpandRight}
                    canExpandDown={canExpandDown}
                    onExpandRight={() => handleExpandRight(i)}
                    onExpandDown={() => handleExpandDown(i)}
                    onContractRight={() => handleContractRight(i)}
                    onContractDown={() => handleContractDown(i)}
                    bestiaryTarget={entry.widget === "bestiary" ? bestiaryTarget : null}
                    onBestiaryTargetClear={() => setBestiaryTarget(null)}
                  />
                </div>
              );
            })}
          </div>
        </main>
      </div>

      <footer className="shrink-0 h-5 flex items-center justify-center relative">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <span className="text-[10px] tracking-widest" style={{ color: "var(--dm-t3)" }}>
          Selene's DM Screen · D&amp;D 5.5e 2024 · All data local &amp; persistent
        </span>
      </footer>

      {selectingTile !== null && (
        <WidgetSelectorModal
          onSelect={handleSelectWidget}
          onClose={() => setSelectingTile(null)}
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
