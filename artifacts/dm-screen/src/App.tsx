import { useState } from "react";
import { DragonHeader } from "@/components/DragonHeader";
import { DMTile } from "@/components/DMTile";
import { WidgetSelectorModal } from "@/components/WidgetSelectorModal";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { TileEntry, WidgetType } from "@/types";

const empty = (): TileEntry => ({ widget: "empty", colSpan: 1, rowSpan: 1 });
const DEFAULT_TILES: TileEntry[] = Array.from({ length: 9 }, empty);

function App() {
  const [tiles, setTiles] = useLocalStorage<TileEntry[]>("dm-tiles-v2", DEFAULT_TILES);
  const [selectingTile, setSelectingTile] = useState<number | null>(null);

  const update = (fn: (draft: TileEntry[]) => TileEntry[]) =>
    setTiles((prev) => fn([...prev]));

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
      if (entry.rowSpan === 2) t[i + 4] = null;
      return t;
    });
  };

  const handleExpandDown = (i: number) => {
    update((t) => {
      const entry = t[i];
      if (!entry || entry.rowSpan === 2) return t;
      t[i] = { ...entry, rowSpan: 2 };
      t[i + 3] = null;
      if (entry.colSpan === 2) t[i + 4] = null;
      return t;
    });
  };

  const handleContractRight = (i: number) => {
    update((t) => {
      const entry = t[i];
      if (!entry || entry.colSpan === 1) return t;
      t[i] = { ...entry, colSpan: 1 };
      t[i + 1] = empty();
      if (entry.rowSpan === 2) t[i + 4] = empty();
      return t;
    });
  };

  const handleContractDown = (i: number) => {
    update((t) => {
      const entry = t[i];
      if (!entry || entry.rowSpan === 1) return t;
      t[i] = { ...entry, rowSpan: 1 };
      t[i + 3] = empty();
      if (entry.colSpan === 2) t[i + 4] = empty();
      return t;
    });
  };

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(135deg, #090010 0%, #0d0018 50%, #080012 100%)" }}
    >
      <DragonHeader />

      <main className="flex-1 p-3 overflow-hidden">
        <div
          className="h-full"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gridTemplateRows: "repeat(3, 1fr)",
            gap: "12px",
          }}
        >
          {tiles.map((entry, i) => {
            if (entry === null) return null;
            const row = Math.floor(i / 3) + 1;
            const col = (i % 3) + 1;
            const canExpandRight = entry.colSpan === 1 && col <= 2 && (tiles[i + 1] === null || tiles[i + 1]?.widget === "empty");
            const canExpandDown = entry.rowSpan === 1 && row <= 2 && (tiles[i + 3] === null || tiles[i + 3]?.widget === "empty");
            const canExpandBoth =
              entry.colSpan === 1 && entry.rowSpan === 1 && col <= 2 && row <= 2 &&
              (tiles[i + 1] === null || tiles[i + 1]?.widget === "empty") &&
              (tiles[i + 3] === null || tiles[i + 3]?.widget === "empty") &&
              (tiles[i + 4] === null || tiles[i + 4]?.widget === "empty");

            return (
              <div
                key={i}
                style={{
                  gridColumn: `${col} / span ${entry.colSpan}`,
                  gridRow: `${row} / span ${entry.rowSpan}`,
                }}
              >
                <DMTile
                  index={i}
                  entry={entry}
                  onAdd={() => setSelectingTile(i)}
                  onClear={() => handleClear(i)}
                  canExpandRight={canExpandRight}
                  canExpandDown={canExpandDown}
                  canExpandBoth={canExpandBoth}
                  onExpandRight={() => handleExpandRight(i)}
                  onExpandDown={() => handleExpandDown(i)}
                  onExpandBoth={() => { handleExpandRight(i); setTimeout(() => handleExpandDown(i), 0); }}
                  onContractRight={() => handleContractRight(i)}
                  onContractDown={() => handleContractDown(i)}
                />
              </div>
            );
          })}
        </div>
      </main>

      <footer className="shrink-0 h-6 flex items-center justify-center relative">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <span className="text-xs text-gray-700 tracking-widest">
          Silver's DM Screen · D&D 5.5e 2024 · All data local &amp; persistent
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

export default App;
