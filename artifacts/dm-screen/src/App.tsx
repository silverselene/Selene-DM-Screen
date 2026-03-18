import { useState } from "react";
import { DragonHeader } from "@/components/DragonHeader";
import { DMTile } from "@/components/DMTile";
import { WidgetSelectorModal } from "@/components/WidgetSelectorModal";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { WidgetType } from "@/types";

const DEFAULT_TILES: WidgetType[] = Array(9).fill("empty") as WidgetType[];

function App() {
  const [tiles, setTiles] = useLocalStorage<WidgetType[]>("dm-tiles", DEFAULT_TILES);
  const [selectingTile, setSelectingTile] = useState<number | null>(null);

  const handleSelectWidget = (widget: WidgetType) => {
    if (selectingTile === null) return;
    setTiles((prev) => {
      const next = [...prev];
      next[selectingTile] = widget;
      return next;
    });
    setSelectingTile(null);
  };

  const handleClear = (index: number) => {
    setTiles((prev) => {
      const next = [...prev];
      next[index] = "empty";
      return next;
    });
  };

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(135deg, #090010 0%, #0d0018 50%, #080012 100%)" }}
    >
      <DragonHeader />

      <main className="flex-1 p-3 overflow-hidden">
        <div className="h-full grid grid-cols-3 grid-rows-3 gap-3">
          {tiles.map((widget, i) => (
            <DMTile
              key={i}
              widget={widget}
              onAdd={() => setSelectingTile(i)}
              onClear={() => handleClear(i)}
            />
          ))}
        </div>
      </main>

      <footer className="shrink-0 h-6 flex items-center justify-center relative">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <span className="text-xs text-gray-700 tracking-widest">
          ✦ &nbsp; LEGENDARY DM SCREEN · D&D 5.5e 2024 · All data is local &amp; persistent &nbsp; ✦
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
