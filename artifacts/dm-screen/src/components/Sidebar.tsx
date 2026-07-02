import { BookOpen, Swords, FileText, Wand2, Skull, BookMarked, Users, ChevronLeft, ChevronRight, RotateCcw, Grid, Clock, Trash2, Download, Upload, Database } from "lucide-react";
import type { WidgetType } from "@/types";
import { useTheme } from "@/contexts/ThemeContext";
import {
  downloadJsonFile,
  exportFullBackupAsJson,
  prepareImport,
  promptForJsonFile,
} from "@/lib/backup";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// Map internal `dm-*` storage keys to the widget names a DM recognizes, so a
// skipped-items warning during restore reads "Party, Notes" rather than
// "dm-party-v1, dm-notepad". Unknown keys fall back to a de-prefixed label.
const KEY_LABELS: Record<string, string> = {
  "dm-grid-cols": "Layout",
  "dm-grid-rows": "Layout",
  "dm-tiles-v3": "Layout",
  "dm-recent-widgets": "Recent widgets",
  "dm-theme": "Theme",
  "dm-notepad": "Notes",
  "dm-party-v1": "Party",
  "dm-initiative-v1": "Initiative",
  "dm-initiative-turn-v1": "Initiative",
  "dm-initiative-active-id-v1": "Initiative",
  "dm-round-v1": "Initiative",
  "dm-initiative-mode-v1": "Initiative",
  "dm-bestiary-query-v1": "Bestiary",
  "dm-bestiary-selected-v1": "Bestiary",
  "dm-bestiary-sort-v1": "Bestiary",
  "dm-bestiary-cr-v1": "Bestiary",
};

