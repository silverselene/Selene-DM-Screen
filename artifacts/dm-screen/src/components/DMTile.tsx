import { lazy, Suspense } from "react";
import {
  Plus, X, BookOpen, Swords, FileText, Wand2, Skull, BookMarked, Users, Sparkles,
  MonitorPlay, GripVertical, MoveDiagonal2,
} from "lucide-react";
import type { TileEntry, WidgetType } from "@/types";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useTheme } from "@/contexts/ThemeContext";

// Lazy-load each widget so its code (and the big reference datasets it pulls
// in) downloads on first mount, not at app boot. The widgets are named exports,
// hence the `.then(...)` default-mapping. Migrations already run pre-render in
// main.tsx (`runMigrationsOnce`), so deferring widget evaluation is safe.
const CompendiumWidget = lazy(() =>
  import("./widgets/CompendiumWidget").then((m) => ({ default: m.CompendiumWidget })));
const InitiativeWidget = lazy(() =>
  import("./widgets/InitiativeWidget").then((m) => ({ default: m.InitiativeWidget })));
const NotepadWidget = lazy(() =>
  import("./widgets/NotepadWidget").then((m) => ({ default: m.NotepadWidget })));
const OracleWidget = lazy(() =>
  import("./widgets/OracleWidget").then((m) => ({ default: m.OracleWidget })));
const BestiaryWidget = lazy(() =>
  import("./widgets/BestiaryWidget").then((m) => ({ default: m.BestiaryWidget })));
const WizardsTomeWidget = lazy(() =>
  import("./widgets/WizardsTomeWidget").then((m) => ({ default: m.WizardsTomeWidget })));
const PartyWidget = lazy(() =>
  import("./widgets/PartyWidget").then((m) => ({ default: m.PartyWidget })));
const PortalWidget = lazy(() =>
  import("./widgets/PortalWidget").then((m) => ({ default: m.PortalWidget })));
const AIChatWidget = lazy(() =>
  import("./widgets/AIChatWidget").then((m) => ({ default: m.AIChatWidget })));

function WidgetLoading() {
  return (
    <div className="h-full flex items-center justify-center text-gray-600 text-xs">
      <span className="animate-pulse">Loading…</span>
    </div>
  );
}

interface Props {
  entry: TileEntry;
  onAdd: () => void;
  onClear: () => void;
  // Drag-to-reorder: only offered on 1×1 widget tiles (see `canDragTile` in
  // App.tsx) — a spanned tile can't be swapped via a single index exchange.
  canDrag: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  // Drag-to-resize: a single corner handle replaces the old four
  // expand/contract buttons. App.tsx owns the pointer-move geometry (it has
  // the grid's bounding rect and occupancy); this just forwards the gesture.
  onResizeStart: (e: React.PointerEvent) => void;
  bestiaryTarget?: string | null;
  onBestiaryTargetClear?: () => void;
}

const widgetMeta: Record<Exclude<WidgetType, "empty">, { label: string; icon: React.ReactNode; accent: string }> = {
  compendium: {
    label: "5.5e Compendium",
    icon: <BookOpen className="w-3 h-3" />,
    accent: "border-blue-700/60 shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]",
  },
  initiative: {
    label: "Initiative",
    icon: <Swords className="w-3 h-3" />,
    accent: "border-red-700/60 shadow-[inset_0_0_20px_rgba(239,68,68,0.05)]",
  },
  notepad: {
    label: "Notepad",
    icon: <FileText className="w-3 h-3" />,
    accent: "border-green-700/60 shadow-[inset_0_0_20px_rgba(34,197,94,0.05)]",
  },
  oracle: {
    label: "The Oracle",
    icon: <Wand2 className="w-3 h-3" />,
    accent: "border-purple-700/60 shadow-[inset_0_0_20px_rgba(139,43,226,0.08)]",
  },
  bestiary: {
    label: "Bestiary",
    icon: <Skull className="w-3 h-3" />,
    accent: "border-rose-800/60 shadow-[inset_0_0_20px_rgba(225,29,72,0.05)]",
  },
  "wizard-tome": {
    label: "Wizard's Tome",
    icon: <BookMarked className="w-3 h-3" />,
    accent: "border-cyan-800/60 shadow-[inset_0_0_20px_rgba(6,182,212,0.05)]",
  },
  party: {
    label: "Party",
    icon: <Users className="w-3 h-3" />,
    accent: "border-emerald-800/60 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]",
  },
  portal: {
    label: "Portal",
    icon: <MonitorPlay className="w-3 h-3" />,
    accent: "border-fuchsia-800/60 shadow-[inset_0_0_20px_rgba(217,70,239,0.05)]",
  },
  "ai-chat": {
    label: "AI Chat",
    icon: <Sparkles className="w-3 h-3" />,
    accent: "border-amber-700/60 shadow-[inset_0_0_20px_rgba(245,158,11,0.06)]",
  },
};

