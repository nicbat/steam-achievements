import type { SteamData } from '../types';
import { isSteamData } from './steam';
import { validatePlanItems, type PlanItem } from './plan';

export type Freshness = Record<string, Record<string, { progress?: string; schema?: string; rarity?: string; progressUnavailable?: string; noAchievementSchema?: string }>>;
export interface Dataset {
  version: 1;
  revision: number;
  generation: number;
  active: SteamData | null;
  plans: Record<string, PlanItem[]>;
  preferences: { planPinned?: boolean; optimizerFloor?: number; optimizerTarget?: number };
  freshness: Freshness;
  refreshes: Record<string, string>;
  checkpoint: Record<string, unknown> | null;
}
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const steamId = (value: unknown): value is string => typeof value === 'string' && /^7656119\d{10}$/.test(value);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function date(value: unknown): value is string { return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)); }
export function emptyDataset(): Dataset { return { version: 1, revision: 0, generation: 0, active: null, plans: {}, preferences: {}, freshness: {}, refreshes: {}, checkpoint: null }; }
function bounded(value: unknown, depth = 0, maxString = 16384): void {
  requireValue(depth <= 16, 'Data is nested too deeply.');
  if (typeof value === 'string') requireValue(value.length <= maxString, 'A text field is too long.');
  else if (typeof value === 'number') requireValue(Number.isFinite(value), 'Data contains a non-finite number.');
  else if (Array.isArray(value)) { requireValue(value.length <= 500000, 'Too many entries.'); for (const v of value) bounded(v, depth + 1, maxString); }
  else if (record(value)) { requireValue(Object.keys(value).length <= 100000, 'Too many fields.'); for (const [k, v] of Object.entries(value)) { requireValue(!['__proto__', 'constructor', 'prototype'].includes(k), 'Unsafe field name.'); bounded(v, depth + 1, maxString); } }
  else requireValue(value === null || typeof value === 'boolean' || value === undefined, 'Unsupported data value.');
}
function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> { return Object.fromEntries(keys.filter(k => source[k] !== undefined).map(k => [k, source[k]])); }
export function validateSnapshot(value: unknown): SteamData {
  requireValue(isSteamData(value), 'Invalid Steam library.');
  requireValue(steamId(value.steamid64) && value.player.steamid64 === value.steamid64, 'Library profile IDs do not agree.');
  requireValue(value.games.length <= 10000, 'Too many games.');
  bounded(value);
  const ids = new Set<number>();
  let achievements = 0;
  for (const g of value.games) {
    requireValue(!ids.has(g.appid) && g.appid <= 2147483647, 'Duplicate or invalid game ID.'); ids.add(g.appid);
    requireValue(Number.isSafeInteger(g.achievements_total) && Number.isSafeInteger(g.achievements_unlocked) && g.achievements_unlocked <= g.achievements_total, 'Invalid achievement counts.');
    requireValue(g.achievements.length <= 10000, 'Too many achievements in a game.');
    const names = new Set<string>();
    for (const a of g.achievements) {
      requireValue(a.api_name.length > 0 && a.api_name.length <= 512 && !names.has(a.api_name), 'Duplicate or invalid achievement ID.'); names.add(a.api_name);
      requireValue(a.global_completion_rate_pct == null || (a.global_completion_rate_pct >= 0 && a.global_completion_rate_pct <= 100), 'Invalid rarity percentage.');
    }
    achievements += g.achievements.length;
  }
  requireValue(achievements <= 500000, 'Too many achievements.');
  // Explicit field allowlists prevent unknown imported fields becoming backup secrets.
  const source = value as unknown as Record<string, unknown>;
  const result = pick(source, ['collected_at', 'steamid64']);
  result.player = pick(value.player as unknown as Record<string, unknown>, ['steamid64','persona_name','profile_url','real_name','country','account_created','last_logoff','visibility','avatar','steam_level','xp','badge_count']);
  if (record(value.player.bans)) (result.player as Record<string,unknown>).bans = pick(value.player.bans as unknown as Record<string,unknown>, ['vac_banned','vac_ban_count','community_banned','economy_ban','game_ban_count']);
  result.totals = pick(value.totals as unknown as Record<string,unknown>, ['owned_games','games_played','games_with_achievements','total_playtime_min','total_playtime_hours','total_achievements','total_achievements_unlocked']);
  result.games = value.games.map(g => ({ ...pick(g as unknown as Record<string,unknown>, ['appid','name','playtime_forever_min','playtime_forever_hours','playtime_2weeks_min','playtime_windows_min','playtime_mac_min','playtime_linux_min','last_played','has_achievements','achievements_total','achievements_unlocked','completion_rate_pct']), achievements: g.achievements.map(a => pick(a as unknown as Record<string,unknown>, ['api_name','name','description','unlocked','unlock_time','global_completion_rate_pct','icon','icon_gray'])) }));
  return result as unknown as SteamData;
}
export function validateDataset(value: unknown): Dataset {
  requireValue(record(value) && value.version === 1, 'Unsupported dataset version.');
  bounded(value, 0, 65536);
  requireValue(Number.isSafeInteger(value.revision) && (value.revision as number) >= 0 && Number.isSafeInteger(value.generation) && (value.generation as number) >= 0, 'Invalid storage revision.');
  const result = emptyDataset(); result.revision = value.revision as number; result.generation = value.generation as number;
  result.active = value.active === null ? null : validateSnapshot(value.active);
  requireValue(record(value.plans) && Object.keys(value.plans).length <= 100, 'Invalid profile plans.');
  for (const [sid, items] of Object.entries(value.plans)) { requireValue(steamId(sid), 'Invalid plan profile ID.'); result.plans[sid] = validatePlanItems(items); }
  requireValue(record(value.preferences), 'Invalid preferences.');
  const p = value.preferences;
  if (p.planPinned !== undefined) { requireValue(typeof p.planPinned === 'boolean', 'Invalid pinned preference.'); result.preferences.planPinned = p.planPinned; }
  for (const key of ['optimizerFloor','optimizerTarget'] as const) if (p[key] !== undefined) { requireValue(typeof p[key] === 'number' && p[key] >= 0 && p[key] <= 100, 'Invalid optimizer preference.'); result.preferences[key] = p[key]; }
  requireValue(record(value.freshness) && Object.keys(value.freshness).length <= 100, 'Invalid freshness metadata.');
  for (const [sid, games] of Object.entries(value.freshness)) {
    requireValue(steamId(sid) && record(games) && Object.keys(games).length <= 10000, 'Invalid freshness profile.'); result.freshness[sid] = {};
    for (const [appid, fields] of Object.entries(games)) { requireValue(/^[1-9]\d{0,9}$/.test(appid) && Number(appid) <= 2147483647 && record(fields), 'Invalid freshness game.'); const next: {progress?:string;schema?:string;rarity?:string;progressUnavailable?:string;noAchievementSchema?:string} = {}; for (const key of ['progress','schema','rarity','progressUnavailable','noAchievementSchema'] as const) if (fields[key] !== undefined) { requireValue(date(fields[key]), 'Invalid freshness date.'); next[key] = fields[key]; } result.freshness[sid][appid] = next; }
  }
  requireValue(value.refreshes === undefined || record(value.refreshes), 'Invalid refresh history.');
  for (const [sid, when] of Object.entries(value.refreshes ?? {})) { requireValue(steamId(sid) && date(when), 'Invalid refresh history.'); result.refreshes[sid] = when; }
  requireValue(value.checkpoint === null || record(value.checkpoint), 'Invalid import checkpoint.');
  result.checkpoint = value.checkpoint === null ? null : JSON.parse(JSON.stringify(value.checkpoint));
  return result;
}
export function serializeBackup(dataset: Dataset): string {
  const d = validateDataset(dataset);
  const text = JSON.stringify({ app: 'achievement-atlas-backup', version: 1, exportedAt: new Date().toISOString(), active: d.active, plans: d.plans, preferences: d.preferences, freshness: d.freshness }, null, 2);
  requireValue(new TextEncoder().encode(text).length <= MAX_BACKUP_BYTES, 'Backup exceeds the 50 MB limit.');
  return text;
}
export function parseBackup(text: string): Dataset {
  requireValue(new TextEncoder().encode(text).length <= MAX_BACKUP_BYTES, 'Backup exceeds the 50 MB limit.');
  const v: unknown = JSON.parse(text);
  requireValue(record(v) && v.app === 'achievement-atlas-backup', 'Not an Achievement Atlas combined backup.');
  requireValue(v.version === 1, 'Unsupported backup version. Update Atlas before restoring this file.');
  requireValue(date(v.exportedAt), 'Invalid backup export date.');
  return validateDataset({ ...emptyDataset(), active: v.active, plans: v.plans, preferences: v.preferences, freshness: v.freshness });
}

/** Explicit collector/legacy compatibility: older files omit embedded identity. */
export function validateLegacySnapshot(value: unknown): SteamData {
  if (!record(value) || !record(value.player)) throw new Error("Invalid legacy Steam library.");
  return validateSnapshot({ ...value, player: { ...value.player, steamid64: value.player.steamid64 ?? value.steamid64 } });
}
