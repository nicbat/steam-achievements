import { useMemo, type ReactNode, type CSSProperties } from "react";
import type { Game, SteamData } from "../types";
import { averageCompletion, flooredRate } from "../lib/steam";
import { optimize } from "../lib/optimizer";
import { marginalImpactMany, projectAverage, itemKey, lockedItems, type PlanItem } from "../lib/plan";
import { pctRate, signed2, signed5 } from "../lib/format";
import { usePersistedNumber } from "../lib/hooks";
import { AddButton } from "../components/AddButton";
import { MeanValue } from "../components/MeanValue";
import { usePlan } from "../context/PlanContext";

function achievementsToItems(g: Game, achs: Game["achievements"]): PlanItem[] {
  return achs.map((a) => ({ kind: "achievement" as const, appid: g.appid, game: g.name, apiName: a.api_name, name: a.name }));
}

function achievementItem(g: Game, api: string | null, name: string | null): PlanItem | null {
  if (api && name) return { kind: "achievement", appid: g.appid, game: g.name, apiName: api, name };
  const locked = g.achievements.find((a) => !a.unlocked);
  if (!locked) return null;
  return { kind: "achievement", appid: g.appid, game: g.name, apiName: locked.api_name, name: locked.name };
}

function ImpactTag({ v }: { v: number }) {
  return (
    <span className={v >= 0 ? "imp imp--up" : "imp imp--down"} title={`exact ${signed5(v)}`}>
      {signed2(v)}
    </span>
  );
}

function SliderRow({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="sliderrow">
      <label className="sliderrow__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="sliderrow__range"
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--pct": `${value}%` } as CSSProperties}
      />
      <span className="sliderrow__val">{value}%</span>
    </div>
  );
}

