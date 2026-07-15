import { useEffect, useState } from "react";

/** True when the viewport is at least `min` px wide (for docking the plan). */
export function useWide(min = 1100): boolean {
  return useMediaQuery(`(min-width:${min}px)`);
}

/** True on phone-width viewports, where tables restack into cards (see styles.css). */
export function useIsNarrow(max = 560): boolean {
  return useMediaQuery(`(max-width:${max}px)`);
}

/** Subscribe to a media query, SSR-safe. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

export function usePersistedBool(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? def : raw === "1";
    } catch {
      return def;
    }
  });
  const set = (v: boolean) => {
    setVal(v);
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {
      /* ignore quota */
    }
  };
  return [val, set];
}

/** A number persisted to localStorage; falls back to `def` (e.g. the live average). */
export function usePersistedNumber(key: string, def: number): [number, (v: number) => void] {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? n : def;
    } catch {
      return def;
    }
  });
  const set = (v: number) => {
    setVal(v);
    try {
      localStorage.setItem(key, String(v));
    } catch {
      /* ignore quota */
    }
  };
  return [val, set];
}
