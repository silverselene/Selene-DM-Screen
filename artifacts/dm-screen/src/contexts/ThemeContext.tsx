import { createContext, useContext, useState } from "react";

interface ThemeCtx {
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ isDark: true, toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("dm-theme");
      return stored === null ? true : stored !== "light";
    } catch { return true; }
  });

  const toggle = () => {
    setIsDark((v) => {
      const next = !v;
      try { localStorage.setItem("dm-theme", next ? "dark" : "light"); } catch {}
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
