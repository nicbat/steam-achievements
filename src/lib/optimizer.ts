import type { Game } from "../types";
import { flooredRate, averageCompletion, type AverageResult } from "./steam";

// ---------------------------------------------------------------------------
// Ported from analyze.py. Every impact is expressed as the number of points it
// adds to your displayed average, using Steam's floor-each-game method.
// ---------------------------------------------------------------------------

export interface StartedSuggestion {
  appid: number;
  game: string;
  unlocked: number;
  total: number;
  impact: number; // +avg from one more unlock
  easiestName: string | null;
  easiestApi: string | null;
  easiestGlobal: number | null;
}

export interface NearPerfect {
  appid: number;
  game: string;
  remaining: number;
  nowPct: number;
  impact: number; // +avg from reaching 100%
}

export interface StartSuggestion {
  appid: number;
  game: string;
  total: number;
  impactOne: number; // +avg from the first (easiest) unlock — can be negative
  impactFull: number; // +avg from 100%
  easiestName: string | null;
  easiestApi: string | null;
  easiestGlobal: number | null;
}

function easiestLocked(g: Game) {
  const locked = g.achievements.filter((a) => !a.unlocked && a.global_completion_rate_pct != null);
  if (locked.length === 0) return null;
  return locked.reduce((best, a) =>
    (a.global_completion_rate_pct ?? -1) > (best.global_completion_rate_pct ?? -1) ? a : best,
  );
}

export interface Optimization {
  base: AverageResult;
  started: StartedSuggestion[];
  nearPerfect: NearPerfect[];
  toStart: StartSuggestion[];
}

export function optimize(games: Game[]): Optimization {
  const base = averageCompletion(games);
  const n = base.countedGames || 1;
  const avg = base.mean;

  const started = games.filter((g) => g.has_achievements && g.achievements_unlocked >= 1);
  const unstarted = games.filter((g) => g.has_achievements && g.achievements_unlocked === 0);

  const startedSug: StartedSuggestion[] = [];
  const near: NearPerfect[] = [];
  for (const g of started) {
    const u = g.achievements_unlocked;
    const t = g.achievements_total;
    if (u >= t) continue;
    const bump = flooredRate(u + 1, t) - flooredRate(u, t);
    const e = easiestLocked(g);
    if (bump > 0) {
      startedSug.push({
        appid: g.appid,
        game: g.name,
        unlocked: u,
        total: t,
        impact: bump / n,
        easiestName: e?.name ?? null,
        easiestApi: e?.api_name ?? null,
        easiestGlobal: e?.global_completion_rate_pct ?? null,
      });
    }
    const remaining = t - u;
    if (remaining > 0 && remaining <= 3) {
      near.push({
        appid: g.appid,
        game: g.name,
        remaining,
        nowPct: flooredRate(u, t),
        impact: (100 - flooredRate(u, t)) / n,
      });
    }
  }
  startedSug.sort((a, b) => b.impact - a.impact || (b.easiestGlobal ?? -1) - (a.easiestGlobal ?? -1));
  near.sort((a, b) => b.impact - a.impact);

  const toStart: StartSuggestion[] = unstarted.map((g) => {
    const t = g.achievements_total;
    const e = easiestLocked(g);
    return {
      appid: g.appid,
      game: g.name,
      total: t,
      impactOne: (flooredRate(1, t) - avg) / (n + 1),
      impactFull: (100 - avg) / (n + 1),
      easiestName: e?.name ?? null,
      easiestApi: e?.api_name ?? null,
      easiestGlobal: e?.global_completion_rate_pct ?? null,
    };
  });
  toStart.sort((a, b) => b.impactOne - a.impactOne || (b.easiestGlobal ?? -1) - (a.easiestGlobal ?? -1));

  return { base, started: startedSug, nearPerfect: near, toStart };
}

// ---------------------------------------------------------------------------
// Projection engine for the interactive "what-if" plan. Apply a set of moves
// to a working copy of the library and recompute the average exactly.
// ---------------------------------------------------------------------------

export type MoveKind = "unlock-one" | "perfect" | "start-one" | "start-full";

export interface Move {
  id: string; // stable key
  kind: MoveKind;
  appid: number;
  game: string;
  label: string;
  impactHint: number; // standalone +avg, for display/sorting
}

/** Recompute the average with the given moves applied on top of the base library. */
export function projectAverage(games: Game[], moves: Move[]): AverageResult {
  // appid -> resulting unlocked count override
  const override = new Map<number, number>();
  const byId = new Map<number, Game>(games.map((g) => [g.appid, g]));

  for (const m of moves) {
    const g = byId.get(m.appid);
    if (!g) continue;
    const cur = override.get(m.appid) ?? g.achievements_unlocked;
    if (m.kind === "unlock-one") override.set(m.appid, Math.min(g.achievements_total, cur + 1));
    else if (m.kind === "perfect" || m.kind === "start-full") override.set(m.appid, g.achievements_total);
    else if (m.kind === "start-one") override.set(m.appid, Math.max(cur, 1));
  }

  const projected: Game[] = games.map((g) => {
    const ov = override.get(g.appid);
    return ov == null ? g : { ...g, achievements_unlocked: ov };
  });
  return averageCompletion(projected);
}
