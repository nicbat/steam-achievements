// Mirrors the JSON produced by steam_collect.py. Single source of truth.

export interface Bans {
  vac_banned: boolean | null;
  vac_ban_count: number | null;
  community_banned: boolean | null;
  economy_ban: string | null;
  game_ban_count: number | null;
}

export interface Player {
  steamid64: string;
  persona_name: string | null;
  profile_url: string | null;
  real_name: string | null;
  country: string | null;
  account_created: string | null; // ISO
  last_logoff: string | null; // ISO
  visibility: string | null; // "public" | "private_or_friends"
  avatar: string | null;
  steam_level: number | null;
  xp: number | null;
  badge_count: number | null;
  bans: Bans;
}

export interface Totals {
  owned_games: number;
  games_played: number;
  games_with_achievements: number;
  total_playtime_min: number;
  total_playtime_hours: number;
  total_achievements: number;
  total_achievements_unlocked: number;
}

export interface Achievement {
  api_name: string;
  name: string;
  description: string | null;
  unlocked: boolean;
  unlock_time: string | null; // ISO or null
  global_completion_rate_pct: number | null;
  icon: string | null; // unlocked icon URL (from GetSchemaForGame)
  icon_gray: string | null; // locked/grayscale icon URL
}

export interface Game {
  appid: number;
  name: string;
  playtime_forever_min: number;
  playtime_forever_hours: number;
  playtime_2weeks_min: number;
  playtime_windows_min: number;
  playtime_mac_min: number;
  playtime_linux_min: number;
  last_played: string | null; // ISO or null
  has_achievements: boolean;
  achievements_total: number;
  achievements_unlocked: number;
  completion_rate_pct: number | null;
  achievements: Achievement[];
}

export interface SteamData {
  collected_at: string; // ISO
  steamid64: string;
  player: Player;
  totals: Totals;
  games: Game[];
}
