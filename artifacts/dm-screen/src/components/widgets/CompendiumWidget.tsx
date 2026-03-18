import { useState, useMemo } from "react";
import { Search, BookOpen } from "lucide-react";
import { compendiumData, categories } from "@/data/compendium";

export function CompendiumWidget() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return compendiumData.filter((e) => {
      const matchesQuery =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some((t) => t.includes(q));
      const matchesCat = selectedCategory === "All" || e.category === selectedCategory;
      return matchesQuery && matchesCat;
    });
  }, [query, selectedCategory]);

  const entry = selectedEntry ? compendiumData.find((e) => e.id === selectedEntry) : null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedEntry(null); }}
            placeholder="Search 5.5e rules..."
            className="w-full pl-7 pr-2 py-1 bg-gray-900 border border-purple-800/50 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => { setSelectedCategory(e.target.value); setSelectedEntry(null); }}
          className="text-xs bg-gray-900 border border-purple-800/50 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-purple-500"
        >
          <option>All</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {entry ? (
        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => setSelectedEntry(null)}
            className="text-xs text-purple-400 hover:text-purple-300 mb-2 flex items-center gap-1"
          >
            ← Back to results
          </button>
          <div className="bg-gray-900/80 border border-purple-700/40 rounded p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="text-sm font-bold text-amber-400">{entry.title}</h3>
              <span className="text-xs text-purple-400 bg-purple-900/40 px-2 py-0.5 rounded-full shrink-0">
                {entry.category}
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{entry.content}</p>
            <div className="flex flex-wrap gap-1 mt-3">
              {entry.tags.map((tag) => (
                <span key={tag} className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1">
          {filtered.length === 0 && (
            <div className="text-center py-4 text-gray-500 text-xs flex flex-col items-center gap-2">
              <BookOpen className="w-6 h-6 opacity-30" />
              No entries found
            </div>
          )}
          {filtered.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelectedEntry(e.id)}
              className="w-full text-left px-2 py-1.5 bg-gray-900/60 hover:bg-purple-900/30 border border-purple-900/30 hover:border-purple-600/50 rounded transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-200 group-hover:text-amber-300 transition-colors">
                  {e.title}
                </span>
                <span className="text-xs text-purple-500 shrink-0">{e.category}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
