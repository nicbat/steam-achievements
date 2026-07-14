import { useMemo, useState } from "react";
import type { Game, SteamData } from "../types";
import { flooredRate } from "../lib/steam";
import { hoursFromMin, formatDate, pctRate, signed2, signed5 } from "../lib/format";
import { usePlan } from "../context/PlanContext";
import { AddButton } from "../components/AddButton";
import { AchIcon } from "../components/AchIcon";
import { computeImpactByApp, lockedItems, itemKey } from "../lib/plan";

type SortKey = "name" | "playtime" | "completion" | "last";

export function Library({ data }: { data: SteamData }) {
  const plan = usePlan();
  const impactByApp = useMemo(() => computeImpactByApp(data.games, plan.items), [data.games, plan.items]);
  const [query, setQuery] = useState("");
  const [onlyAch, setOnlyAch] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("playtime");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<number | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r: Game[] = data.games;
    if (q) r = r.filter((g) => g.name.toLowerCase().includes(q));
    if (onlyAch) r = r.filter((g) => g.has_achievements);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...r].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "playtime":
          return dir * (a.playtime_forever_min - b.playtime_forever_min);
        case "completion": {
          const ca = a.has_achievements ? flooredRate(a.achievements_unlocked, a.achievements_total) : -1;
          const cb = b.has_achievements ? flooredRate(b.achievements_unlocked, b.achievements_total) : -1;
          return dir * (ca - cb);
        }
        case "last": {
          const la = a.last_played ? Date.parse(a.last_played) : 0;
          const lb = b.last_played ? Date.parse(b.last_played) : 0;
          return dir * (la - lb);
        }
      }
    });
  }, [data.games, query, onlyAch, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }
  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <section className="view">
      <div className="view__head">
        <h2 className="view__title">Library</h2>
        <span className="view__count">{rows.length.toLocaleString()} games</span>
      </div>

      <div className="controls">
        <input
          className="search"
          type="search"
          placeholder="Search game…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          <button className={`chip-btn${onlyAch ? " chip-btn--on" : ""}`} onClick={() => setOnlyAch((v) => !v)}>
            Only with achievements
          </button>
        </div>
      </div>

      <div className="grid-head grid-head--lib">
        <button className="colh" onClick={() => toggleSort("name")}>
          Game{arrow("name")}
        </button>
        <button className="colh colh--r" onClick={() => toggleSort("playtime")}>
          Playtime{arrow("playtime")}
        </button>
        <button className="colh colh--r" onClick={() => toggleSort("completion")}>
          Completion{arrow("completion")}
        </button>
        <button className="colh colh--r" onClick={() => toggleSort("last")}>
          Last played{arrow("last")}
        </button>
      </div>

      <div className="tablebox">
        {rows.map((g) => {
          const comp = g.has_achievements ? flooredRate(g.achievements_unlocked, g.achievements_total) : null;
          const isOpen = expanded === g.appid;
          const canExpand = g.has_achievements;
          return (
            <div key={g.appid}>
              <div
                className={`grid-row grid-row--lib${canExpand ? " grid-row--click" : ""}`}
                onClick={() => canExpand && setExpanded(isOpen ? null : g.appid)}
                role={canExpand ? "button" : undefined}
                tabIndex={canExpand ? 0 : undefined}
                onKeyDown={(e) => {
                  if (canExpand && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setExpanded(isOpen ? null : g.appid);
                  }
                }}
              >
                <div className="cell-game cell-game--strong">
                  {canExpand && <span className={`chevron${isOpen ? " chevron--open" : ""}`}>&#9656;</span>}
                  {g.name}
                </div>
                <div className="cell-num">{hoursFromMin(g.playtime_forever_min)}h</div>
                <div className="cell-comp">
                  {comp == null ? (
                    <span className="cell-comp__na">no achievements</span>
                  ) : (
                    <>
                      <span className="cell-comp__bar">
                        <span
                          className={`cell-comp__fill${comp === 100 ? " cell-comp__fill--perfect" : ""}`}
                          style={{ width: `${comp}%` }}
                        />
                      </span>
                      <span className="cell-comp__pct">
                        {comp}%{" "}
                        <span className="cell-comp__frac">
                          {g.achievements_unlocked}/{g.achievements_total}
                        </span>
                      </span>
                    </>
                  )}
                </div>
                <div className="cell-num cell-num--dim">{formatDate(g.last_played)}</div>
              </div>
              {isOpen && <GameAchievements game={g} plan={plan} impact={impactByApp.get(g.appid)} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function GameAchievements({
  game,
  plan,
  impact,
}: {
  game: Game;
  plan: ReturnType<typeof usePlan>;
  impact: number | undefined;
}) {
  const locked = lockedItems(game);
  const allPlanned = locked.length > 0 && locked.every((i) => plan.has(i));
  const sorted = [...game.achievements].sort(
    (a, b) => (b.global_completion_rate_pct ?? -1) - (a.global_completion_rate_pct ?? -1),
  );

  function toggleAll() {
    if (allPlanned) plan.removeMany(locked.map(itemKey));
    else plan.merge(locked);
  }

  return (
    <div className="drill">
      <div className="drill__head">
        <span className="drill__count">
          {game.achievements_unlocked}/{game.achievements_total} unlocked
        </span>
        {locked.length > 0 && impact != null && (
          <span className="drill__impact">
            each ≈{" "}
            <b className={impact >= 0 ? "imp imp--up" : "imp imp--down"} title={`exact ${signed5(impact)}`}>
              {signed2(impact)}
            </b>
          </span>
        )}
        {locked.length > 0 && (
          <button className={`btn btn--sm${allPlanned ? " btn--go" : ""}`} onClick={toggleAll}>
            {allPlanned ? "✓ Planning 100%" : "Plan to 100%"}
          </button>
        )}
      </div>
      <div className="drill__list">
        {sorted.map((a) => (
          <div className="drill__row" key={a.api_name}>
            <AchIcon src={a.unlocked ? a.icon : a.icon_gray ?? a.icon} locked={!a.unlocked} size={28} />
            <div className="drill__name-wrap">
              <span className={`drill__name${a.unlocked ? " drill__name--done" : ""}`}>
                {a.unlocked ? "✓ " : ""}
                {a.name}
              </span>
              {a.description && <span className="drill__desc">{a.description}</span>}
            </div>
            <span className="drill__glob">{pctRate(a.global_completion_rate_pct)}</span>
            <span className="drill__add">
              {!a.unlocked && (
                <AddButton
                  item={{ kind: "achievement", appid: game.appid, game: game.name, apiName: a.api_name, name: a.name }}
                />
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
