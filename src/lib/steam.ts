import type { Game, SteamData } from "../types";

/** A game's completion %, floored the way Steam displays it (5/6 -> 83, not 83.3). */
export function flooredRate(unlocked: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((100 * unlocked) / total);
}

/** Games that count toward the Steam average: have achievements AND >=1 unlocked. */
export function countedGames(games: Game[]): Game[] {
  return games.filter((g) => g.has_achievements && g.achievements_unlocked >= 1);
}

export interface AverageResult {
  countedGames: number; // n
  mean: number; // exact mean of floored per-game rates
  displayed: number; // what Steam shows (mean floored again)
  perfectGames: number; // games at 100%
}

/**
 * Steam's "average game completion rate": floor each counted game's %,
 * take the mean, then floor that. This is why a profile can show 32% when a
 * naive raw-rate mean gives 33%.
 */
export function averageCompletion(games: Game[]): AverageResult {
  const counted = countedGames(games);
  const n = counted.length;
  if (n === 0) return { countedGames: 0, mean: 0, displayed: 0, perfectGames: 0 };
  const floored = counted.map((g) => flooredRate(g.achievements_unlocked, g.achievements_total));
  const mean = floored.reduce((a, b) => a + b, 0) / n;
  return {
    countedGames: n,
    mean,
    displayed: Math.floor(mean),
    perfectGames: floored.filter((r) => r === 100).length,
  };
}

/** Runtime shape check so a wrong file gives a clear error instead of a blank screen. */
export function isSteamData(x: unknown): x is SteamData {
  if (typeof x !== "object" || x === null) return false;
  const d = x as Record<string, unknown>;
  return (
    Array.isArray(d.games) &&
    typeof d.player === "object" &&
    d.player !== null &&
    typeof d.totals === "object" &&
    d.totals !== null &&
    typeof d.steamid64 === "string"
  );
}

export function formatHours(hours: number): string {
  return hours >= 1000
    ? `${(hours / 1000).toFixed(1)}k`
    : hours.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Whole years since an ISO date, or null. */
export function accountAgeYears(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (365.25 * 24 * 3600 * 1000));
}
