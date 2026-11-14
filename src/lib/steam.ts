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
  if (!isRecord(x) || typeof x.steamid64 !== "string" || !x.steamid64.trim()) return false;
  if (typeof x.collected_at !== "string" || !Number.isFinite(Date.parse(x.collected_at))) return false;
  if (!isRecord(x.player) || !isRecord(x.totals) || !Array.isArray(x.games)) return false;
  const player = x.player;
  // Older exports may omit metadata such as icons, profile details, or platform
  // playtimes. Require the values the dashboard computes with, and type-check
  // optional metadata when present without insisting on newer collector fields.
  if (!["persona_name", "profile_url", "real_name", "country", "account_created", "last_logoff", "visibility", "avatar"]
    .every((key) => optionalString(player[key]))) return false;
  if (!["steam_level", "xp", "badge_count"].every((key) => optionalNumber(player[key]))) return false;
  const totals = x.totals;
  if (!["owned_games", "games_with_achievements", "total_playtime_hours", "total_achievements", "total_achievements_unlocked"]
    .every((key) => nonnegativeNumber(totals[key]))) return false;
  return x.games.every((game) => {
    if (!isRecord(game) || !Number.isSafeInteger(game.appid) || (game.appid as number) <= 0) return false;
    if (typeof game.name !== "string" || typeof game.has_achievements !== "boolean") return false;
    if (!["playtime_forever_min", "achievements_total", "achievements_unlocked"]
      .every((key) => nonnegativeNumber(game[key]))) return false;
    if (!optionalString(game.last_played) || !Array.isArray(game.achievements)) return false;
    return game.achievements.every((achievement) => {
      if (!isRecord(achievement)) return false;
      return typeof achievement.api_name === "string" && typeof achievement.name === "string" &&
        typeof achievement.unlocked === "boolean" &&
        ["description", "unlock_time", "icon", "icon_gray"].every((key) => optionalString(achievement[key])) &&
        optionalNumber(achievement.global_completion_rate_pct);
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonnegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function optionalNumber(value: unknown): boolean {
  return value == null || nonnegativeNumber(value);
}

function optionalString(value: unknown): boolean {
  return value == null || typeof value === "string";
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