function friendlyKeyLabels(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const label = KEY_LABELS[k] ?? k.replace(/^dm-/, "").replace(/-v\d+$/, "");
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

async function runFullImport() {
  let text: string;
  try {
    text = await promptForJsonFile();
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return;
    window.alert(`Import failed: ${(e as Error).message}`);
    return;
  }
  try {
    // Two-phase: prepare (parse + validate + snapshot) now, commit after
    // the user confirms. Closes the TOCTOU window — the bytes the user
    // sees in the prompt match what the commit will wipe, even if other
    // tabs write between confirm-show and confirm-accept.
    const { summary, commit } = prepareImport(text);
    const itemWord = summary.accepted === 1 ? "item" : "items";
    let prompt =
      `Import ${summary.accepted} ${itemWord} (${formatBytes(summary.bytes)}) from this backup?\n\n` +
      `This will REPLACE all current widget state — party, notes, layout, in-progress combat ` +
      `(currently ${formatBytes(summary.currentBytes)}).`;
    if (summary.skipped.length > 0) {
      const labels = friendlyKeyLabels(summary.skipped);
      const sample = labels.slice(0, 4).join(", ");
      const more = labels.length > 4 ? ` (+${labels.length - 4} more)` : "";
      prompt +=
        `\n\n⚠ Some data couldn't be read (it's damaged or from an unsupported version) ` +
        `and will reset to default:\n${sample}${more}`;
    }
    if (!window.confirm(prompt)) return;
    const { skipped } = commit();
    if (skipped.length > 0) {
      console.warn("Backup import: skipped malformed keys:", skipped);
    }
    window.alert("Backup restored. Reloading…");
    window.location.reload();
  } catch (e) {
    window.alert(`Import failed: ${(e as Error).message}`);
  }
}

function runFullExport() {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJsonFile(`selene-dm-backup-${stamp}.json`, exportFullBackupAsJson());
}

const widgetMeta: Record<Exclude<WidgetType, "empty">, { label: string; icon: React.ReactNode; color: string }> = {
  compendium: { label: "Compendium", icon: <BookOpen className="w-3.5 h-3.5" />, color: "text-blue-400 bg-blue-900/20 border-blue-800/40" },
  initiative: { label: "Initiative", icon: <Swords className="w-3.5 h-3.5" />, color: "text-red-400 bg-red-900/20 border-red-800/40" },
  notepad: { label: "Notepad", icon: <FileText className="w-3.5 h-3.5" />, color: "text-green-400 bg-green-900/20 border-green-800/40" },
  oracle: { label: "The Oracle", icon: <Wand2 className="w-3.5 h-3.5" />, color: "text-purple-400 bg-purple-900/20 border-purple-800/40" },
  bestiary: { label: "Bestiary", icon: <Skull className="w-3.5 h-3.5" />, color: "text-rose-400 bg-rose-900/20 border-rose-800/40" },
  "wizard-tome": { label: "Wizard's Tome", icon: <BookMarked className="w-3.5 h-3.5" />, color: "text-cyan-400 bg-cyan-900/20 border-cyan-800/40" },
  party: { label: "Party", icon: <Users className="w-3.5 h-3.5" />, color: "text-emerald-400 bg-emerald-900/20 border-emerald-800/40" },
};

const GRID_SIZES = [2, 3, 4] as const;

interface Props {
  open: boolean;
  onToggle: () => void;
  cols: number;
  rows: number;
  onGridResize: (cols: number, rows: number) => void;
  recentWidgets: WidgetType[];
  onRestoreRecent: (widget: WidgetType) => void;
  onClearRecent: () => void;
}

export function Sidebar({
  open, onToggle,
  cols, rows, onGridResize,
  recentWidgets, onRestoreRecent, onClearRecent,
}: Props) {
  const { isDark } = useTheme();

  const sidebarBg = isDark
    ? "linear-gradient(180deg, #0b0018 0%, #080012 100%)"
    : "#ffffff";

  const toggleBg = isDark ? "#0f001e" : "#ffffff";
  const toggleBorder = isDark ? "rgba(126,34,206,0.6)" : "rgba(138,43,226,0.4)";

  return (
    <aside
      className="relative flex flex-col shrink-0 border-r transition-all duration-200"
      style={{
        width: open ? 200 : 36,
        background: sidebarBg,
        borderRightColor: isDark ? "rgba(88,28,135,0.3)" : "rgba(138,43,226,0.2)",
      }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-3 z-20 w-6 h-6 rounded-full border flex items-center justify-center text-purple-500 hover:text-purple-300 hover:border-purple-600 transition-all shadow-lg"
        style={{ background: toggleBg, borderColor: toggleBorder }}
      >
        {open ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {open ? (
        <div className="flex flex-col h-full overflow-hidden">
          {/* ── Grid Size ── */}
          <div className="p-3 border-b" style={{ borderBottomColor: isDark ? "rgba(88,28,135,0.2)" : "rgba(138,43,226,0.15)" }}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Grid className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--dm-t2)" }}>Grid Size</span>
            </div>

            <div className="space-y-2">
              <div>
                <p className="text-[10px] mb-1.5 uppercase tracking-widest" style={{ color: "var(--dm-t3)" }}>Columns</p>
                <div className="flex gap-1">
                  {GRID_SIZES.map((n) => (
                    <button
                      key={n}
                      onClick={() => onGridResize(n, rows)}
                      className={`flex-1 py-1 text-xs font-bold rounded border transition-all ${
                        cols === n
                          ? "bg-purple-700/50 border-purple-500 text-purple-200"
                          : "border-gray-800 hover:border-purple-700"
                      }`}
                      style={cols !== n ? { background: "var(--dm-bg-input)", color: "var(--dm-t3)" } : {}}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] mb-1.5 uppercase tracking-widest" style={{ color: "var(--dm-t3)" }}>Rows</p>
                <div className="flex gap-1">
                  {GRID_SIZES.map((n) => (
                    <button
                      key={n}
                      onClick={() => onGridResize(cols, n)}
                      className={`flex-1 py-1 text-xs font-bold rounded border transition-all ${
                        rows === n
                          ? "bg-purple-700/50 border-purple-500 text-purple-200"
                          : "border-gray-800 hover:border-purple-700"
                      }`}
                      style={rows !== n ? { background: "var(--dm-bg-input)", color: "var(--dm-t3)" } : {}}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid preview */}
              <div
                className="mt-2 mx-auto"
                style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: 2, width: 80, height: 80 }}
              >
                {Array.from({ length: cols * rows }).map((_, i) => (
                  <div key={i} className="rounded-sm bg-purple-900/30 border border-purple-800/20" />
                ))}
              </div>
              <p className="text-center text-[10px]" style={{ color: "var(--dm-t3)" }}>{cols} × {rows} = {cols * rows} tiles</p>
            </div>
          </div>

          {/* ── Recent Widgets ── */}
          <div className="flex-1 flex flex-col overflow-hidden p-3">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--dm-t2)" }}>Recent</span>
              </div>
              {recentWidgets.length > 0 && (
                <button
                  onClick={onClearRecent}
                  className="hover:text-red-400 transition-colors"
                  style={{ color: "var(--dm-t4)" }}
                  title="Clear history"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
              {recentWidgets.length === 0 && (
                <p className="text-[10px] text-center py-3 leading-relaxed" style={{ color: "var(--dm-t4)" }}>
                  Closed widgets appear here for quick restore
                </p>
              )}
              {recentWidgets.map((w) => {
                if (w === "empty") return null;
                const meta = widgetMeta[w];
                if (!meta) return null;
                return (
                  <button
                    key={w}
                    onClick={() => onRestoreRecent(w)}
                    title="Restore to first empty tile"
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-all hover:scale-[1.02] ${meta.color}`}
                  >
                    <span className="shrink-0">{meta.icon}</span>
                    <span className="text-xs font-medium truncate">{meta.label}</span>
                    <RotateCcw className="w-3 h-3 ml-auto shrink-0 opacity-60" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Backup / Restore ── */}
          <div className="shrink-0 border-t p-3" style={{ borderTopColor: "var(--dm-border)" }}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--dm-t2)" }}>Backup</span>
              </div>
            </div>
            <p className="text-[10px] leading-relaxed mb-2" style={{ color: "var(--dm-t4)" }}>
              State is stored per-browser. Export a snapshot to move it to another browser or back up.
            </p>
            <div className="flex gap-1">
              <button
                onClick={runFullExport}
                title="Download a full backup of all widget state"
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-[11px] text-purple-300 bg-purple-900/20 border-purple-800/40 hover:bg-purple-900/40 transition-colors"
              >
                <Download className="w-3 h-3" /> Export
              </button>
              <button
                onClick={runFullImport}
                title="Restore from a backup (replaces ALL current state, then reloads)"
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-[11px] text-purple-300 bg-purple-900/20 border-purple-800/40 hover:bg-purple-900/40 transition-colors"
              >
                <Upload className="w-3 h-3" /> Import
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 pt-10 pb-3">
          <span title="Grid size" className="flex">
            <Grid className="w-4 h-4 text-purple-700" />
          </span>
          <div className="w-3 h-px bg-purple-900/50" />
          <span title="Recent widgets" className="flex">
            <Clock className="w-4 h-4 text-purple-700" />
          </span>
          {recentWidgets.length > 0 && (
            <span className="text-[9px] bg-purple-700 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {recentWidgets.length}
            </span>
          )}
          <div className="w-3 h-px bg-purple-900/50" />
          <button
            onClick={runFullExport}
            title="Export a full backup of all widget state"
            className="text-purple-700 hover:text-purple-300 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={runFullImport}
            title="Import a backup (replaces all current state)"
            className="text-purple-700 hover:text-purple-300 transition-colors"
          >
            <Upload className="w-4 h-4" />
          </button>
        </div>
      )}
    </aside>
  );
}
