export function DragonHeader() {
  return (
    <header className="relative h-16 flex items-center justify-center overflow-hidden shrink-0"
      style={{ background: "linear-gradient(180deg, #0d0014 0%, #120020 100%)" }}
    >
      {/* Ornate border lines */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-80" />
      <div className="absolute inset-x-0 top-[3px] h-[1px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-60" />
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-80" />
      <div className="absolute inset-x-0 bottom-[3px] h-[1px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-60" />

      {/* Dragon SVG stretching across the header */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <svg viewBox="0 0 1200 60" className="w-full h-full" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
          {/* Long dragon silhouette body */}
          <path d="M0,30 Q60,10 120,30 Q150,40 180,28 Q240,10 300,30 Q360,50 420,28 Q480,10 540,30 Q580,42 600,30 Q620,18 660,30 Q720,50 780,28 Q840,10 900,30 Q960,50 1020,28 Q1080,10 1140,30 Q1160,36 1200,30" stroke="#8A2BE2" strokeWidth="3" fill="none" opacity="0.8"/>
          {/* Wings left */}
          <path d="M200,30 Q180,5 150,2 Q130,1 140,18 Q155,28 200,30Z" fill="#6B1EBA" opacity="0.7"/>
          <path d="M200,30 Q190,45 160,52 Q140,56 148,40 Q162,32 200,30Z" fill="#6B1EBA" opacity="0.5"/>
          {/* Wings right */}
          <path d="M1000,30 Q1020,5 1050,2 Q1070,1 1060,18 Q1045,28 1000,30Z" fill="#6B1EBA" opacity="0.7"/>
          <path d="M1000,30 Q1010,45 1040,52 Q1060,56 1052,40 Q1038,32 1000,30Z" fill="#6B1EBA" opacity="0.5"/>
          {/* Head left */}
          <path d="M30,30 Q15,20 5,14 Q10,10 20,16 Q35,22 45,30 Q35,35 25,42 Q12,46 5,42 Q15,38 30,30Z" fill="#8A2BE2" opacity="0.9"/>
          <circle cx="12" cy="20" r="2" fill="#FFD700" opacity="0.9"/>
          {/* Tail right */}
          <path d="M1170,28 Q1185,20 1198,16 Q1197,22 1188,26 Q1183,28 1180,32 Q1190,35 1198,40 Q1185,42 1172,36 Q1168,32 1170,28Z" fill="#8A2BE2" opacity="0.9"/>
          {/* Spines along body */}
          {[100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100].map((x, i) => (
            <path key={i} d={`M${x},30 L${x - 4},${i % 2 === 0 ? 18 : 22} L${x + 4},30`} fill="#A855F7" opacity="0.5"/>
          ))}
        </svg>
      </div>

      {/* Corner ornaments */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-60">
        <span className="text-amber-500 text-lg">⟦</span>
        <span className="text-purple-400 text-sm">✦</span>
        <span className="text-amber-500 text-lg">⟧</span>
      </div>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-60">
        <span className="text-amber-500 text-lg">⟦</span>
        <span className="text-purple-400 text-sm">✦</span>
        <span className="text-amber-500 text-lg">⟧</span>
      </div>

      {/* Title */}
      <div className="relative z-10 text-center">
        <h1
          className="text-2xl font-black tracking-[0.25em] uppercase"
          style={{
            fontFamily: "'Cinzel', 'Georgia', serif",
            background: "linear-gradient(135deg, #FFD700, #FFA500, #FFD700)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "none",
            filter: "drop-shadow(0 0 8px rgba(255, 215, 0, 0.4))",
          }}
        >
          LEGENDARY DM SCREEN
        </h1>
        <div className="text-xs tracking-[0.35em] text-purple-400 uppercase opacity-80 mt-0.5">
          D&amp;D 5.5e · 2024 Revision
        </div>
      </div>
    </header>
  );
}
