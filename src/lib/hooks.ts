import { useEffect, useState } from "react";

/** True when the viewport is at least `min` px wide (for docking the plan). */
export function useWide(min = 1100): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(min-width:${min}px)`).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width:${min}px)`);
    const fn = () => setWide(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [min]);
  return wide;
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
