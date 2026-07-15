import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import type { SteamData } from "../types";
import { flooredRate } from "../lib/steam";

const AXIS = "#6f8195";
const GRID = "#222c3a";
const ACCENT = "#66c0f4";
const GOLD = "#e7b464";

const tooltipStyle = {
  background: "#0b0e14",
  border: "1px solid #2c3849",
  borderRadius: 8,
  color: "#d3dde8",
  fontSize: 13,
};

interface ScatterPoint {
  x: number;
  y: number;
  name: string;
}

/** Default scatter tooltips only show x/y — this shows the game name too. */
function ScatterTip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div style={{ ...tooltipStyle, padding: "8px 11px" }}>
      <div style={{ color: "#eaf1f7", fontWeight: 600, marginBottom: 3 }}>{p.name}</div>
      <div style={{ color: "#9fb0c2" }}>
        {p.x}h played · {p.y}% complete
      </div>
    </div>
  );
}

const monthKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Rarity bands for the "how rare is my shelf" profile.
const BANDS = [
  { label: "<1%", lo: 0, hi: 1 },
  { label: "1–5%", lo: 1, hi: 5 },
  { label: "5–10%", lo: 5, hi: 10 },
  { label: "10–25%", lo: 10, hi: 25 },
  { label: "25–50%", lo: 25, hi: 50 },
  { label: "50%+", lo: 50, hi: 100.01 },
];