export function Optimizer({ data }: { data: SteamData }) {
  const plan = usePlan();
  const opt = useMemo(() => optimize(data.games), [data.games]);
  const base = useMemo(() => averageCompletion(data.games), [data.games]);
  const proj = useMemo(() => projectAverage(data.games, plan.items), [data.games, plan.items]);
  const gameById = useMemo(() => new Map(data.games.map((g) => [g.appid, g])), [data.games]);

  // Highest-global locked achievements — the "easy wins you skipped" (was its own tab).
  const easyWins = useMemo(() => {
    const out: { appid: number; game: string; name: string; apiName: string; rate: number }[] = [];
    for (const g of data.games)
      for (const a of g.achievements)
        if (!a.unlocked && a.global_completion_rate_pct != null)
          out.push({ appid: g.appid, game: g.name, name: a.name, apiName: a.api_name, rate: a.global_completion_rate_pct });
    out.sort((x, y) => y.rate - x.rate);
    return out.slice(0, 24);
  }, [data.games]);

  // Worth-Starting Finder — two sliders. N = rarity floor ("achievements I can
  // plausibly get"); X = completion target, defaulting to the live average.
  const [floorN, setFloorN] = usePersistedNumber("achievement-atlas:wsf:floor", 25);
  const [targetX, setTargetX] = usePersistedNumber("achievement-atlas:wsf:target", base.displayed);

  const finder = useMemo(() => {
    const rows: {
      game: Game;
      cur: number;
      reach: number;
      easyLocked: Game["achievements"];
      easyCount: number;
    }[] = [];
    for (const g of data.games) {
      if (!g.has_achievements || g.achievements_total === 0) continue;
      const cur = flooredRate(g.achievements_unlocked, g.achievements_total);
      if (cur >= targetX) continue; // already at/above the target — nothing to chase
      const easyLocked = g.achievements.filter(
        (a) => !a.unlocked && a.global_completion_rate_pct != null && a.global_completion_rate_pct >= floorN,
      );
      if (easyLocked.length === 0) continue; // no plausibly-reachable unlocks left
      // Where you'd land: everything already unlocked + every locked achievement above the floor.
      const reachCount = g.achievements.filter(
        (a) => a.unlocked || (a.global_completion_rate_pct != null && a.global_completion_rate_pct >= floorN),
      ).length;
      const reach = flooredRate(reachCount, g.achievements_total);
      if (reach < targetX) continue; // wouldn't get you to the target
      rows.push({ game: g, cur, reach, easyLocked, easyCount: easyLocked.length });
    }
    rows.sort((a, b) => b.reach - a.reach || a.game.name.localeCompare(b.game.name));
    return rows;
  }, [data.games, floorN, targetX]);

  // Plan-INDEPENDENT "worth of these unlocks" — always measured from your actual
  // current unlock state (empty-plan baseline), never from the working plan. Two
  // reasons this is the right number for the discovery sections:
  //   1. It stays constant after you check a row instead of collapsing to 0.
  //   2. It can't drift when you plan *other* games. (Plan-aware impact for an
  //      unstarted game depends on your summed rates — starting a fresh low game
  //      moves a high average more than a low one — so planning game A would nudge
  //      game B's number. Measuring from the fixed base removes that coupling.)
  // The plan pill / projection still show the true combined effect of the whole plan.
  const standaloneImpact = (items: PlanItem[]) =>
    items.length === 0 ? 0 : marginalImpactMany(data.games, [], items);
  const standaloneImpactOf = (item: PlanItem) => standaloneImpact([item]);
  const allPlanned = (items: PlanItem[]) => items.length > 0 && items.every((i) => plan.has(i));
  const toggleAll = (items: PlanItem[]) =>
    allPlanned(items) ? plan.removeMany(items.map(itemKey)) : plan.merge(items);

  const delta = proj.mean - base.mean;

  return (
    <section className="view">
      <div className="view__head">
        <h2 className="view__title">Completion optimizer</h2>
        <span className="view__count">{plan.items.length} in plan</span>
      </div>

      <div className="proj">
        <div className="proj__now">
          <div className="proj__label">Now</div>
          <div className="proj__val">{base.displayed}%</div>
        </div>
        <div className="proj__arrow" aria-hidden="true">
          &#8594;
        </div>
        <div className="proj__next">
          <div className="proj__label">Projected</div>
          <div className={`proj__val${proj.displayed > base.displayed ? " proj__val--up" : ""}`}>
            {proj.displayed}%
          </div>
        </div>
        <div className="proj__meta">
          <div>
            exact mean <MeanValue value={base.mean} /> &rarr; <b><MeanValue value={proj.mean} /></b>
          </div>
          <div className={delta >= 0 ? "proj__gain" : "proj__loss"} title={`exact ${signed5(delta)}`}>
            {signed2(delta)} pts &middot; {proj.countedGames} counted games
          </div>
          {plan.items.length > 0 && (
            <button className="linkbtn" onClick={() => plan.clear()}>
              Clear plan
            </button>
          )}
        </div>
      </div>

      {/* 1. Almost-perfect — check-all, expands to show the last achievements */}
      <div className="ogroup">
        <h3 className="ogroup__title">Finish almost-perfect games</h3>
        <p className="ogroup__sub">Games 1–3 achievements short of 100%. Each one&rsquo;s remaining achievements are listed with how many players have them — watch for a rare one.</p>
        <div className="ogroup__list">
          {opt.nearPerfect.map((s) => {
            const g = gameById.get(s.appid)!;
            const items = lockedItems(g);
            const on = allPlanned(items);
            const remaining = g.achievements
              .filter((a) => !a.unlocked)
              .sort((a, b) => (a.global_completion_rate_pct ?? 0) - (b.global_completion_rate_pct ?? 0));
            return (
              <div key={s.appid} className={`orow orow--stack${on ? " orow--on" : ""}`}>
                <div className="orow__main">
                  <button
                    className={`orow__add${on ? " orow__add--on" : ""}`}
                    onClick={() => toggleAll(items)}
                    aria-pressed={on}
                    aria-label={`${on ? "Remove" : "Plan 100% of"} ${s.game}`}
                  >
                    {on ? "✓" : "+"}
                  </button>
                  <div className="orow__body">
                    <div className="orow__game">{s.game}</div>
                    <div className="orow__detail">
                      {s.remaining} left · at {s.nowPct}% · Plan to 100%
                    </div>
                  </div>
                  <div className="orow__impact">
                    <ImpactTag v={standaloneImpact(items)} />
                  </div>
                </div>
                <div className="orow__sub">
                  {remaining.map((a) => (
                    <div className="subline" key={a.api_name}>
                      <span className="subline__n">{a.name}</span>
                      <span
                        className={`subline__g${
                          a.global_completion_rate_pct != null && a.global_completion_rate_pct < 5 ? " subline__g--rare" : ""
                        }`}
                      >
                        {pctRate(a.global_completion_rate_pct)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Best single unlocks in started games */}
      <div className="ogroup">
        <h3 className="ogroup__title">Best single unlocks (started games)</h3>
        <p className="ogroup__sub">One more achievement in a game you&rsquo;ve already started. Games with fewer achievements move your average the most.</p>
        <div className="ogroup__list">
          {opt.started.slice(0, 18).map((s) => {
            const item = achievementItem(gameById.get(s.appid)!, s.easiestApi, s.easiestName);
            if (!item) return null;
            const on = plan.has(item);
            return (
              <div key={s.appid} className={`orow${on ? " orow--on" : ""}`}>
                <AddButton item={item} />
                <div className="orow__body">
                  <div className="orow__game">{s.game}</div>
                  <div className="orow__detail">
                    {s.unlocked}/{s.total}
                    {s.easiestName ? ` · easiest: ${s.easiestName} (${pctRate(s.easiestGlobal)})` : ""}
                  </div>
                </div>
                <div className="orow__impact">
                  <ImpactTag v={standaloneImpactOf(item)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Worth-Starting Finder — two sliders find games you could take above your target */}
      <div className="ogroup">
        <h3 className="ogroup__title">Games worth starting</h3>
        <p className="ogroup__sub">
          Starting a game only helps if you&rsquo;ll finish more of it than your current average. Choose how easy an
          achievement has to be to count as reachable (<b>N</b>) and the completion you&rsquo;re aiming for (<b>X</b>);
          these games can get there. &ldquo;Plan easy set&rdquo; adds just the achievements above your N threshold.
        </p>

        <div className="wsf__sliders">
          <SliderRow
            id="wsf-floor"
            label={
              <>
                Only count achievements <b>≥ {floorN}%</b> global
              </>
            }
            value={floorN}
            onChange={setFloorN}
          />
          <SliderRow
            id="wsf-target"
            label={
              <>
                Show games I could reach <b>≥ {targetX}%</b>
              </>
            }
            value={targetX}
            onChange={setTargetX}
          />
          <div className="wsf__meta">
            <span>
              {finder.length} game{finder.length === 1 ? "" : "s"} qualify
            </span>
            <span className="wsf__sort">sorted by reachable ▼</span>
            {targetX !== base.displayed && (
              <button className="linkbtn" onClick={() => setTargetX(base.displayed)}>
                reset to average ({base.displayed}%)
              </button>
            )}
          </div>
        </div>

        <div className="ogroup__list">
          {finder.length === 0 && (
            <p className="wsf__empty">No games clear these thresholds — loosen the floor or lower the target.</p>
          )}
          {finder.map(({ game: g, cur, reach, easyLocked, easyCount }) => {
            const easySet = achievementsToItems(g, easyLocked);
            const fullSet = lockedItems(g);
            const easyOn = allPlanned(easySet);
            const fullOn = allPlanned(fullSet);
            const lifts = reach > base.displayed;
            return (
              <div key={g.appid} className={`orow${easyOn || fullOn ? " orow--on" : ""}`}>
                <button
                  className={`orow__add${easyOn ? " orow__add--on" : ""}`}
                  onClick={() => toggleAll(easySet)}
                  aria-pressed={easyOn}
                  aria-label={`${easyOn ? "Remove" : "Plan the easy set of"} ${g.name}`}
                >
                  {easyOn ? "✓" : "+"}
                </button>
                <div className="orow__body">
                  <div className="orow__game">{g.name}</div>
                  <div className="orow__detail">
                    {easyCount} of {g.achievements_total} ≥ {floorN}%
                    {cur > 0 ? ` · now ${cur}%` : " · unstarted"} · reach{" "}
                    <b className={lifts ? "imp imp--up" : "imp imp--amber"}>{reach}%</b>
                    {g.achievements_total > easyCount && (
                      <button
                        className={`easiest${fullOn ? " easiest--on" : ""}`}
                        onClick={() => toggleAll(fullSet)}
                        title={`Plan every remaining achievement (100%) · exact ${signed5(standaloneImpact(fullSet))}`}
                      >
                        {fullOn ? "✓ 100%" : "+ 100%"} ({signed2(standaloneImpact(fullSet))})
                      </button>
                    )}
                  </div>
                </div>
                <div className="orow__impact">
                  <ImpactTag v={standaloneImpact(easySet)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Easy wins you skipped — highest-global locked achievements (was the Rarity tab) */}
      <div className="ogroup">
        <h3 className="ogroup__title">Easy wins you skipped</h3>
        <p className="ogroup__sub">
          Locked achievements that most other players already have — quick unlocks sitting in your library. The percentage is how many players have each.
        </p>
        <div className="ogroup__list">
          {easyWins.map((w) => {
            const item: PlanItem = { kind: "achievement", appid: w.appid, game: w.game, apiName: w.apiName, name: w.name };
            const on = plan.has(item);
            return (
              <div key={`${w.appid}:${w.apiName}`} className={`orow${on ? " orow--on" : ""}`}>
                <AddButton item={item} />
                <div className="orow__body">
                  <div className="orow__game">{w.name}</div>
                  <div className="orow__detail">
                    {w.game} · {pctRate(w.rate)} of players
                  </div>
                </div>
                <div className="orow__impact">
                  <ImpactTag v={standaloneImpactOf(item)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
