import { createHmac, timingSafeEqual } from "node:crypto";
import type { SteamData, Game } from "../../types";
import type {
  BatchResponse,
  ImportOperation,
  ImportOperationKind,
  OperationSuccess,
  StartResponse,
} from "../import-types";

export const LIMITS = Object.freeze({
  requestBytes: 65_536,
  responseBytes: 2_097_152,
  tokenBytes: 48_000,
  maxGames: 5,
  maxAttempts: 20,
  timeoutMs: 8_000,
  deadlineMs: 25_000,
  concurrency: 3,
  tokenLifetimeMs: 30 * 60_000,
});
export interface ImportConfig {
  enabled: boolean;
  apiKey: string;
  signingSecret: string;
}
export interface Dependencies {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}
const defaults: Dependencies = {
  fetch: globalThis.fetch,
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
export class ImportFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryable = false,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string, status = 400): never => {
  throw new ImportFailure(code, message, status);
};
const object = (x: unknown): Record<string, any> => {
  if (!x || typeof x !== "object" || Array.isArray(x))
    fail("invalid_response", "Steam returned an invalid response.", 502);
  return x as Record<string, any>;
};
const string = (x: unknown, max = 4096): string => {
  if (typeof x !== "string" || x.length > max)
    fail("invalid_response", "Steam returned invalid text.", 502);
  return x as string;
};
const optionalString = (x: unknown, max = 4096) =>
  x == null ? null : string(x, max);
