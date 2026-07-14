import type { Game, SteamData } from "../types";
import { flooredRate, averageCompletion, type AverageResult } from "./steam";

// A plan is a flat set of individual achievement moves. "Take a game to 100%"
// is just every one of its locked achievements added at once (see lockedItems),
// so a planned game shows each box ticked and any single one can be dropped.
export type PlanItem = { kind: "achievement"; appid: number; game: string; apiName: string; name: string };

export function itemKey(i: PlanItem): string {
  return `a:${i.appid}:${i.apiName}`;
}

/** Every locked achievement of a game as individual plan items — the "check all" set. */
export function lockedItems(g: Game): PlanItem[] {
  return g.achievements
    .filter((a) => !a.unlocked)
    .map((a) => ({ kind: "achievement" as const, appid: g.appid, game: g.name, apiName: a.api_name, name: a.name }));
}

// --- projection -----------------------------------------------------------

/** Resulting unlocked-count per appid once the plan is applied. */
function projectedUnlocked(games: Game[], items: PlanItem[]): Map<number, number> {
  const added = new Map<number, Set<string>>();
  for (const it of items) {
    let s = added.get(it.appid);
    if (!s) {
      s = new Set();
      added.set(it.appid, s);
    }
    s.add(it.apiName);
  }
  const out = new Map<number, number>();
  for (const g of games) {
    out.set(g.appid, Math.min(g.achievements_total, g.achievements_unlocked + (added.get(g.appid)?.size ?? 0)));
  }
  return out;
}

export function projectGames(games: Game[], items: PlanItem[]): Game[] {
  if (items.length === 0) return games;
  const pu = projectedUnlocked(games, items);
  return games.map((g) => {
    const u = pu.get(g.appid);
    return u == null || u === g.achievements_unlocked ? g : { ...g, achievements_unlocked: u };
  });
}

export function projectAverage(games: Game[], items: PlanItem[]): AverageResult {
  return averageCompletion(projectGames(games, items));
}

/**
 * Marginal points added to the average by unlocking ONE more achievement in each
 * game, given the current plan. O(1) per game after one pass — this is what keeps
 * the Achievements list's Impact column live as the plan changes.
 */
export function computeImpactByApp(games: Game[], items: PlanItem[]): Map<number, number> {
  const projected = projectGames(games, items);
  const counted = projected.filter((g) => g.has_achievements && g.achievements_unlocked >= 1);
  const n = counted.length;
  let sum = 0;
  for (const g of counted) sum += flooredRate(g.achievements_unlocked, g.achievements_total);
  const mean = n ? sum / n : 0;

  const map = new Map<number, number>();
  for (const g of projected) {
    if (!g.has_achievements) continue;
    const pu = g.achievements_unlocked;
    const t = g.achievements_total;
    if (pu >= t) {
      map.set(g.appid, 0);
      continue;
    }
    if (pu >= 1) {
      const delta = flooredRate(pu + 1, t) - flooredRate(pu, t);
      map.set(g.appid, n ? delta / n : 0);
    } else {
      // Starting a new game adds it to the counted set (denominator + 1).
      const newMean = (sum + flooredRate(1, t)) / (n + 1);
      map.set(g.appid, newMean - mean);
    }
  }
  return map;
}

/** General marginal impact of adding one candidate move on top of the current plan. */
export function marginalImpact(games: Game[], items: PlanItem[], candidate: PlanItem): number {
  return marginalImpactMany(games, items, [candidate]);
}

/** Marginal impact of adding a whole set of moves on top of the current plan. */
export function marginalImpactMany(games: Game[], items: PlanItem[], candidates: PlanItem[]): number {
  if (candidates.length === 0) return 0;
  const before = projectAverage(games, items).mean;
  const after = projectAverage(games, [...items, ...candidates]).mean;
  return after - before;
}

// --- export / import ------------------------------------------------------

export function toMarkdown(data: SteamData, items: PlanItem[]): string {
  const base = averageCompletion(data.games);
  const proj = projectAverage(data.games, items);
  const gameById = new Map(data.games.map((g) => [g.appid, g]));

  const groups = new Map<number, PlanItem[]>();
  for (const it of items) {
    const arr = groups.get(it.appid) ?? [];
    arr.push(it);
    groups.set(it.appid, arr);
  }

  const persona = data.player.persona_name ?? data.steamid64;
  const pts = proj.mean - base.mean;
  const lines: string[] = [
    `# Achievement plan — ${persona}`,
    "",
    `Current average: ${base.displayed}%  →  Projected: ${proj.displayed}%  ` +
      `(${pts >= 0 ? "+" : ""}${pts.toFixed(2)} pts, ${items.length} move${items.length === 1 ? "" : "s"})`,
    "",
  ];

  for (const [appid, its] of groups) {
    const g = gameById.get(appid);
    if (!g) continue;
    const apis = new Set(its.map((i) => i.apiName));
    const targets = g.achievements.filter((a) => !a.unlocked && apis.has(a.api_name));
    const from = g.achievements_unlocked;
    const to = Math.min(g.achievements_total, from + targets.length);
    const target =
      to === g.achievements_total ? "100%" : `${from}/${g.achievements_total} → ${to}/${g.achievements_total}`;
    lines.push(`## ${g.name} — ${target}`);
    for (const a of targets) {
      const r = a.global_completion_rate_pct;
      lines.push(`- [ ] **${a.name}**${r != null ? `   (${Number(r.toFixed(1))}% global)` : ""}`);
      const desc = a.description?.trim();
      if (desc) lines.push(`      ${desc}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function toJson(data: SteamData, items: PlanItem[]): string {
  return JSON.stringify({ app: "achievement-atlas", version: 1, steamid64: data.steamid64, items }, null, 2);
}

export function parsePlanJson(text: string): PlanItem[] {
  const obj: unknown = JSON.parse(text);
  const items = (obj as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error("Not an Achievement Atlas plan file.");
  const valid: PlanItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const i = raw as Record<string, unknown>;
    if (typeof i.appid !== "number" || typeof i.game !== "string") continue;
    if (i.kind === "achievement" && typeof i.apiName === "string" && typeof i.name === "string")
      valid.push({ kind: "achievement", appid: i.appid, game: i.game, apiName: i.apiName, name: i.name });
  }
  return valid;
}

// --- storage --------------------------------------------------------------

const storageKey = (sid: string) => `achievement-atlas:plan:${sid}`;

export function loadPlan(sid: string): PlanItem[] {
  try {
    const raw = localStorage.getItem(storageKey(sid));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PlanItem[]) : [];
  } catch {
    return [];
  }
}

export function savePlan(sid: string, items: PlanItem[]): void {
  try {
    localStorage.setItem(storageKey(sid), JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}
