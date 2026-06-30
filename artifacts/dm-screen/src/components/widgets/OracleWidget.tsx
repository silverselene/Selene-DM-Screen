import { Wand2, RefreshCw, User, Gem, Sword, MapPin } from "lucide-react";
import {
  generateName, generateLoot, generateItem, generatePlaceName,
  namesByRace, lootByCR, settlementTypes,
} from "@/data/generators";
import { useLocalStorage } from "@/hooks/useLocalStorage";

type OracleTab = "names" | "loot" | "items" | "places";

const EMPTY_HISTORY: Record<OracleTab, string[]> = {
  names: [], loot: [], items: [], places: [],
};

export function OracleWidget() {
  const [tab, setTab] = useLocalStorage<OracleTab>("dm-oracle-tab-v1", "names");
  const [selectedRace, setSelectedRace] = useLocalStorage<string>(
    "dm-oracle-race-v1",
    "Human",
  );
  const [selectedCR, setSelectedCR] = useLocalStorage<string>(
    "dm-oracle-cr-v1",
    "CR 0-4",
  );
  const [selectedSettlement, setSelectedSettlement] = useLocalStorage<string>(
    "dm-oracle-settlement-v1",
    "Town",
  );
  // History is kept per-tab (v2 shape) so peeking at Loot no longer wipes your
  // recent Names. The active tab's most recent roll is the displayed result, so
  // switching tabs restores each tab's last result instead of clearing it.
  const [history, setHistory] = useLocalStorage<Record<OracleTab, string[]>>(
    "dm-oracle-history-v2",
    EMPTY_HISTORY,
  );
  const tabHistory = history[tab] ?? [];
  const result = tabHistory[0] ?? "";

  const generate = () => {
    let res = "";
    if (tab === "names") res = generateName(selectedRace);
    else if (tab === "loot") res = generateLoot(selectedCR);
    else if (tab === "places") res = generatePlaceName(selectedSettlement);
    else res = generateItem();
    setHistory((h) => ({ ...h, [tab]: [res, ...(h[tab] ?? []).slice(0, 4)] }));
  };

  const tabs: { id: OracleTab; label: string; icon: React.ReactNode }[] = [
    { id: "names",  label: "Names",  icon: <User   className="w-3 h-3" /> },
    { id: "places", label: "Places", icon: <MapPin  className="w-3 h-3" /> },
    { id: "loot",   label: "Loot",   icon: <Gem    className="w-3 h-3" /> },
    { id: "items",  label: "Items",  icon: <Sword  className="w-3 h-3" /> },
  ];

  // Split the result on the em-dash so we can style name vs descriptor separately
  const [placeName, placeDesc] = tab === "places" && result
    ? result.split(" — ")
    : [result, ""];

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Tabs */}
      <div className="flex gap-1 mb-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-all ${
              tab === t.id
                ? "bg-purple-700 text-white shadow-[0_0_6px_rgba(139,43,226,0.4)]"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="mb-3">
        {tab === "names" && (
          <select
            value={selectedRace}
            onChange={(e) => setSelectedRace(e.target.value)}
            className="w-full text-xs bg-gray-900 border border-purple-800/50 rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-purple-500"
          >
            {Object.keys(namesByRace).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        )}
        {tab === "loot" && (
          <select
            value={selectedCR}
            onChange={(e) => setSelectedCR(e.target.value)}
            className="w-full text-xs bg-gray-900 border border-purple-800/50 rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-purple-500"
          >
            {Object.keys(lootByCR).map((cr) => (
              <option key={cr}>{cr}</option>
            ))}
          </select>
        )}
        {tab === "items" && (
          <div className="text-xs text-gray-500 italic px-1">
            Generates mundane items or common magic items at random.
          </div>
        )}
        {tab === "places" && (
          <select
            value={selectedSettlement}
            onChange={(e) => setSelectedSettlement(e.target.value)}
            className="w-full text-xs bg-gray-900 border border-purple-800/50 rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-purple-500"
          >
            {Object.entries(settlementTypes).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={generate}
        className="flex items-center justify-center gap-2 w-full py-2 bg-gradient-to-r from-purple-800 to-purple-600 hover:from-purple-700 hover:to-purple-500 rounded text-white text-xs font-bold transition-all shadow-[0_0_10px_rgba(139,43,226,0.3)] hover:shadow-[0_0_14px_rgba(139,43,226,0.5)]"
      >
        <Wand2 className="w-4 h-4" />
        Generate
        <RefreshCw className="w-3 h-3 opacity-60" />
      </button>

      {/* Result */}
      {result && (
        <div className="mt-3 p-3 bg-gray-900/80 border border-white/20 rounded">
          {tab === "places" && placeDesc ? (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-sm text-white font-bold tracking-wide">{placeName}</span>
              </div>
              <div className="text-xs text-gray-400 italic leading-relaxed">{placeDesc}</div>
            </>
          ) : (
            <div className="text-sm text-white font-semibold leading-relaxed">{result}</div>
          )}
        </div>
      )}

      {/* History */}
      {tabHistory.length > 1 && (
        <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
          <div className="text-xs text-gray-600 mb-1">Previous Results</div>
          <div className="space-y-1">
            {tabHistory.slice(1).map((h, i) => {
              const [pn, pd] = tab === "places" ? h.split(" — ") : [h, ""];
              return (
                <div key={i} className="text-xs text-gray-500 px-2 py-1 bg-gray-900/40 rounded border border-gray-800">
                  {tab === "places" && pd ? (
                    <><span className="text-gray-300 font-semibold">{pn}</span>
                    <span className="text-gray-600"> — {pd}</span></>
                  ) : h}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
