import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

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
      {/* Celtic top border */}
      <div className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: "6px" }}>
        <svg viewBox="0 0 1200 6" className="w-full h-full" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="celtic-top" x="0" y="0" width="48" height="6" patternUnits="userSpaceOnUse">
              <path d="M0,3 L6,0 L12,3 L18,6 L24,3 L30,0 L36,3 L42,6 L48,3" stroke="#8A2BE2" strokeWidth="1.5" fill="none" opacity="0.8"/>
              <path d="M0,3 L6,6 L12,3 L18,0 L24,3 L30,6 L36,3 L42,0 L48,3" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" fill="none" opacity="0.6"/>
              <circle cx="0" cy="3" r="1.5" fill="#8A2BE2" opacity="0.7"/><circle cx="12" cy="3" r="1.5" fill="#8A2BE2" opacity="0.7"/>
              <circle cx="24" cy="3" r="1.5" fill="#8A2BE2" opacity="0.7"/><circle cx="36" cy="3" r="1.5" fill="#8A2BE2" opacity="0.7"/>
              <circle cx="48" cy="3" r="1.5" fill="#8A2BE2" opacity="0.7"/>
              <circle cx="6" cy="0" r="1" fill="rgba(255,255,255,0.6)" opacity="0.6"/>
              <circle cx="18" cy="6" r="1" fill="rgba(255,255,255,0.6)" opacity="0.6"/>
              <circle cx="30" cy="0" r="1" fill="rgba(255,255,255,0.6)" opacity="0.6"/>
              <circle cx="42" cy="6" r="1" fill="rgba(255,255,255,0.6)" opacity="0.6"/>
            </pattern>
          </defs>
          <rect width="1200" height="6" fill="url(#celtic-top)"/>
          <line x1="0" y1="0" x2="1200" y2="0" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5"/>
          <line x1="0" y1="5.5" x2="1200" y2="5.5" stroke="#8A2BE2" strokeWidth="0.5" opacity="0.6"/>
        </svg>
      </div>

      {/* Celtic bottom border */}
      <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ height: "6px" }}>
        <svg viewBox="0 0 1200 6" className="w-full h-full" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="celtic-bottom" x="0" y="0" width="48" height="6" patternUnits="userSpaceOnUse">
              <path d="M0,3 L6,6 L12,3 L18,0 L24,3 L30,6 L36,3 L42,0 L48,3" stroke="#8A2BE2" strokeWidth="1.5" fill="none" opacity="0.8"/>
              <path d="M0,3 L6,0 L12,3 L18,6 L24,3 L30,0 L36,3 L42,6 L48,3" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" fill="none" opacity="0.6"/>
              <circle cx="0" cy="3" r="1.5" fill="#8A2BE2" opacity="0.7"/><circle cx="12" cy="3" r="1.5" fill="#8A2BE2" opacity="0.7"/>
              <circle cx="24" cy="3" r="1.5" fill="#8A2BE2" opacity="0.7"/><circle cx="36" cy="3" r="1.5" fill="#8A2BE2" opacity="0.7"/>
              <circle cx="48" cy="3" r="1.5" fill="#8A2BE2" opacity="0.7"/>
              <circle cx="6" cy="6" r="1" fill="rgba(255,255,255,0.6)" opacity="0.6"/>
              <circle cx="18" cy="0" r="1" fill="rgba(255,255,255,0.6)" opacity="0.6"/>
              <circle cx="30" cy="6" r="1" fill="rgba(255,255,255,0.6)" opacity="0.6"/>
              <circle cx="42" cy="0" r="1" fill="rgba(255,255,255,0.6)" opacity="0.6"/>
            </pattern>
          </defs>
          <rect width="1200" height="6" fill="url(#celtic-bottom)"/>
          <line x1="0" y1="0" x2="1200" y2="0" stroke="#8A2BE2" strokeWidth="0.5" opacity="0.6"/>
          <line x1="0" y1="5.5" x2="1200" y2="5.5" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5"/>
        </svg>
      </div>

      {/* Ambient glow behind the title */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? "radial-gradient(ellipse 420px 60px at 50% 50%, rgba(168,85,247,0.20), transparent 70%)"
            : "radial-gradient(ellipse 420px 60px at 50% 50%, rgba(168,85,247,0.16), transparent 70%)",
        }}
      />

      {/* Dragon silhouette */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: dragonOpacity }}>
        <svg viewBox="0 0 1200 60" className="w-full h-full" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,30 Q60,10 120,30 Q150,40 180,28 Q240,10 300,30 Q360,50 420,28 Q480,10 540,30 Q580,42 600,30 Q620,18 660,30 Q720,50 780,28 Q840,10 900,30 Q960,50 1020,28 Q1080,10 1140,30 Q1160,36 1200,30" stroke={dragonColor} strokeWidth="3" fill="none" opacity="0.8"/>
          <path d="M200,30 Q180,5 150,2 Q130,1 140,18 Q155,28 200,30Z" fill={dragonWingColor} opacity="0.7"/>
          <path d="M200,30 Q190,45 160,52 Q140,56 148,40 Q162,32 200,30Z" fill={dragonWingColor} opacity="0.5"/>
          <path d="M1000,30 Q1020,5 1050,2 Q1070,1 1060,18 Q1045,28 1000,30Z" fill={dragonWingColor} opacity="0.7"/>
          <path d="M1000,30 Q1010,45 1040,52 Q1060,56 1052,40 Q1038,32 1000,30Z" fill={dragonWingColor} opacity="0.5"/>
          <path d="M30,30 Q15,20 5,14 Q10,10 20,16 Q35,22 45,30 Q35,35 25,42 Q12,46 5,42 Q15,38 30,30Z" fill={dragonColor} opacity="0.9"/>
          <circle cx="12" cy="20" r="2" fill={isDark ? "#ffffff" : "#facc15"} opacity="0.9"/>
          <path d="M1170,28 Q1185,20 1198,16 Q1197,22 1188,26 Q1183,28 1180,32 Q1190,35 1198,40 Q1185,42 1172,36 Q1168,32 1170,28Z" fill={dragonColor} opacity="0.9"/>
          <circle cx="1188" cy="20" r="2" fill={isDark ? "#ffffff" : "#facc15"} opacity="0.9"/>
        </svg>
      </div>

      {/* Title */}
      <div className="relative z-10 text-center">
        <h1
          className="text-2xl font-black tracking-[0.25em] uppercase"
          style={{
            fontFamily: "'Cinzel', 'Georgia', serif",
            // background-clip is baked into the shorthand (rather than set via
            // the separate WebkitBackgroundClip longhand) because React skips
            // rewriting a style longhand whose value is unchanged since the
            // last render — toggling theme only changes `background`, and
            // reassigning that shorthand alone resets background-clip back to
            // its initial border-box, leaving the title invisible.
            background: `${titleGradient} text`,
            WebkitBackgroundClip: "text",
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
