import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import dragonGlyphUrl from "@/assets/dragon-glyph.png";

// Traced from the studio's reference art: a single-tone outline, head at the
// left edge of its own bounding box. `mirrored` flips it horizontally so two
// copies can face each other flanking the title — see the offsets below,
// which are kept equal so both sides sit the same distance from the title.
function DragonGlyph({ color, mirrored }: { color: string; mirrored: boolean }) {
  return (
    <div
      style={{
        width: 82,
        height: 94,
        backgroundColor: color,
        WebkitMaskImage: `url(${dragonGlyphUrl})`,
        maskImage: `url(${dragonGlyphUrl})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        transform: mirrored ? "scaleX(-1)" : undefined,
      }}
    />
  );
}

export function DragonHeader() {
  const { isDark, toggle } = useTheme();

  const headerBg = isDark
    ? "linear-gradient(180deg, #1c1126 0%, #241531 55%, #170e20 100%)"
    : "linear-gradient(180deg, #fffdfc 0%, #f6eeff 55%, #ecdfff 100%)";

  const titleGradient = isDark
    ? "linear-gradient(135deg, #f6dd9e, #c9a24d, #f6dd9e)"
    : "linear-gradient(135deg, #4c1d95, #7e22ce, #b45309)";

  const titleColor = "transparent";

  const dragonColor = isDark ? "#c9a24d" : "#6b21a8";
  const dragonOpacity = isDark ? 0.26 : 0.22;

  return (
    <header className="relative h-16 flex items-center justify-center overflow-hidden shrink-0"
      style={{ background: headerBg }}
    >
      {/* Ambient glow behind the title */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? "radial-gradient(ellipse 420px 60px at 50% 50%, rgba(201,162,77,0.16), transparent 70%)"
            : "radial-gradient(ellipse 420px 60px at 50% 50%, rgba(168,85,247,0.16), transparent 70%)",
        }}
      />

      {/* Dragons, facing inward from each edge, equidistant from the title */}
      <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ left: 96, opacity: dragonOpacity }}>
        <DragonGlyph color={dragonColor} mirrored />
      </div>
      <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ right: 96, opacity: dragonOpacity }}>
        <DragonGlyph color={dragonColor} mirrored={false} />
      </div>

      {/* Title */}
      <div className="relative z-10 text-center">
        <h1
          className="text-2xl font-black tracking-[0.25em] uppercase"
          style={{
            fontFamily: "'Cinzel', 'Georgia', serif",
            // The gradient goes on the `backgroundImage` longhand, never the
            // `background` shorthand: `text` is not a valid <box> in the
            // shorthand, so `background: <gradient> text` is dropped by
            // spec-compliant parsers (Firefox), leaving the transparent-filled
            // title invisible. Using `backgroundImage` also sidesteps the React
            // quirk that prompted the old workaround — reassigning the shorthand
            // resets background-clip to border-box, but reassigning
            // `backgroundImage` on a theme toggle leaves background-clip intact.
            backgroundImage: titleGradient,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: titleColor,
            filter: isDark
              ? "drop-shadow(0 0 10px rgba(201,162,77,0.35))"
              : "drop-shadow(0 1px 1px rgba(255,255,255,0.6))",
          }}
        >
          Selene's DM Screen
        </h1>
      </div>

      {/* ── Theme toggle ── */}
      <button
        onClick={toggle}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className={`absolute right-4 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full border backdrop-blur-sm transition-all duration-200 group ${
          isDark
            ? "border-[#c9a24d]/40 bg-black/30 hover:bg-[#c9a24d]/15"
            : "border-purple-800/60 bg-black/10 hover:bg-purple-900/20"
        }`}
      >
        {isDark ? (
          <>
            <Sun className="w-3.5 h-3.5 text-[#e0bd6e] group-hover:text-[#f6dd9e] transition-colors" />
            <span className="text-[10px] font-medium text-[#c9a24d] group-hover:text-[#f6dd9e] transition-colors hidden sm:block tracking-wide">LIGHT</span>
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 text-purple-900 group-hover:text-purple-700 transition-colors" />
            <span className="text-[10px] font-bold text-purple-900 group-hover:text-purple-700 transition-colors hidden sm:block tracking-wide">DARK</span>
          </>
        )}
      </button>
    </header>
  );
}
