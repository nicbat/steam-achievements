import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Use the project's TypeScript compiler, without adding a test-runner dependency.
async function moduleUrl(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext },
  });
  for (const [specifier, url] of Object.entries(dependencies)) {
    outputText = outputText.replace(JSON.stringify(specifier), JSON.stringify(url));
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

const steamUrl = await moduleUrl("../src/lib/steam.ts");
const { isSteamData } = await import(steamUrl);
const { loadData, saveData, clearData } = await import(await moduleUrl("../src/lib/storage.ts", { "./steam": steamUrl }));
const demo = JSON.parse(await readFile(new URL("../public/demo.json", import.meta.url), "utf8"));

test("the shipped demo is accepted", () => {
  assert.equal(isSteamData(demo), true);
});

test("older exports without optional profile metadata or icons remain accepted", () => {
  const data = structuredClone(demo);
  data.player = {};
  for (const game of data.games) {
    delete game.playtime_windows_min;
    for (const achievement of game.achievements) {
      delete achievement.icon;
      delete achievement.icon_gray;
    }
  }
  assert.equal(isSteamData(data), true);
});

test("malformed nested values are rejected before dashboard rendering", () => {
  const mutations = [
    (data) => { data.games = [null]; },
    (data) => { data.games[0].name = {}; },
    (data) => { data.games[0].achievements = null; },
    (data) => { data.games[0].achievements = [null]; },
    (data) => { data.games[0].achievements = [{ api_name: "x", name: "x", unlocked: true, global_completion_rate_pct: "5" }]; },
    (data) => { data.player.persona_name = {}; },
    (data) => { delete data.totals.total_achievements; },
    (data) => { data.totals.total_playtime_hours = Infinity; },
    (data) => { data.games[0].playtime_forever_min = -1; },
    (data) => { data.collected_at = "invalid"; },
  ];
  for (const mutate of mutations) {
    const data = structuredClone(demo);
    mutate(data);
    assert.equal(isSteamData(data), false, mutate.toString());
  }
});

test("storage round-trips exports and rejects corrupt saved data", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let raw = null;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => raw,
      setItem: (_key, value) => { raw = value; },
      removeItem: () => { raw = null; },
    },
  });
  try {
    saveData(demo);
    assert.deepEqual(loadData(), demo);
    raw = "not JSON";
    assert.equal(loadData(), null);
    raw = JSON.stringify({ games: [null], player: {}, totals: {}, steamid64: "123" });
    assert.equal(loadData(), null);
    clearData();
    assert.equal(raw, null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("blocked browser storage cannot prevent startup, importing, or reset", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("Storage access denied"); },
  });
  try {
    assert.equal(loadData(), null);
    assert.doesNotThrow(() => saveData(demo));
    assert.doesNotThrow(() => clearData());
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});
