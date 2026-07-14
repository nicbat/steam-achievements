import type { Game, SteamData } from "../types";

/** One flat row per achievement, denormalized with its game context. */
export interface AchievementRow {
  id: string; // appid + api_name
  appid: number;
  apiName: string;
  game: string;
  name: string;
  description: string | null;
  unlocked: boolean;
  unlockTime: string | null; // ISO or null
  globalRate: number | null; // % of all owners who have it
  icon: string | null; // resolved icon (unlocked vs gray)
}

export function flattenAchievements(data: SteamData): AchievementRow[] {
  const rows: AchievementRow[] = [];
  for (const g of data.games) {
    for (const a of g.achievements) {
      rows.push({
        id: `${g.appid}:${a.api_name}`,
        appid: g.appid,
        apiName: a.api_name,
        game: g.name,
        name: a.name,
        description: a.description,
        unlocked: a.unlocked,
        unlockTime: a.unlock_time,
        globalRate: a.global_completion_rate_pct,
        icon: a.unlocked ? a.icon : a.icon_gray ?? a.icon,
      });
    }
  }
  return rows;
}

/** Games that have achievements, for the library / rarity views. */
export function gamesWithAchievements(games: Game[]): Game[] {
  return games.filter((g) => g.has_achievements);
}