const number = (x: unknown): number => {
  if (typeof x !== "number" || !Number.isFinite(x) || x < 0)
    fail("invalid_response", "Steam returned an invalid number.", 502);
  return x as number;
};
const appid = (x: unknown): number => {
  const n = number(x);
  if (!Number.isSafeInteger(n) || !n || n > 0xffffffff)
    fail("invalid_request", "Invalid game ID.");
  return n;
};
const iso = (x: unknown): string | null => {
  if (!x) return null;
  const n = number(x);
  if (n > 253402300799)
    fail("invalid_response", "Invalid Steam timestamp.", 502);
  return new Date(n * 1000).toISOString();
};
const rows = (x: unknown): any[] => {
  if (!Array.isArray(x))
    fail("invalid_response", "Steam returned invalid achievement data.", 502);
  if ((x as any[]).length > 10_000)
    fail(
      "size_limit",
      "This game's achievement data exceeds the supported limit. Use the file collector instead.",
      413,
    );
  return x as any[];
};
function uniqueRows<T extends { api_name: string }>(values: T[]): T[] {
  if (
    new Set(values.map((v) => v.api_name)).size !== values.length ||
    values.some((v) => !v.api_name)
  )
    fail(
      "invalid_response",
      "Steam returned duplicate or missing achievement IDs.",
      502,
    );
  return values;
}
function ready(config: ImportConfig) {
  if (!config.enabled || !config.apiKey || config.signingSecret.length < 32)
    fail(
      "imports_disabled",
      "Live imports are not enabled. You can still import a JSON file.",
      503,
    );
}
async function boundedText(response: Response, limit: number) {
  if (Number(response.headers.get("content-length")) > limit)
    fail(
      "size_limit",
      "The data is too large. Use the file collector instead.",
      413,
    );
  if (!response.body) return "";
  const reader = response.body.getReader();
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        fail(
          "size_limit",
          "The data is too large. Use the file collector instead.",
          413,
        );
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts).toString("utf8");
}
class Invocation {
  attempts = 0;
  started: number;
  stopped = false;
  constructor(
    public config: ImportConfig,
    public deps: Dependencies,
  ) {
    this.started = deps.now();
  }
  async get(
    path: string,
    params: Record<string, string | number>,
  ): Promise<Record<string, any>> {
    if (this.attempts >= LIMITS.maxAttempts)
      throw new ImportFailure(
        "attempt_limit",
        "This batch reached its call limit. Resume to continue.",
        429,
        true,
      );
    // Check and reserve attempts synchronously before the first await. Workers
    // share this invocation, so these limits cannot race with another worker.
    if (
      this.deps.now() + LIMITS.timeoutMs + 1000 >
      this.started + LIMITS.deadlineMs
    )
      throw new ImportFailure(
        "deadline",
        "This batch paused before its time limit. Resume to continue.",
        503,
        true,
      );
    const url = new URL(`https://api.steampowered.com/${path}/`);
    url.searchParams.set("key", this.config.apiKey);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, String(value));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LIMITS.timeoutMs);
    this.attempts++;
    try {
      const response = await this.deps.fetch(url, {
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) {
        // Stop dispatch as soon as the status is known, before awaiting body
        // cleanup. Player-stat 403s need classification first: some are normal
        // private/no-stat responses rather than a batch-wide access failure.
        if (
          response.status === 429 ||
          response.status === 401 ||
          response.status >= 500 ||
          (response.status === 403 &&
            path !== "ISteamUserStats/GetPlayerAchievements/v1")
        )
          this.stopped = true;
        // Steam also uses HTTP errors for a game's unavailable/private stats.
        // Only recognize structured, known game errors; an HTML access denial or
        // unknown 403 must still pause rather than hide a real credential issue.
        if (
          path === "ISteamUserStats/GetPlayerAchievements/v1" &&
          [400, 403].includes(response.status)
        ) {
          const text = await boundedText(response, LIMITS.responseBytes);
          let payload: any;
          try {
            payload = JSON.parse(text);
          } catch {
            /* Non-JSON denials remain systemic. */
          }
          const stats = payload?.playerstats;
          if (
            stats?.success === false &&
            typeof stats.error === "string" &&
            /(?:no stats|profile is (?:not public|private)|private profile)/i.test(
              stats.error,
            )
          ) {
            const noAppStats = /^Requested app has no stats\.?$/i.test(
              stats.error.trim(),
            );
            throw new ImportFailure(
              noAppStats ? "no_stats" : "unavailable",
              noAppStats
                ? "Steam reports no achievement stats for this game. Previously saved values are retained."
                : "Achievements are private or unavailable for this game. Previously saved values are retained.",
              422,
              false,
            );
          }
        } else {
          // Release unused error bodies promptly without logging them.
          await response.body?.cancel().catch(() => {});
        }
        const raw = response.headers.get("retry-after");
        const seconds =
          raw && /^\d+$/.test(raw)
            ? Number(raw)
            : raw
              ? Math.max(
                  0,
                  Math.ceil((Date.parse(raw) - this.deps.now()) / 1000),
                )
              : undefined;
        const retryAfter =
          seconds !== undefined && Number.isFinite(seconds)
            ? Math.min(86_400, seconds)
            : undefined;
        if (response.status === 429)
          throw new ImportFailure(
            "rate_limited",
            "Steam is rate limiting requests. Wait, then resume manually.",
            429,
            true,
            retryAfter ?? 60,
          );
        if ([401, 403].includes(response.status)) {
          const step = path.includes("ResolveVanityURL")
            ? "resolving your profile link"
            : path.includes("GetOwnedGames")
              ? "checking your game library"
              : path.includes("GetPlayerSummaries")
                ? "checking your profile details"
                : path.includes("GetSchemaForGame")
                  ? "checking a game's achievement schema"
                  : path.includes("GetGlobalAchievementPercentagesForApp")
                    ? "checking a game's global achievement rarity"
                    : "checking a game's achievement progress";
          throw new ImportFailure(
            response.status === 401 ? "steam_auth" : "steam_access_denied",
            response.status === 401
              ? `Steam rejected authentication while ${step} (HTTP 401). Check the server API credentials before resuming.`
              : `Steam denied access while ${step} (HTTP 403). Try Resume later. If it repeats, check profile privacy and server API access. Your saved data is unchanged.`,
            502,
            true,
          );
        }
        if (response.status >= 500)
          throw new ImportFailure(
            "steam_unavailable",
            "Steam is temporarily unavailable. Resume when ready.",
            502,
            true,
          );
        throw new ImportFailure(
          "unsupported",
          "Steam could not provide this game’s data.",
          422,
          false,
        );
      }
      const text = await boundedText(response, LIMITS.responseBytes);
      try {
        return object(JSON.parse(text));
      } catch (error) {
        if (error instanceof ImportFailure) throw error;
        throw new ImportFailure(
          "invalid_response",
          "Steam returned invalid JSON.",
          502,
          true,
        );
      }
    } catch (error) {
      if (error instanceof ImportFailure) {
        if (error.retryable || error.status >= 500) this.stopped = true;
        throw error;
      }
      this.stopped = true;
      throw new ImportFailure(
        controller.signal.aborted ? "timeout" : "network",
        "The Steam request was interrupted. Resume to retry unresolved work.",
        502,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
interface Scope {
  v: 1;
  sid: string;
  ids: number[];
  exp: number;
}
function sign(scope: Scope, secret: string) {
  const body = Buffer.from(JSON.stringify(scope)).toString("base64url");
  const token = `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
  if (token.length > LIMITS.tokenBytes)
    fail(
      "size_limit",
      "This library is too large for live import. Use the file collector instead.",
      413,
    );
  return token;
}
function verify(token: unknown, secret: string, now: number): Scope {
  if (typeof token !== "string" || token.length > LIMITS.tokenBytes)
    fail(
      "invalid_permission",
      "Invalid import permission. Restart profile verification.",
      401,
    );
  const [body, signature, extra] = (token as string).split(".");
  if (
    !body ||
    !signature ||
    extra ||
    !/^[\w-]+$/.test(body) ||
    !/^[\w-]{43}$/.test(signature)
  )
    fail("invalid_permission", "Invalid import permission.", 401);
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    fail("invalid_permission", "Invalid import permission.", 401);
  let scope: Scope;
  try {
    scope = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return fail("invalid_permission", "Invalid import permission.", 401);
  }
  if (
    scope.v !== 1 ||
    !/^765\d{14}$/.test(scope.sid) ||
    !Array.isArray(scope.ids) ||
    !Number.isFinite(scope.exp) ||
    scope.exp <= now ||
    scope.exp > now + LIMITS.tokenLifetimeMs
  )
    fail(
      "expired_permission",
      "Import permission expired. Reverify the profile to continue.",
      401,
    );
  scope.ids.forEach(appid);
  return scope;
}
function parseProfile(value: unknown): { sid?: string; vanity?: string } {
  if (typeof value !== "string" || value.length > 256)
    return fail("invalid_profile", "Enter a Steam profile URL or SteamID64.");
  const input = value.trim();
  if (/^765\d{14}$/.test(input)) return { sid: input };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail(
      "invalid_profile",
      "Enter a full steamcommunity.com profile URL or SteamID64.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "steamcommunity.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return fail(
      "invalid_profile",
      "Use an HTTPS steamcommunity.com profile URL.",
    );
  const match = url.pathname.match(
    /^\/(id|profiles)\/([A-Za-z0-9_-]{1,100})\/?$/,
  );
  if (!match) return fail("invalid_profile", "Enter a Steam profile URL.");
  if (match[1] === "profiles") {
    if (!/^765\d{14}$/.test(match[2]))
      return fail("invalid_profile", "Invalid SteamID64.");
    return { sid: match[2] };
  }
  return { vanity: match[2] };
}
function ownedGame(value: unknown): Game {
  const g = object(value);
  const minutes = number(g.playtime_forever);
  return {
    appid: appid(g.appid),
    name: string(g.name, 512),
    playtime_forever_min: minutes,
    playtime_forever_hours: Math.round((minutes / 60) * 100) / 100,
    playtime_2weeks_min: number(g.playtime_2weeks ?? 0),
    playtime_windows_min: number(g.playtime_windows_forever ?? 0),
    playtime_mac_min: number(g.playtime_mac_forever ?? 0),
    playtime_linux_min: number(g.playtime_linux_forever ?? 0),
    last_played: iso(g.rtime_last_played),
    has_achievements: false,
    achievements_total: 0,
    achievements_unlocked: 0,
    completion_rate_pct: null,
    achievements: [],
  };
}
async function start(body: any, run: Invocation): Promise<StartResponse> {
  const profile = parseProfile(body.profile);
  let sid = profile.sid;
  if (!sid) {
    const result = object(
      (
        await run.get("ISteamUser/ResolveVanityURL/v1", {
          vanityurl: profile.vanity!,
        })
      ).response,
    );
    if (
      result.success !== 1 ||
      typeof result.steamid !== "string" ||
      !/^765\d{14}$/.test(result.steamid)
    )
      fail("profile_not_found", "Steam could not find that profile.", 404);
    sid = result.steamid;
  }
  const steamid = sid!;
  const owned = object(
    (
      await run.get("IPlayerService/GetOwnedGames/v1", {
        steamid,
        include_appinfo: 1,
        include_played_free_games: 1,
      })
    ).response,
  );
  // A private response is commonly {}; never interpret it as a genuinely empty library.
  if (
    !Number.isSafeInteger(owned.game_count) ||
    owned.game_count < 0 ||
    (owned.game_count > 0 && !Array.isArray(owned.games))
  )
    fail(
      "private_library",
      "Steam did not return a public library. Make Game details public or import a file.",
      422,
    );
  if (
    owned.game_count > 10_000 ||
    (Array.isArray(owned.games) && owned.games.length > 10_000)
  )
    fail(
      "size_limit",
      "This library exceeds the supported game limit. Use the file collector instead.",
      413,
    );
  const games = (owned.games ?? []).map(ownedGame) as Game[];
  if (
    games.length !== owned.game_count ||
    new Set(games.map((g) => g.appid)).size !== games.length
  )
    fail(
      "invalid_response",
      "Steam returned an incomplete library. Your saved data has not changed.",
      502,
    );
  const summary = object(
    (await run.get("ISteamUser/GetPlayerSummaries/v2", { steamids: steamid }))
      .response,
  );
  const player = Array.isArray(summary.players)
    ? summary.players.find((p: any) => p?.steamid === steamid)
    : null;
  if (!player)
    fail(
      "invalid_response",
      "Steam did not return the requested profile.",
      502,
    );
  const totalMinutes = games.reduce(
    (sum, g) => sum + g.playtime_forever_min,
    0,
  );
  const data: SteamData = {
    collected_at: new Date(run.deps.now()).toISOString(),
    steamid64: steamid,
    player: {
      steamid64: steamid,
      persona_name: optionalString(player.personaname, 512),
      profile_url: optionalString(player.profileurl),
      real_name: null,
      country: null,
      account_created: iso(player.timecreated),
      last_logoff: iso(player.lastlogoff),
      visibility:
        player.communityvisibilitystate === 3 ? "public" : "private_or_friends",
      avatar: optionalString(player.avatarfull),
      steam_level: null,
      xp: null,
      badge_count: null,
      bans: {
        vac_banned: null,
        vac_ban_count: null,
        community_banned: null,
        economy_ban: null,
        game_ban_count: null,
      },
    },
    totals: {
      owned_games: games.length,
      games_played: games.filter((g) => g.playtime_forever_min > 0).length,
      games_with_achievements: 0,
      total_playtime_min: totalMinutes,
      total_playtime_hours: Math.round((totalMinutes / 60) * 100) / 100,
      total_achievements: 0,
      total_achievements_unlocked: 0,
    },
    games,
  };
  const exp = run.deps.now() + LIMITS.tokenLifetimeMs;
  return {
    ok: true,
    data,
    token: sign(
      { v: 1, sid: steamid, ids: games.map((g) => g.appid), exp },
      run.config.signingSecret,
    ),
    expiresAt: new Date(exp).toISOString(),
    attempts: run.attempts,
  };
}
async function operation(
  op: ImportOperation,
  sid: string,
  run: Invocation,
): Promise<OperationSuccess> {
  if (op.kind === "progress") {
    const stats = object(
      (
        await run.get("ISteamUserStats/GetPlayerAchievements/v1", {
          steamid: sid,
          appid: op.appid,
          l: "english",
        })
      ).playerstats,
    );
    if (stats.success === false)
      throw new ImportFailure(
        "unavailable",
        "Achievements are private or unavailable for this game.",
        422,
        false,
      );
    if (stats.success !== true)
      fail(
        "invalid_response",
        "Steam returned invalid achievement progress.",
        502,
      );
    return {
      ...op,
      status: "success",
      data: uniqueRows(
        rows(stats.achievements).map((a) => {
          object(a);
          if (a.achieved !== 0 && a.achieved !== 1)
            fail("invalid_response", "Invalid achievement state.", 502);
          return {
            api_name: string(a.apiname, 256),
            name: string(a.name ?? a.apiname, 512),
            description: optionalString(a.description),
            unlocked: a.achieved === 1,
            unlock_time: iso(a.unlocktime),
          };
        }),
      ),
    };
  }
  if (op.kind === "schema") {
    const game = object(
      (
        await run.get("ISteamUserStats/GetSchemaForGame/v2", {
          appid: op.appid,
          l: "english",
        })
      ).game,
    );
    // Omitted stats/achievements are Steam's normal no-achievement response.
    // Present but malformed values are not evidence that achievements are absent.
    const stats =
      game.availableGameStats === undefined
        ? undefined
        : object(game.availableGameStats);
    const achievements =
      stats?.achievements === undefined ? undefined : rows(stats.achievements);
    if (!achievements?.length)
      throw new ImportFailure(
        "no_achievement_schema",
        "Steam returned no achievement schema for this game. Previously saved values are retained.",
        422,
        false,
      );
    return {
      ...op,
      status: "success",
      data: uniqueRows(
        achievements.map((a) => {
          object(a);
          return {
            api_name: string(a.name, 256),
            name: string(a.displayName ?? a.name, 512),
            description: optionalString(a.description),
            icon: optionalString(a.icon),
            icon_gray: optionalString(a.icongray),
          };
        }),
      ),
    };
  }
  const global = object(
    (
      await run.get(
        "ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2",
        { gameid: op.appid },
      )
    ).achievementpercentages,
  );
  return {
    ...op,
    status: "success",
    data: uniqueRows(
      rows(global.achievements).map((a) => {
        object(a);
        const percent = number(
          typeof a.percent === "string" && a.percent.trim()
            ? Number(a.percent)
            : a.percent,
        );
        if (percent > 100)
          fail("invalid_response", "Invalid achievement rarity.", 502);
        return {
          api_name: string(a.name, 256),
          global_completion_rate_pct: percent,
        };
      }),
    ),
  };
}
async function batch(body: any, run: Invocation): Promise<BatchResponse> {
  const scope = verify(body.token, run.config.signingSecret, run.deps.now());
  if (
    !Array.isArray(body.operations) ||
    !body.operations.length ||
    body.operations.length > 15
  )
    fail("invalid_request", "Request between one and fifteen operations.");
  const allowed = new Set(scope.ids);
  const seen = new Set<string>();
  const operations: ImportOperation[] = [];
  for (const value of body.operations) {
    if (!value || typeof value !== "object")
      fail("invalid_request", "Invalid operation.");
    const id = appid(value.appid);
    if (
      !allowed.has(id) ||
      !["progress", "schema", "rarity"].includes(value.kind)
    )
      fail(
        "invalid_request",
        "The game or operation is outside this import permission.",
      );
    const key = `${id}:${value.kind}`;
    if (!seen.has(key))
      operations.push({ appid: id, kind: value.kind as ImportOperationKind });
    seen.add(key);
  }
  if (new Set(operations.map((o) => o.appid)).size > LIMITS.maxGames)
    fail("invalid_request", "A batch can contain at most five games.");
  const response: BatchResponse = {
    ok: true,
    results: [],
    attempts: 0,
    paused: false,
  };
  // Enforce the dependency at the server boundary too: clients or resumed
  // checkpoints may submit progress/rarity before a pending schema check.
  // Move each schema to its game's first operation without moving other games.
  const scheduledSchemas = new Set<number>();
  const ordered = operations.flatMap((op) => {
    const schema = operations.find(
      (candidate) =>
        candidate.appid === op.appid && candidate.kind === "schema",
    );
    if (!schema) return [op];
    if (!scheduledSchemas.has(op.appid)) {
      scheduledSchemas.add(op.appid);
      return op.kind === "schema" ? [op] : [schema, op];
    }
    return op.kind === "schema" ? [] : [op];
  });
  const games = [...new Set(ordered.map((op) => op.appid))];
  let nextGame = 0;
  const noSchema = new Set<number>();
  async function worker() {
    while (!run.stopped && nextGame < games.length) {
      const id = games[nextGame++];
      for (const op of ordered.filter((op) => op.appid === id)) {
        if (run.stopped) break;
        // Confirmed absent schema makes both player progress and rarity unnecessary.
        // Missing player progress alone cannot establish this for an unplayed game.
        if (noSchema.has(op.appid) && op.kind !== "schema") {
          response.results.push({
            ...op,
            status: "error",
            code: "unavailable",
            retryable: false,
            message:
              "Skipped achievement checks because this game has no achievement schema. Previously saved values are retained.",
          });
          continue;
        }
        try {
          const result = await operation(op, scope.sid, run);
          if (
            Buffer.byteLength(
              JSON.stringify({
                ...response,
                results: [...response.results, result],
              }),
            ) >
            LIMITS.responseBytes - 4096
          ) {
            response.results.push({
              ...op,
              status: "error",
              code: "size_limit",
              message:
                "This result exceeds the batch size limit. Use the file collector.",
              retryable: false,
            });
            response.paused = true;
            run.stopped = true;
            break;
          }
          response.results.push(result);
        } catch (error) {
          const failure =
            error instanceof ImportFailure
              ? error
              : new ImportFailure(
                  "invalid_response",
                  "Steam returned invalid data.",
                  502,
                  true,
                );
          if (failure.code === "no_achievement_schema") noSchema.add(op.appid);
          response.results.push({
            ...op,
            status: "error",
            code: failure.code,
            message: failure.message,
            retryable: failure.retryable || failure.status >= 500,
          });
          if (failure.retryable || failure.status >= 500) {
            response.paused = true;
            run.stopped = true;
            if (failure.retryAfterSeconds !== undefined)
              response.retryAfterSeconds = Math.max(
                response.retryAfterSeconds ?? 0,
                failure.retryAfterSeconds,
              );
            break;
          }
        }
      }
    }
  }
  // One worker per game preserves schema dependencies. Already dispatched calls
  // settle after a pause so their successful results and costs are not lost.
  await Promise.all(
    Array.from({ length: Math.min(LIMITS.concurrency, games.length) }, () =>
      worker(),
    ),
  );
  const order = new Map(
    ordered.map((op, index) => [`${op.appid}:${op.kind}`, index]),
  );
  response.results.sort(
    (a, b) =>
      order.get(`${a.appid}:${a.kind}`)! - order.get(`${b.appid}:${b.kind}`)!,
  );
  response.attempts = run.attempts;
  return response;
}
export function capabilities(config: ImportConfig) {
  return {
    enabled:
      config.enabled && !!config.apiKey && config.signingSecret.length >= 32,
    limits: LIMITS,
  };
}
export async function handleImport(
  request: Request,
  kind: "start" | "batch",
  config: ImportConfig,
  injected: Partial<Dependencies> = {},
): Promise<Response> {
  const run = new Invocation(config, { ...defaults, ...injected });
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  try {
    ready(config);
    if (request.method !== "POST") fail("method_not_allowed", "Use POST.", 405);
    if (request.headers.get("origin") !== new URL(request.url).origin)
      fail("invalid_origin", "This request must come from this site.", 403);
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      fail("invalid_content_type", "Send application/json.", 415);
    const raw = await boundedText(
      new Response(request.body, { headers: request.headers }),
      LIMITS.requestBytes,
    );
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail("invalid_json", "Invalid JSON request.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      fail("invalid_request", "Invalid request body.");
    const value =
      kind === "start" ? await start(body, run) : await batch(body, run);
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded) > LIMITS.responseBytes)
      fail(
        "size_limit",
        "The library is too large. Use the file collector instead.",
        413,
      );
    return new Response(encoded, { status: 200, headers });
  } catch (error) {
    const failure =
      error instanceof ImportFailure
        ? error
        : new ImportFailure(
            "internal_error",
            "Import could not complete. Your saved data has not changed.",
            500,
            true,
          );
    return new Response(
      JSON.stringify({
        ok: false,
        code: failure.code,
        message: failure.message,
        attempts: run.attempts,
        ...(failure.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: failure.retryAfterSeconds }
          : {}),
      }),
      {
        status: failure.status,
        headers: {
          ...headers,
          ...(failure.retryAfterSeconds !== undefined
            ? { "retry-after": String(failure.retryAfterSeconds) }
            : {}),
        },
      },
    );
  }
}
