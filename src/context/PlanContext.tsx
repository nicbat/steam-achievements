import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SteamData } from "../types";
import { itemKey, loadPlan, savePlan, type PlanItem } from "../lib/plan";

interface PlanCtx {
  items: PlanItem[];
  has: (i: PlanItem) => boolean;
  toggle: (i: PlanItem) => void;
  remove: (key: string) => void;
  clear: () => void;
  /** Merge items in, de-duped by key (used by import and "check all"). */
  merge: (incoming: PlanItem[]) => void;
  /** Remove every item whose key is in the given list. */
  removeMany: (keys: string[]) => void;
}

const Ctx = createContext<PlanCtx | null>(null);

export function PlanProvider({ data, children }: { data: SteamData; children: ReactNode }) {
  const [items, setItems] = useState<PlanItem[]>(() => loadPlan(data.steamid64));

  useEffect(() => {
    savePlan(data.steamid64, items);
  }, [data.steamid64, items]);

  const keys = useMemo(() => new Set(items.map(itemKey)), [items]);

  const value = useMemo<PlanCtx>(
    () => ({
      items,
      has: (i) => keys.has(itemKey(i)),
      toggle: (i) =>
        setItems((prev) => {
          const k = itemKey(i);
          return prev.some((p) => itemKey(p) === k) ? prev.filter((p) => itemKey(p) !== k) : [...prev, i];
        }),
      remove: (k) => setItems((prev) => prev.filter((p) => itemKey(p) !== k)),
      removeMany: (ks) => {
        const drop = new Set(ks);
        setItems((prev) => prev.filter((p) => !drop.has(itemKey(p))));
      },
      clear: () => setItems([]),
      merge: (incoming) =>
        setItems((prev) => {
          const seen = new Set(prev.map(itemKey));
          const add = incoming.filter((i) => !seen.has(itemKey(i)));
          return add.length ? [...prev, ...add] : prev;
        }),
    }),
    [items, keys],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlan(): PlanCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlan must be used within a PlanProvider");
  return c;
}
