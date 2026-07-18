import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

/** A single dragon silhouette, drawn head-right; pass `mirrored` to face left. */
function DragonGlyph({
  bodyColor,
  wingColor,
  eyeColor,
  mirrored,
}: {
  bodyColor: string;
  wingColor: string;
  eyeColor: string;
  mirrored: boolean;
}) {
  return (
    <svg
      viewBox="0 0 170 80"
      width="140"
      height="66"
      style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* tail */}
      <path
        d="M6,64 C18,66 30,60 30,50 C30,42 22,38 26,30"
        stroke={bodyColor} strokeWidth="4.5" fill="none" strokeLinecap="round" opacity="0.9"
      />
      {/* wing, attached at the shoulder, fanning up and back */}
      <path
        d="M52,24 C46,8 26,-2 8,4 C20,6 32,11 39,19 C31,17 22,18 15,22 C27,22 37,27 43,34 C47,29 50,26 52,24 Z"
        fill={wingColor} opacity="0.65"
      />
      {/* body / neck */}
      <path
        d="M26,30 C24,20 36,15 50,19 C62,23 68,17 80,14 C90,11 96,17 100,23"
        stroke={bodyColor} strokeWidth="5.5" fill="none" strokeLinecap="round" opacity="0.95"
      />
      {/* spine spikes */}
      <path d="M46,18 L50,8 L54,19 Z" fill={bodyColor} opacity="0.9" />
      <path d="M66,17 L70,7 L74,18 Z" fill={bodyColor} opacity="0.9" />
      <path d="M84,14 L88,5 L91,15 Z" fill={bodyColor} opacity="0.9" />
      {/* head, horn and jaw */}
      <path
        d="M98,24 C102,13 110,3 122,1 C127,0 129,4 124,7
           C130,6 140,7 149,12 C154,15 154,18 149,19
           C143,21 136,19 130,15
           C134,23 142,27 152,30 C140,34 128,30 121,22
           C114,28 104,27 97,22 Z"
        fill={bodyColor} opacity="0.95"
      />
      <circle cx="126" cy="11" r="2.2" fill={eyeColor} opacity="0.95" />
    </svg>
  );
}

export function DragonHeader() {
  const { isDark, toggle } = useTheme();

  const headerBg = isDark
    ? "linear-gradient(180deg, #0d0014 0%, #120020 100%)"
    : "linear-gradient(180deg, #fffdfc 0%, #f6eeff 55%, #ecdfff 100%)";

  const titleGradient = isDark
    ? "linear-gradient(135deg, #ffffff, #e0d0ff, #ffffff)"
    : "linear-gradient(135deg, #4c1d95, #7e22ce, #b45309)";

  const titleColor = "transparent";

  const dragonColor = isDark ? "#8A2BE2" : "#6b21a8";
  const dragonWingColor = isDark ? "#6B1EBA" : "#7e22ce";
  const dragonOpacity = isDark ? 0.15 : 0.22;

  return (
    <header className="relative h-16 flex items-center justify-center overflow-hidden shrink-0"
      style={{ background: headerBg }}
    >
      {/* Ambient glow behind the title */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? "radial-gradient(ellipse 420px 60px at 50% 50%, rgba(168,85,247,0.20), transparent 70%)"
            : "radial-gradient(ellipse 420px 60px at 50% 50%, rgba(168,85,247,0.16), transparent 70%)",
        }}
      />

      {/* Dragons, facing inward from each edge */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none" style={{ opacity: dragonOpacity }}>
        <DragonGlyph bodyColor={dragonColor} wingColor={dragonWingColor} eyeColor={isDark ? "#ffffff" : "#facc15"} mirrored={false} />
      </div>
      <div className="absolute right-24 top-1/2 -translate-y-1/2 pointer-events-none" style={{ opacity: dragonOpacity }}>
        <DragonGlyph bodyColor={dragonColor} wingColor={dragonWingColor} eyeColor={isDark ? "#ffffff" : "#facc15"} mirrored={true} />
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
              ? "drop-shadow(0 0 10px rgba(255,255,255,0.25))"
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
            ? "border-purple-600/50 bg-black/30 hover:bg-purple-900/50"
            : "border-purple-800/60 bg-black/10 hover:bg-purple-900/20"
        }`}
      >
        {isDark ? (
          <>
            <Sun className="w-3.5 h-3.5 text-yellow-300 group-hover:text-yellow-200 transition-colors" />
            <span className="text-[10px] font-medium text-purple-300 group-hover:text-white transition-colors hidden sm:block tracking-wide">LIGHT</span>
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
