import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SteamData } from "../types";
import { flattenAchievements } from "../lib/derive";
import { computeImpactByApp } from "../lib/plan";
import { formatDate, pctRate, signed2, signed5 } from "../lib/format";
import { usePlan } from "../context/PlanContext";
import { AddButton } from "../components/AddButton";
import { AchIcon } from "../components/AchIcon";

type SortKey = "game" | "name" | "rarity" | "impact";
type Filter = "all" | "unlocked" | "locked" | "rare" | "recent";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unlocked", label: "Unlocked" },
  { key: "locked", label: "Locked" },
  { key: "rare", label: "Ultra-rare <5%" },
  { key: "recent", label: "Recent unlocks" },
];

export function Achievements({ data }: { data: SteamData }) {
  const plan = usePlan();
  const all = useMemo(() => flattenAchievements(data), [data]);
  const impactByApp = useMemo(() => computeImpactByApp(data.games, plan.items), [data.games, plan.items]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rarity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r = all;
    if (q) r = r.filter((a) => a.name.toLowerCase().includes(q) || a.game.toLowerCase().includes(q));
    if (filter === "unlocked") r = r.filter((a) => a.unlocked);
    else if (filter === "locked") r = r.filter((a) => !a.unlocked);
    else if (filter === "rare") r = r.filter((a) => a.globalRate != null && a.globalRate < 5);
    else if (filter === "recent") r = r.filter((a) => a.unlocked && a.unlockTime);

    const dir = sortDir === "asc" ? 1 : -1;
    return [...r].sort((a, b) => {
      switch (sortKey) {
        case "game":
          return dir * a.game.localeCompare(b.game);
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "rarity":
          return dir * ((a.globalRate ?? -1) - (b.globalRate ?? -1));
        case "impact": {
          const ia = a.unlocked ? -1 : impactByApp.get(a.appid) ?? -1;
          const ib = b.unlocked ? -1 : impactByApp.get(b.appid) ?? -1;
          return dir * (ia - ib);
        }
      }
    });
  }, [all, query, filter, sortKey, sortDir, impactByApp]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "game" ? "asc" : "desc");
    }
  }
  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });

  return (
    <section className="view">
      <div className="view__head">
        <h2 className="view__title">Achievements</h2>
        <span className="view__count">
          {rows.length.toLocaleString()} of {all.length.toLocaleString()}
        </span>
      </div>

      <div className="controls">
        <input
          className="search"
          type="search"
          placeholder="Search achievement or game…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip-btn${filter === f.key ? " chip-btn--on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="legend">
        <b>Impact</b> is how much your overall average would move if you unlocked one more achievement in that game.
        A negative value means it would dip your average for now.
      </p>

      <div className="grid-head grid-head--ach">
        <span className="colh" />
        <button className="colh" onClick={() => toggleSort("name")}>
          Achievement{arrow("name")}
        </button>
        <button className="colh" onClick={() => toggleSort("game")}>
          Game{arrow("game")}
        </button>
        <button className="colh colh--r" onClick={() => toggleSort("rarity")}>
          Global{arrow("rarity")}
        </button>
        <button className="colh colh--r" onClick={() => toggleSort("impact")}>
          Impact{arrow("impact")}
        </button>
        <span className="colh" />
      </div>

      <div ref={parentRef} className="vlist">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const a = rows[vi.index];
            const impact = impactByApp.get(a.appid);
            return (
              <div
                key={a.id}
                className="grid-row grid-row--ach"
                style={{ transform: `translateY(${vi.start}px)`, height: vi.size }}
              >
                <AchIcon src={a.icon} locked={!a.unlocked} />
                <div className="cell-ach">
                  <span className="cell-ach__name" title={a.description ?? undefined}>
                    {a.name}
                  </span>
                  {a.description && <span className="cell-ach__desc">{a.description}</span>}
                </div>
                <div className="cell-game">{a.game}</div>
                <RarityCell rate={a.globalRate} />
                <div className="cell-impact">
                  {a.unlocked ? (
                    <span className="status status--on">✓ {formatDate(a.unlockTime)}</span>
                  ) : (
                    <ImpactValue impact={impact} />
                  )}
                </div>
                <div className="cell-add">
                  {!a.unlocked && (
                    <AddButton
                      item={{ kind: "achievement", appid: a.appid, game: a.game, apiName: a.apiName, name: a.name }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ImpactValue({ impact }: { impact: number | undefined }) {
  if (impact == null) return <span className="imp imp--dim">—</span>;
  const title = `exact ${signed5(impact)}`;
  // Threshold matches the 2-dp display: anything that rounds to 0.00 reads as dim.
  if (impact >= 0.005) return <span className="imp imp--up" title={title}>{signed2(impact)}</span>;
  if (impact <= -0.005) return <span className="imp imp--down" title={title}>{signed2(impact)}</span>;
  return <span className="imp imp--dim" title={title}>0.00</span>;
}

function RarityCell({ rate }: { rate: number | null }) {
  if (rate == null) return <div className="cell-rarity cell-rarity--none">—</div>;
  const rare = rate < 5;
  return (
    <div className={`cell-rarity${rare ? " cell-rarity--rare" : ""}`}>
      <span className="cell-rarity__bar" style={{ width: `${Math.min(100, rate)}%` }} />
      <span className="cell-rarity__num">{pctRate(rate)}</span>
    </div>
  );
}
