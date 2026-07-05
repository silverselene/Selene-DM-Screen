import { createContext, useContext, useLayoutEffect, useState } from "react";

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

  // The `light-mode` class lives on <html>, NOT on a div inside the React
  // tree: AnchoredDropdown (and anything else that portals into
  // document.body) escapes the app root, and every `.light-mode …`
  // override in index.css is a descendant selector — portaled dropdowns
  // would render dark-themed over the light page otherwise. The
  // `.light-mode { --vars }` block only sets custom properties, which
  // cascade from <html> to everything.
  //
  // useLayoutEffect, not useEffect: the theme is already known at first
  // render (the useState initializer above reads it synchronously), so a
  // passive effect would let the browser paint one dark frame before the
  // class lands — a visible flash on every load for light-mode users.
  // Layout effects run before paint, closing that gap.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("light-mode", !isDark);
  }, [isDark]);

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
