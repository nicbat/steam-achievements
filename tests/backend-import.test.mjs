import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/lib/server/steam-import.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const { handleImport, LIMITS, capabilities } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const config = {
  enabled: true,
  apiKey: "test-key-not-real",
  signingSecret: "test-secret-never-real-1234567890123456789",
};
const sid = "76561198000000000";
const game = (id = 10) => ({
  appid: id,
  name: `Game ${id}`,
  playtime_forever: 60,
});
function request(body, options = {}) {
  return new Request("https://atlas.test/api/steam/start", {
    method: "POST",
    headers: {
      origin: "https://atlas.test",
      "content-type": "application/json",
      ...options.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function mock(overrides = {}) {
  let now = 1_800_000_000_000;
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const deps = {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    fetch: async (url, options) => {
      active++;
      maxActive = Math.max(active, maxActive);
      calls.push({
        path: url.pathname,
        params: Object.fromEntries(url.searchParams),
        time: now,
      });
      try {
        const custom = overrides[url.pathname];
        if (custom) return await custom(url, options);
        if (url.pathname.includes("ResolveVanityURL"))
          return Response.json({ response: { success: 1, steamid: sid } });
        if (url.pathname.includes("GetOwnedGames"))
          return Response.json({
            response: {
              game_count: 6,
              games: [10, 20, 30, 40, 50, 60].map(game),
            },
          });
        if (url.pathname.includes("GetPlayerSummaries"))
          return Response.json({
            response: {
              players: [
                {
                  steamid: sid,
                  personaname: "Sample",
                  communityvisibilitystate: 3,
                },
              ],
            },
          });
        if (url.pathname.includes("GetPlayerAchievements"))
          return Response.json({
            playerstats: {
              success: true,
              achievements: [{ apiname: "A", achieved: 1, unlocktime: 100 }],
            },
          });
        if (url.pathname.includes("GetSchemaForGame"))
          return Response.json({
            game: {
              availableGameStats: {
                achievements: [{ name: "A", displayName: "A" }],
              },
            },
          });
        if (url.pathname.includes("GetGlobalAchievement"))
          return Response.json({
            achievementpercentages: {
              achievements: [{ name: "A", percent: "12.4" }],
            },
          });
        throw new Error("Unexpected URL");
      } finally {
        active--;
      }
    },
  };
  return {
    deps,
    calls,
    maxActive: () => maxActive,
    advance: (ms) => {
      now += ms;
    },
  };
}
async function start(m = mock(), profile = sid) {
  const response = await handleImport(
    request({ profile }),
    "start",
    config,
    m.deps,
  );
  assert.equal(response.status, 200);
  return { m, value: await response.json() };
}
async function batch(value, m, operations) {
  const response = await handleImport(
    request({ token: value.token, operations }),
    "batch",
    config,
    m.deps,
  );
  return { status: response.status, value: await response.json() };
}
test("disabled imports and capabilities make zero upstream requests", async () => {
  const m = mock();
  assert.equal(capabilities({ ...config, enabled: false }).enabled, false);
  const r = await handleImport(
    request({ profile: sid }),
    "start",
    { ...config, enabled: false },
    m.deps,
  );
  assert.equal(r.status, 503);
  assert.equal(m.calls.length, 0);
});
test("start maps authoritative public games and uses only required endpoints", async () => {
  const { m, value } = await start(
    mock(),
    "https://steamcommunity.com/id/sample",
  );
  assert.equal(value.attempts, 3);
  assert.equal(value.data.games.length, 6);
  assert.equal(value.data.player.steam_level, null);
  assert.equal(value.data.totals.total_playtime_min, 360);
  assert.equal(m.maxActive(), 1);
  assert.ok(m.calls.every((c) => c.time === m.calls[0].time));
});
test("private library never becomes empty; explicit empty library is accepted", async () => {
  const m = mock({
    "/IPlayerService/GetOwnedGames/v1/": () => Response.json({ response: {} }),
  });
  const r = await handleImport(
    request({ profile: sid }),
    "start",
    config,
    m.deps,
  );
  assert.equal(r.status, 422);
  assert.equal((await r.json()).code, "private_library");
  assert.equal(m.calls.length, 1);
  const empty = mock({
    "/IPlayerService/GetOwnedGames/v1/": () =>
      Response.json({ response: { game_count: 0 } }),
  });
  assert.equal((await start(empty)).value.data.games.length, 0);
});
test("wrong origin/content type, oversized JSON, bad profile make zero calls", async () => {
  for (const req of [
    request({ profile: sid }, { headers: { origin: "https://evil.test" } }),
    request({ profile: sid }, { headers: { "content-type": "text/plain" } }),
    request("x".repeat(LIMITS.requestBytes + 1)),
    request({ profile: "https://evil.test/profiles/" + sid }),
    request("{"),
  ]) {
    const m = mock();
    const r = await handleImport(req, "start", config, m.deps);
    assert.ok(r.status >= 400);
    assert.equal(m.calls.length, 0);
  }
});
test("tampered expired and out-of-scope permissions make no calls", async () => {
  const { m, value } = await start();
  const before = m.calls.length;
  for (const payload of [
    { token: value.token + "x", operations: [{ appid: 10, kind: "progress" }] },
    { token: value.token, operations: [{ appid: 999, kind: "progress" }] },
    { token: value.token, operations: [{ appid: 10, kind: "arbitrary" }] },
  ]) {
    const r = await handleImport(request(payload), "batch", config, m.deps);
    assert.ok(r.status >= 400);
  }
  m.advance(LIMITS.tokenLifetimeMs + 1);
  assert.equal(
    (await batch(value, m, [{ appid: 10, kind: "progress" }])).status,
    401,
  );
  assert.equal(m.calls.length, before);
});
test("batch deduplicates operations, preserves partial data and stops immediately on 429", async () => {
  const m = mock({
    "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/": () =>
      new Response("", { status: 429, headers: { "retry-after": "120" } }),
  });
  const { value } = await start(m);
  const r = await batch(value, m, [
    { appid: 10, kind: "progress" },
    { appid: 10, kind: "progress" },
    { appid: 10, kind: "rarity" },
    { appid: 20, kind: "schema" },
  ]);
  assert.equal(r.value.attempts, 3);
  assert.equal(r.value.results.length, 3);
  assert.equal(r.value.results[0].status, "success");
  assert.equal(r.value.paused, true);
  assert.equal(r.value.retryAfterSeconds, 120);
});
test("five game limit and operation limit reject without upstream calls", async () => {
  const { m, value } = await start();
  const count = m.calls.length;
  assert.equal(
    (
      await batch(
        value,
        m,
        [10, 20, 30, 40, 50, 60].map((appid) => ({ appid, kind: "progress" })),
      )
    ).status,
    400,
  );
  assert.equal(
    (await batch(value, m, Array(16).fill({ appid: 10, kind: "progress" })))
      .status,
    400,
  );
  assert.equal(m.calls.length, count);
});
test("fifteen operations are bounded, counted, and normalized", async () => {
  const { m, value } = await start();
  const r = await batch(
    value,
    m,
    [10, 20, 30, 40, 50].flatMap((appid) =>
      ["progress", "schema", "rarity"].map((kind) => ({ appid, kind })),
    ),
  );
  assert.equal(r.value.attempts, 15);
  assert.equal(r.value.results.length, 15);
  assert.equal(r.value.results[2].data[0].global_completion_rate_pct, 12.4);
  assert.ok(m.maxActive() <= LIMITS.concurrency);
  const calls = m.calls.slice(2);
  assert.ok(calls.every((c) => c.time === calls[0].time));
});
test("transport failure and 5xx have no automatic retries", async () => {
  for (const fn of [
    () => {
      throw new Error("secret URL must not leak");
    },
    () => new Response("", { status: 503 }),
  ]) {
    const m = mock({ "/ISteamUserStats/GetPlayerAchievements/v1/": fn });
    const { value } = await start(m);
    const r = await batch(value, m, [
      { appid: 10, kind: "progress" },
      { appid: 20, kind: "progress" },
    ]);
    assert.equal(r.value.attempts, 2);
    assert.equal(r.value.paused, true);
    assert.equal(r.value.results.length, 2);
    assert.ok(!JSON.stringify(r.value).includes("secret URL"));
  }
});
test("deadline returns partial work without starting a request that cannot fit", async () => {
  let m;
  m = mock({
    "/ISteamUserStats/GetPlayerAchievements/v1/": () => {
      m.advance(8000);
      return Response.json({
        playerstats: { success: true, achievements: [] },
      });
    },
  });
  const { value } = await start(m);
  const r = await batch(
    value,
    m,
    [10, 20, 30, 40].map((appid) => ({ appid, kind: "progress" })),
  );
  assert.equal(r.value.attempts, 3);
  assert.equal(r.value.paused, true);
  assert.equal(r.value.results.at(-1).code, "deadline");
});
test("oversized upstream response and malformed achievement state never become successful data", async () => {
  for (const fn of [
    () => new Response("x".repeat(LIMITS.responseBytes + 1)),
    () =>
      Response.json({
        playerstats: {
          success: true,
          achievements: [{ apiname: "A", achieved: "yes" }],
        },
      }),
  ]) {
    const m = mock({ "/ISteamUserStats/GetPlayerAchievements/v1/": fn });
    const { value } = await start(m);
    const r = await batch(value, m, [{ appid: 10, kind: "progress" }]);
    assert.equal(r.value.results[0].status, "error");
    assert.equal(r.value.attempts, 1);
  }
});
test("upstream timeout aborts once and stops the batch without automatic retry", async () => {
  const m = mock({
    "/ISteamUserStats/GetPlayerAchievements/v1/": (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        ),
      ),
  });
  const { value } = await start(m);
  const r = await batch(value, m, [
    { appid: 10, kind: "progress" },
    { appid: 20, kind: "progress" },
  ]);
  assert.equal(r.value.attempts, 2);
  assert.equal(r.value.results[0].code, "timeout");
  assert.equal(r.value.paused, true);
});
test("oversized scoped permission fails clearly rather than truncating the authoritative library", async () => {
  const m = mock({
    "/IPlayerService/GetOwnedGames/v1/": () =>
      Response.json({
        response: {
          game_count: 10000,
          games: Array.from({ length: 10000 }, (_, i) => game(i + 1)),
        },
      }),
  });
  const r = await handleImport(
    request({ profile: sid }),
    "start",
    config,
    m.deps,
  );
  assert.equal(r.status, 413);
  assert.equal((await r.json()).code, "size_limit");
  assert.equal(m.calls.length, 2);
});
test("a corrupt game count does not produce a replacement snapshot", async () => {
  const m = mock({
    "/IPlayerService/GetOwnedGames/v1/": () =>
      Response.json({ response: { game_count: 2, games: [game()] } }),
  });
  const r = await handleImport(
    request({ profile: sid }),
    "start",
    config,
    m.deps,
  );
  assert.equal(r.status, 502);
  assert.equal((await r.json()).code, "invalid_response");
  assert.equal(m.calls.length, 1);
});
test("aggregate response limit preserves earlier successes and returns a bounded size error", async () => {
  const m = mock({
    "/ISteamUserStats/GetSchemaForGame/v2/": () =>
      Response.json({
        game: {
          availableGameStats: {
            achievements: Array.from({ length: 4000 }, (_, i) => ({
              name: `A${i}`,
              displayName: `Achievement ${i}`,
              description: "x".repeat(350),
            })),
          },
        },
      }),
  });
  const { value } = await start(m);
  const r = await batch(
    value,
    m,
    [10, 20, 30].map((appid) => ({ appid, kind: "schema" })),
  );
  assert.equal(r.value.attempts, 3);
  assert.equal(r.value.results[0].status, "success");
  assert.equal(r.value.results[1].code, "size_limit");
  assert.equal(r.value.paused, true);
  assert.ok(Buffer.byteLength(JSON.stringify(r.value)) <= LIMITS.responseBytes);
});

test("setup access denials identify the failed stage without asserting a broken key", async () => {
  for (const [path, stage, attempts] of [
    ["/IPlayerService/GetOwnedGames/v1/", "checking your game library", 1],
    ["/ISteamUser/GetPlayerSummaries/v2/", "checking your profile details", 2],
  ]) {
    const m = mock({
      [path]: () => new Response("Forbidden", { status: 403 }),
    });
    const response = await handleImport(
      request({ profile: sid }),
      "start",
      config,
      m.deps,
    );
    const result = await response.json();
    assert.equal(response.status, 502);
    assert.equal(result.code, "steam_access_denied");
    assert.ok(result.message.includes(stage));
    assert.match(result.message, /Try Resume later/);
    assert.equal(result.attempts, attempts);
    assert.equal(m.calls.length, attempts, "no retry or later setup call");
    assert.ok(!JSON.stringify(result).includes(config.apiKey));
  }
});

test("known structured game-level 403 is terminal for that operation and other games continue", async () => {
  const m = mock({
    "/ISteamUserStats/GetPlayerAchievements/v1/": (url) =>
      url.searchParams.get("appid") === "10"
        ? Response.json(
            { playerstats: { success: false, error: "Profile is not public" } },
            { status: 403 },
          )
        : Response.json({ playerstats: { success: true, achievements: [] } }),
  });
  const { value } = await start(m);
  const r = await batch(value, m, [
    { appid: 10, kind: "progress" },
    { appid: 20, kind: "progress" },
  ]);
  assert.equal(r.value.attempts, 2);
  assert.equal(r.value.paused, false);
  assert.equal(r.value.results[0].code, "unavailable");
  assert.equal(r.value.results[0].retryable, false);
  assert.equal(r.value.results[1].status, "success");
});

test("unknown game-level 403 and 401 still stop immediately without masking credential failures", async () => {
  for (const status of [401, 403]) {
    const m = mock({
      "/ISteamUserStats/GetPlayerAchievements/v1/": () =>
        new Response("Access denied", { status }),
    });
    const { value } = await start(m);
    const r = await batch(value, m, [
      { appid: 10, kind: "progress" },
      { appid: 20, kind: "progress" },
    ]);
    assert.equal(r.value.attempts, 2);
    assert.equal(r.value.paused, true);
    assert.equal(
      r.value.results[0].code,
      status === 401 ? "steam_auth" : "steam_access_denied",
    );
    assert.equal(r.value.results[0].retryable, true);
  }
});

test("unavailable player progress does not suppress potentially valid achievement metadata", async () => {
  const m = mock({
    "/ISteamUserStats/GetPlayerAchievements/v1/": (url) =>
      url.searchParams.get("appid") === "10"
        ? Response.json(
            {
              playerstats: {
                success: false,
                error: "Requested app has no stats",
              },
            },
            { status: 400 },
          )
        : Response.json({ playerstats: { success: true, achievements: [] } }),
  });
  const { value } = await start(m);
  const r = await batch(value, m, [
    { appid: 10, kind: "progress" },
    { appid: 10, kind: "schema" },
    { appid: 10, kind: "rarity" },
    { appid: 20, kind: "progress" },
  ]);
  assert.equal(
    r.value.attempts,
    4,
    "player stats do not determine whether the game has achievements",
  );
  assert.equal(r.value.paused, false);
  assert.equal(r.value.results.length, 4);
  assert.equal(r.value.results[0].kind, "schema");
  assert.equal(r.value.results[0].status, "success");
  assert.equal(r.value.results[1].code, "no_stats");
  assert.equal(r.value.results[2].status, "success");
  assert.equal(r.value.results[3].status, "success");
  assert.equal(
    m.calls.slice(2).filter((c) => /Schema|GlobalAchievement/.test(c.path))
      .length,
    2,
  );
});

test("a successful schema response with no achievement schema prevents its subsequent rarity request", async () => {
  const m = mock({
    "/ISteamUserStats/GetSchemaForGame/v2/": () =>
      Response.json({ game: { gameName: "No achievement game" } }),
  });
  const { value } = await start(m);
  const r = await batch(value, m, [
    { appid: 10, kind: "schema" },
    { appid: 10, kind: "rarity" },
  ]);
  assert.equal(r.value.attempts, 1);
  assert.equal(r.value.paused, false);
  assert.equal(r.value.results[0].code, "no_achievement_schema");
  assert.equal(r.value.results[1].code, "unavailable");
  assert.equal(r.value.results[1].retryable, false);
});

test("an unexplained rarity 403 still stops immediately without silently skipping the game", async () => {
  const m = mock({
    "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/": () =>
      Response.json({ error: "Forbidden" }, { status: 403 }),
  });
  const { value } = await start(m);
  const r = await batch(value, m, [
    { appid: 10, kind: "rarity" },
    { appid: 20, kind: "progress" },
  ]);
  assert.equal(r.value.attempts, 2);
  assert.equal(r.value.paused, true);
  assert.equal(r.value.results[0].code, "steam_access_denied");
  assert.match(r.value.results[0].message, /global achievement rarity/);
  assert.equal(r.value.results[0].retryable, true);
});

test("empty authoritative achievement schema skips rarity without blocking a later game", async () => {
  const m = mock({
    "/ISteamUserStats/GetSchemaForGame/v2/": () =>
      Response.json({
        game: {
          gameName: "No achievements",
          availableGameStats: { achievements: [] },
        },
      }),
  });
  const { value } = await start(m);
  const r = await batch(value, m, [
    { appid: 10, kind: "schema" },
    { appid: 10, kind: "rarity" },
    { appid: 20, kind: "progress" },
  ]);
  assert.equal(r.value.attempts, 2);
  assert.equal(r.value.paused, false);
  assert.equal(r.value.results[0].code, "no_achievement_schema");
  assert.equal(
    r.value.results[0].data,
    undefined,
    "absence must preserve prior achievements",
  );
  assert.equal(r.value.results[1].code, "unavailable");
  assert.equal(r.value.results[1].retryable, false);
  assert.equal(r.value.results[2].status, "success");
  assert.equal(
    m.calls.some((c) => c.path.includes("GetGlobalAchievement")),
    false,
  );
});

test("schema is checked first even for reordered requests and skips all unsupported game calls", async () => {
  for (const game of [
    { gameName: "No achievements" },
    { availableGameStats: { stats: [{ name: "wins" }] } },
    { availableGameStats: { achievements: [] } },
  ]) {
    const m = mock({
      "/ISteamUserStats/GetSchemaForGame/v2/": () => Response.json({ game }),
      "/ISteamUserStats/GetPlayerAchievements/v1/": () => {
        throw new Error("No progress call should be made for unsupported game");
      },
      "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/": () => {
        throw new Error("No rarity call should be made for unsupported game");
      },
    });
    const { value } = await start(m);
    const r = await batch(value, m, [
      { appid: 10, kind: "rarity" },
      { appid: 10, kind: "progress" },
      { appid: 10, kind: "schema" },
    ]);
    assert.equal(r.value.attempts, 1);
    assert.equal(r.value.paused, false);
    assert.deepEqual(
      r.value.results.map((result) => [result.kind, result.code]),
      [
        ["schema", "no_achievement_schema"],
        ["rarity", "unavailable"],
        ["progress", "unavailable"],
      ],
    );
    assert.ok(
      r.value.results.every(
        (result) => result.retryable === false && !result.data,
      ),
    );
    assert.equal(
      m.calls.length,
      3,
      "two setup calls plus one schema call only",
    );
  }
});

test("malformed schema does not establish absent achievements or allow further calls", async () => {
  for (const game of [
    null,
    [],
    { availableGameStats: null },
    { availableGameStats: false },
    { availableGameStats: [] },
    { availableGameStats: { achievements: null } },
    { availableGameStats: { achievements: {} } },
    { availableGameStats: { achievements: "" } },
    { availableGameStats: { achievements: [null] } },
    { availableGameStats: { achievements: [{ name: "" }] } },
  ]) {
    const m = mock({
      "/ISteamUserStats/GetSchemaForGame/v2/": () => Response.json({ game }),
    });
    const { value } = await start(m);
    const r = await batch(value, m, [
      { appid: 10, kind: "progress" },
      { appid: 10, kind: "schema" },
      { appid: 10, kind: "rarity" },
      { appid: 20, kind: "progress" },
    ]);
    assert.equal(r.value.attempts, 2);
    assert.equal(r.value.paused, true);
    assert.equal(r.value.results.length, 2);
    assert.equal(r.value.results[0].kind, "schema");
    assert.equal(r.value.results[0].code, "invalid_response");
    assert.equal(r.value.results[0].retryable, true);
  }
});

test("schema authentication, unknown access denial and rate limits stop before dependent calls", async () => {
  for (const [status, code] of [
    [401, "steam_auth"],
    [403, "steam_access_denied"],
    [429, "rate_limited"],
  ]) {
    const m = mock({
      "/ISteamUserStats/GetSchemaForGame/v2/": () =>
        new Response("Denied", { status }),
    });
    const { value } = await start(m);
    const r = await batch(value, m, [
      { appid: 10, kind: "rarity" },
      { appid: 10, kind: "progress" },
      { appid: 10, kind: "schema" },
      { appid: 20, kind: "progress" },
    ]);
    assert.equal(r.value.attempts, 2);
    assert.equal(r.value.paused, true);
    assert.equal(r.value.results.length, 2);
    assert.equal(r.value.results[0].code, code);
    assert.equal(r.value.results[0].retryable, true);
  }
});

test("malformed successful progress pauses instead of silently completing unavailable work", async () => {
  for (const playerstats of [
    {},
    { success: "true", achievements: [] },
    { success: true },
    { success: true, achievements: null },
    { success: true, achievements: {} },
  ]) {
    const m = mock({
      "/ISteamUserStats/GetPlayerAchievements/v1/": () =>
        Response.json({ playerstats }),
    });
    const { value } = await start(m);
    const r = await batch(value, m, [
      { appid: 10, kind: "progress" },
      { appid: 20, kind: "progress" },
    ]);
    assert.equal(r.value.attempts, 2);
    assert.equal(r.value.paused, true);
    assert.equal(r.value.results.length, 2);
    assert.equal(r.value.results[0].code, "invalid_response");
    assert.equal(r.value.results[0].retryable, true);
  }
});

test("libraries beyond the browser's supported game limit stop before fetching a summary", async () => {
  const m = mock({
    "/IPlayerService/GetOwnedGames/v1/": () =>
      Response.json({
        response: {
          game_count: 10001,
          games: Array.from({ length: 10001 }, (_, i) => game(i + 1)),
        },
      }),
  });
  const response = await handleImport(
    request({ profile: sid }),
    "start",
    config,
    m.deps,
  );
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "size_limit");
  assert.equal(m.calls.length, 1);
});

test("achievement row limits match browser validation without retrying oversized operations", async () => {
  for (const [kind, path, payload] of [
    [
      "schema",
      "/ISteamUserStats/GetSchemaForGame/v2/",
      {
        game: {
          availableGameStats: {
            achievements: Array.from({ length: 10001 }, (_, i) => ({
              name: `A${i}`,
            })),
          },
        },
      },
    ],
    [
      "progress",
      "/ISteamUserStats/GetPlayerAchievements/v1/",
      {
        playerstats: {
          success: true,
          achievements: Array.from({ length: 10001 }, (_, i) => ({
            apiname: `A${i}`,
            achieved: 0,
          })),
        },
      },
    ],
    [
      "rarity",
      "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/",
      {
        achievementpercentages: {
          achievements: Array.from({ length: 10001 }, (_, i) => ({
            name: `A${i}`,
            percent: 1,
          })),
        },
      },
    ],
  ]) {
    const m = mock({ [path]: () => Response.json(payload) });
    const { value } = await start(m);
    const r = await batch(value, m, [{ appid: 10, kind }]);
    assert.equal(r.value.attempts, 1);
    assert.equal(r.value.results[0].code, "size_limit");
    assert.equal(r.value.results[0].retryable, false);
    assert.equal(r.value.results[0].data, undefined);
  }
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const flushWorkers = () => new Promise((resolve) => setImmediate(resolve));
const validSchema = () =>
  Response.json({
    game: {
      availableGameStats: {
        achievements: [{ name: "A", displayName: "A" }],
      },
    },
  });

test("three game workers overlap while each game's schema finishes before its dependent calls", async () => {
  const pending = [];
  const m = mock({
    "/ISteamUserStats/GetSchemaForGame/v2/": (url) => {
      const gate = deferred();
      pending.push({ appid: Number(url.searchParams.get("appid")), gate });
      return gate.promise;
    },
  });
  const { value } = await start(m);
  const result = batch(
    value,
    m,
    [10, 20, 30, 40, 50].flatMap((appid) =>
      ["progress", "rarity", "schema"].map((kind) => ({ appid, kind })),
    ),
  );
  await flushWorkers();
  assert.deepEqual(
    pending.map((entry) => entry.appid),
    [10, 20, 30],
  );
  assert.equal(m.maxActive(), 3, "three requests are genuinely in flight");
  assert.equal(
    m.calls.length,
    5,
    "only setup and the three schemas have started",
  );
  // Free one worker. It finishes this game's dependent calls and takes game 40,
  // even though the other two schemas have not responded yet.
  pending[0].gate.resolve(validSchema());
  await flushWorkers();
  assert.deepEqual(
    pending.map((entry) => entry.appid),
    [10, 20, 30, 40],
  );
  assert.equal(
    m.calls.slice(2).filter((call) => call.params.appid === "20").length,
    1,
  );
  assert.equal(
    m.calls.slice(2).filter((call) => call.params.appid === "30").length,
    1,
  );
  pending[1].gate.resolve(validSchema());
  pending[2].gate.resolve(validSchema());
  pending[3].gate.resolve(validSchema());
  await flushWorkers();
  assert.equal(pending.length, 5);
  pending[4].gate.resolve(validSchema());
  const r = await result;
  assert.equal(r.value.attempts, 15);
  assert.equal(r.value.results.length, 15);
  assert.equal(r.value.paused, false);
  assert.equal(m.maxActive(), LIMITS.concurrency);
  assert.equal(m.calls.length - 2, r.value.attempts);
});

test("429 stops dispatch across workers while preserving already in-flight successes and costs", async () => {
  const pending = [];
  const m = mock({
    "/ISteamUserStats/GetSchemaForGame/v2/": () => {
      const gate = deferred();
      pending.push(gate);
      return gate.promise;
    },
  });
  const { value } = await start(m);
  const result = batch(
    value,
    m,
    [10, 20, 30, 40, 50].flatMap((appid) =>
      ["schema", "progress", "rarity"].map((kind) => ({ appid, kind })),
    ),
  );
  await flushWorkers();
  assert.equal(pending.length, 3);
  pending[0].resolve(
    new Response("", { status: 429, headers: { "retry-after": "120" } }),
  );
  await flushWorkers();
  assert.equal(m.calls.length, 5);
  pending[1].resolve(validSchema());
  pending[2].resolve(validSchema());
  const r = await result;
  assert.equal(
    m.calls.length,
    5,
    "no dependent calls or queued games start after the rate limit",
  );
  assert.equal(r.value.attempts, 3);
  assert.equal(r.value.paused, true);
  assert.equal(r.value.retryAfterSeconds, 120);
  assert.deepEqual(
    r.value.results.map(({ appid, status }) => [appid, status]),
    [
      [10, "error"],
      [20, "success"],
      [30, "success"],
    ],
  );
});

test("deadline shared by concurrent workers prevents further calls and retains completed schemas", async () => {
  const pending = [];
  const m = mock({
    "/ISteamUserStats/GetSchemaForGame/v2/": () => {
      const gate = deferred();
      pending.push(gate);
      return gate.promise;
    },
  });
  const { value } = await start(m);
  const result = batch(
    value,
    m,
    [10, 20, 30, 40, 50].flatMap((appid) =>
      ["schema", "progress"].map((kind) => ({ appid, kind })),
    ),
  );
  await flushWorkers();
  m.advance(17000); // Not enough invocation time remains for another 8s request.
  for (const gate of pending) gate.resolve(validSchema());
  const r = await result;
  assert.equal(r.value.attempts, 3);
  assert.equal(m.calls.length, 5);
  assert.equal(r.value.paused, true);
  assert.equal(
    r.value.results.filter((entry) => entry.status === "success").length,
    3,
  );
  assert.ok(r.value.results.some((entry) => entry.code === "deadline"));
});