function WidgetContent({
  widget,
  bestiaryTarget,
  onBestiaryTargetClear,
}: {
  widget: WidgetType;
  bestiaryTarget?: string | null;
  onBestiaryTargetClear?: () => void;
}) {
  // ErrorBoundary catches a rejected lazy import (Suspense only covers the
  // pending case) so a failed chunk fetch degrades to a per-tile error instead
  // of blanking the whole dashboard. Keyed by `widget` so switching the tile's
  // type resets a previously-errored boundary.
  return (
    <ErrorBoundary key={widget} label="This widget">
      <Suspense fallback={<WidgetLoading />}>
        {widget === "compendium" && <CompendiumWidget />}
        {widget === "initiative" && <InitiativeWidget />}
        {widget === "notepad" && <NotepadWidget />}
        {widget === "oracle" && <OracleWidget />}
        {widget === "bestiary" && (
          <BestiaryWidget target={bestiaryTarget} onTargetClear={onBestiaryTargetClear} />
        )}
        {widget === "wizard-tome" && <WizardsTomeWidget />}
        {widget === "party" && <PartyWidget />}
        {widget === "portal" && <PortalWidget />}
        {widget === "ai-chat" && <AIChatWidget />}
      </Suspense>
    </ErrorBoundary>
  );
}

// Bottom-right drag-to-resize handle. Shared between the empty and widget
// tile branches so growing/shrinking works identically whether or not a
// widget has been placed yet.
function ResizeHandle({ onResizeStart }: { onResizeStart: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onResizeStart}
      // Explicit override: this handle can sit inside a `draggable` tile
      // (see the widget-tile branch below) and would otherwise inherit
      // draggability, racing the browser's native HTML5 drag against the
      // pointer-based resize gesture below.
      draggable={false}
      title="Drag to resize"
      className="pointer-events-auto absolute right-0.5 bottom-0.5 w-5 h-5 flex items-center justify-center text-gray-600 opacity-0 group-hover:opacity-100 hover:!text-[#c9a24d] transition-all cursor-nwse-resize touch-none"
    >
      <MoveDiagonal2 className="w-3.5 h-3.5" />
    </div>
  );
}

export function DMTile({
  entry, onAdd, onClear,
  canDrag, isDragging, onDragStart, onDragEnd, onResizeStart,
  bestiaryTarget, onBestiaryTargetClear,
}: Props) {
  const { isDark } = useTheme();
  if (!entry) return null;

  const { widget } = entry;

  /* ── Empty tile ── */
  if (widget === "empty") {
    return (
      <div
        className="group relative h-full rounded-lg border-2 border-dashed border-purple-900/40 hover:border-purple-700/60 transition-all flex items-center justify-center hover:bg-purple-950/10"
        style={{ background: "var(--dm-bg-tile)" }}
      >
        {/* Center add button */}
        <button
          onClick={onAdd}
          className="flex items-center justify-center text-purple-700 hover:text-purple-400 transition-colors"
        >
          <div className="w-[65px] h-[65px] rounded-full border border-current flex items-center justify-center group-hover:shadow-[0_0_10px_rgba(139,43,226,0.3)] transition-all">
            <Plus className="w-8 h-8" />
          </div>
        </button>

        <ResizeHandle onResizeStart={onResizeStart} />
      </div>
    );
  }

  /* ── Widget tile ── */
  const meta = widgetMeta[widget];

  return (
    <div
      className={`group relative h-full rounded-lg border transition-all flex flex-col overflow-hidden ${
        isDark
          ? "dm-tile-border"
          : `${meta.accent} hover:shadow-[0_0_16px_rgba(139,43,226,0.12)]`
      } ${isDragging ? "opacity-40" : ""}`}
      style={{ background: "var(--dm-bg-tile)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b shrink-0" style={{ borderBottomColor: "var(--dm-border)" }}>
        {canDrag && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              onDragStart();
            }}
            onDragEnd={onDragEnd}
            className="shrink-0 -ml-1 flex items-center justify-center text-gray-600 hover:text-[#c9a24d] cursor-grab active:cursor-grabbing transition-colors"
            title="Drag to move"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        <div className="flex items-center gap-1.5 text-sm font-extrabold flex-1 min-w-0" style={{ color: "var(--dm-t1)" }}>
          <span className="text-white/60 shrink-0">{meta.icon}</span>
          <span className="truncate">{meta.label}</span>
        </div>

        <button
          onClick={onClear}
          className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-700 hover:text-red-400 transition-colors rounded hover:bg-red-900/20"
          title="Remove widget"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden p-2.5">
        <WidgetContent widget={widget} bestiaryTarget={bestiaryTarget} onBestiaryTargetClear={onBestiaryTargetClear} />
      </div>

      <ResizeHandle onResizeStart={onResizeStart} />
    </div>
  );
}