export function Trends({ data }: { data: SteamData }) {
  // Cumulative unlocks over time (by month).
  const timeline = useMemo(() => {
    const times: number[] = [];
    for (const g of data.games)
      for (const a of g.achievements) if (a.unlocked && a.unlock_time) times.push(Date.parse(a.unlock_time));
    times.sort((a, b) => a - b);
    const byMonth = new Map<string, number>();
    for (const t of times) byMonth.set(monthKey(t), (byMonth.get(monthKey(t)) ?? 0) + 1);
    let cum = 0;
    return [...byMonth.entries()].map(([month, count]) => ({ month, cumulative: (cum += count) }));
  }, [data.games]);

  // A · Steam average reconstructed month by month, replaying unlocks in order.
  const avgTimeline = useMemo(() => {
    const totals = new Map<number, number>();
    for (const g of data.games) if (g.has_achievements) totals.set(g.appid, g.achievements_total);
    const events: { t: number; appid: number }[] = [];
    for (const g of data.games)
      for (const a of g.achievements)
        if (a.unlocked && a.unlock_time) events.push({ t: Date.parse(a.unlock_time), appid: g.appid });
    events.sort((a, b) => a.t - b.t);

    const unlocked = new Map<number, number>();
    const byMonth = new Map<string, number>();
    for (const e of events) {
      unlocked.set(e.appid, (unlocked.get(e.appid) ?? 0) + 1);
      let sum = 0;
      let n = 0;
      for (const [appid, u] of unlocked) {
        const tot = totals.get(appid) ?? 0;
        if (u >= 1 && tot > 0) {
          sum += Math.floor((100 * u) / tot);
          n++;
        }
      }
      byMonth.set(monthKey(e.t), n ? +(sum / n).toFixed(2) : 0);
    }
    return [...byMonth.entries()].map(([month, avg]) => ({ month, avg }));
  }, [data.games]);

  // B · Rarity profile of what you own (unlocked achievements bucketed by global rate).
  const rarityProfile = useMemo(() => {
    const counts = BANDS.map((b) => ({ ...b, count: 0 }));
    for (const g of data.games)
      for (const a of g.achievements)
        if (a.unlocked && a.global_completion_rate_pct != null) {
          const r = a.global_completion_rate_pct;
          const band = counts.find((b) => r >= b.lo && r < b.hi);
          if (band) band.count++;
        }
    return counts;
  }, [data.games]);

  // D · Unlock cadence heatmap: year × month grid of unlock counts.
  const heatmap = useMemo(() => {
    const grid = new Map<string, number>(); // `${year}-${month}` (month 0-11)
    let max = 0;
    let minYear = Infinity;
    let maxYear = -Infinity;
    for (const g of data.games)
      for (const a of g.achievements)
        if (a.unlocked && a.unlock_time) {
          const d = new Date(Date.parse(a.unlock_time));
          const y = d.getFullYear();
          const m = d.getMonth();
          const key = `${y}-${m}`;
          const v = (grid.get(key) ?? 0) + 1;
          grid.set(key, v);
          if (v > max) max = v;
          if (y < minYear) minYear = y;
          if (y > maxYear) maxYear = y;
        }
    if (!Number.isFinite(minYear)) return { years: [], grid, max: 0 };
    const years: number[] = [];
    for (let y = maxYear; y >= minYear; y--) years.push(y);
    return { years, grid, max };
  }, [data.games]);

  // Playtime vs completion scatter.
  const scatter = useMemo(
    () =>
      data.games
        .filter((g) => g.has_achievements && g.playtime_forever_min > 0)
        .map((g) => ({
          x: +(g.playtime_forever_min / 60).toFixed(1),
          y: flooredRate(g.achievements_unlocked, g.achievements_total),
          name: g.name,
        })),
    [data.games],
  );

  const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  return (
    <section className="view">
      <div className="view__head">
        <h2 className="view__title">Trends</h2>
      </div>

      <div className="chart-card">
        <h3 className="chart-card__title">Achievements unlocked over time</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={timeline} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="fillCum" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" stroke={AXIS} tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis stroke={AXIS} tick={{ fontSize: 11 }} width={44} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="cumulative" stroke={ACCENT} strokeWidth={2} fill="url(#fillCum)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3 className="chart-card__title">Your average over time</h3>
        <p className="chart-card__sub">
          Your Steam average, replayed unlock by unlock. It dips each time you start a new game and climbs as you
          finish them.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={avgTimeline} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="fillAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GOLD} stopOpacity={0.32} />
                <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" stroke={AXIS} tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis stroke={AXIS} tick={{ fontSize: 11 }} width={44} unit="%" domain={[0, "auto"]} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Avg"]} />
            <Area type="monotone" dataKey="avg" stroke={GOLD} strokeWidth={2} fill="url(#fillAvg)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3 className="chart-card__title">Rarity of your unlocks</h3>
        <p className="chart-card__sub">
          Every achievement you&rsquo;ve earned, grouped by how many other players have it.
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rarityProfile} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" stroke={AXIS} tick={{ fontSize: 11 }} />
            <YAxis stroke={AXIS} tick={{ fontSize: 11 }} width={44} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(102,192,244,0.06)" }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {rarityProfile.map((b, i) => (
                <Cell key={b.label} fill={i <= 1 ? GOLD : ACCENT} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3 className="chart-card__title">Unlock cadence</h3>
        <p className="chart-card__sub">Unlocks per month. Brighter months are busier.</p>
        <div className="heat">
          {heatmap.years.map((y) => (
            <div className="heat__row" key={y}>
              <span className="heat__year">{y}</span>
              <div className="heat__cells">
                {MONTHS.map((label, m) => {
                  const v = heatmap.grid.get(`${y}-${m}`) ?? 0;
                  const intensity = heatmap.max ? v / heatmap.max : 0;
                  return (
                    <span
                      key={m}
                      className="heat__cell"
                      title={`${y} · ${v} unlock${v === 1 ? "" : "s"}`}
                      style={{
                        background:
                          v === 0 ? "#141b26" : `rgba(102,192,244,${(0.15 + 0.85 * intensity).toFixed(3)})`,
                      }}
                    >
                      <span className="heat__m">{label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-card">
        <h3 className="chart-card__title">Playtime vs completion</h3>
        <p className="chart-card__sub">
          Each dot is a game. Further right means more hours played; higher up means more complete.
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              type="number"
              dataKey="x"
              name="Hours"
              stroke={AXIS}
              tick={{ fontSize: 11 }}
              unit="h"
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Completion"
              stroke={AXIS}
              tick={{ fontSize: 11 }}
              width={44}
              unit="%"
              domain={[0, 100]}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: GRID }} content={<ScatterTip />} />
            <Scatter data={scatter} fill={ACCENT} fillOpacity={0.55} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
