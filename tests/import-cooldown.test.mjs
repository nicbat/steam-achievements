import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function moduleUrl(file, deps = {}) {
  let { outputText } = ts.transpileModule(
    await readFile(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  );
  for (const [name, url] of Object.entries(deps))
    outputText = outputText
      .replaceAll(JSON.stringify(name), JSON.stringify(url))
      .replaceAll(`'${name}'`, JSON.stringify(url));
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const steam = await moduleUrl("../src/lib/steam.ts");
const model = await moduleUrl("../src/lib/import-model.ts");
const plan = await moduleUrl("../src/lib/plan.ts", { "./steam": steam });
const backup = await moduleUrl("../src/lib/backup.ts", {
  "./steam": steam,
  "./plan": plan,
});
const { ImportController } = await import(
  await moduleUrl("../src/lib/import-controller.ts", {
    "./steam": steam,
    "./import-model": model,
    "./backup": backup,
  })
);
const { emptyDataset } = await import(backup);
const sample = JSON.parse(
  await readFile(new URL("../public/demo.json", import.meta.url), "utf8"),
);
function harness(t, { alreadyRefreshed = true } = {}) {
  const original = {
    fetch: globalThis.fetch,
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    document: globalThis.document,
    now: Date.now,
  };
  let now = original.now();
  Date.now = () => now;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        async request(_name, _options, callback) {
          return callback({ name: "import" });
        },
      },
    },
  });
  globalThis.document = { hidden: false };
  const data = structuredClone(sample);
  data.games = data.games.slice(0, 1);
  const store = {
    current: {
      ...emptyDataset(),
      active: structuredClone(data),
      refreshes: alreadyRefreshed
        ? { [data.steamid64]: new Date(now).toISOString() }
        : {},
    },
    unsaved: null,
    async update(change) {
      const next = structuredClone(this.current);
      change(next);
      next.revision++;
      this.current = next;
      return next;
    },
  };
  const requests = [];
  globalThis.fetch = async (path, options) => {
    const body = JSON.parse(options.body);
    requests.push({ path, body });
    if (path.endsWith("/start"))
      return Response.json({
        ok: true,
        attempts: body.profile === data.steamid64 ? 2 : 3,
        data,
        token: "test-permission",
        expiresAt: new Date(now + 1800000).toISOString(),
      });
    return Response.json({
      ok: true,
      attempts: body.operations.length,
      paused: false,
      results: body.operations.map((op) => ({
        ...op,
        status: "success",
        data: [],
      })),
    });
  };
  const controllers = [];
  const controller = () => {
    const c = new ImportController(store, () => {});
    controllers.push(c);
    return c;
  };
  t.after(() => {
    controllers.forEach((c) => c.invalidate());
    globalThis.fetch = original.fetch;
    Date.now = original.now;
    globalThis.document = original.document;
    if (original.navigator)
      Object.defineProperty(globalThis, "navigator", original.navigator);
    else delete globalThis.navigator;
  });
  return {
    store,
    requests,
    data,
    controller,
    advance: (ms) => {
      now += ms;
    },
  };
}
test("vanity lookup respects resolved-profile cooldown and preserves setup calls across reload", async (t) => {
  const h = harness(t);
  const c = h.controller();
  await c.check("https://steamcommunity.com/id/sample");
  assert.equal(h.requests.length, 1);
  assert.equal(c.view.stage, "paused");
  assert.match(c.view.reason, /Refresh is available/);
  assert.equal(h.store.current.checkpoint.calls, 3);
  assert.equal(h.store.current.checkpoint.phase, "review");
  const pausedUntil = h.store.current.checkpoint.retryAt;
  assert.ok(pausedUntil > Date.now());
  await c.resume();
  assert.equal(h.requests.length, 1);
  c.invalidate();
  const reloaded = h.controller();
  await reloaded.resume();
  assert.equal(h.requests.length, 1);
  assert.equal(reloaded.view.checkpoint.calls, 3);
  h.advance(21600001);
  await Promise.resolve();
  assert.equal(
    h.requests.length,
    1,
    "cooldown expiry never launches work automatically",
  );
  await reloaded.resume();
  assert.equal(
    h.requests.length,
    3,
    "explicit resume renews expired permission then dispatches one batch",
  );
  assert.equal(reloaded.view.stage, "complete");
  assert.equal(
    reloaded.view.checkpoint.calls,
    8,
    "original vanity3 + renewal2 + three operation calls",
  );
});
test("numeric active-profile cooldown avoids even setup calls", async (t) => {
  const h = harness(t);
  const c = h.controller();
  await c.check(h.data.steamid64);
  assert.equal(h.requests.length, 0);
  assert.equal(c.view.stage, "paused");
  assert.match(c.view.reason, /Refresh is available/);
});
test("vanity profile without recent refresh still reaches review", async (t) => {
  const h = harness(t, { alreadyRefreshed: false });
  const c = h.controller();
  await c.check("https://steamcommunity.com/id/sample");
  assert.equal(c.view.stage, "review");
  assert.equal(h.store.current.checkpoint.calls, 3);
  assert.equal(h.store.current.checkpoint.retryAt, 0);
  assert.equal(h.requests.length, 1);
});


test("local cooldown reset preserves saved data and makes no requests", async (t) => {
  const h = harness(t);
  const c = h.controller();
  const active = structuredClone(h.store.current.active);
  h.store.current.refreshes.other = new Date(Date.now()).toISOString();
  await c.check(h.data.steamid64);
  await c.resetLocalRefreshCooldown();
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.store.current.active, active);
  assert.ok(h.store.current.refreshes.other);
  assert.equal(h.store.current.refreshes[h.data.steamid64], undefined);
  assert.equal(c.view.stage, "idle");
  await c.check(h.data.steamid64);
  assert.equal(c.view.stage, "review");
  assert.equal(h.requests.length, 1);
});

test("local reset refuses unfinished checkpoints and preserves their wait and accounting", async (t) => {
  const h = harness(t);
  const c = h.controller();
  await c.check("https://steamcommunity.com/id/sample");
  const before = structuredClone(h.store.current);
  await c.resetLocalRefreshCooldown();
  assert.deepEqual(h.store.current, before);
  assert.equal(h.requests.length, 1);
  assert.match(c.view.reason, /unfinished import/);
});
