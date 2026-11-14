import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function moduleUrl(file, deps = {}) {
  let { outputText } = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  for (const [name, url] of Object.entries(deps)) outputText = outputText.replaceAll(JSON.stringify(name), JSON.stringify(url)).replaceAll(`'${name}'`, JSON.stringify(url));
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const steam = await moduleUrl('../src/lib/steam.ts');
const model = await moduleUrl('../src/lib/import-model.ts');
const plan = await moduleUrl('../src/lib/plan.ts', { './steam': steam });
const backup = await moduleUrl('../src/lib/backup.ts', { './steam': steam, './plan': plan });
const { ImportController, readCheckpoint } = await import(await moduleUrl('../src/lib/import-controller.ts', { './steam': steam, './import-model': model, './backup': backup }));
const { emptyDataset } = await import(backup);
const sample = JSON.parse(await readFile(new URL('../public/demo.json', import.meta.url), 'utf8'));
function library(count = 1) {
  const d = structuredClone(sample); const source = d.games.find(g => g.achievements.length);
  d.games = Array.from({ length: count }, (_, i) => ({ ...structuredClone(source), appid: i + 1, achievements: [{ api_name: 'one', name: 'One', description: null, unlocked: false, unlock_time: null, global_completion_rate_pct: 10, icon: null, icon_gray: null }], achievements_total: 1, achievements_unlocked: 0 }));
  return d;
}
function checkpoint(overrides = {}) {
  const candidate = library();
  return { version: 1, profile: candidate.steamid64, mode: 'quick', phase: 'batch', candidate, token: 'permission', expiresAt: new Date(Date.now() + 3600000).toISOString(), operations: [{ appid: 1, kind: 'progress' }], selected: [1], freshness: {}, calls: 0, allowance: 1000, failures: [], retryAt: 0, ...overrides };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function harness(t, cp = null, responder = () => { throw Error('Unexpected request'); }) {
  const original = { fetch: globalThis.fetch, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), document: globalThis.document, now: Date.now };
  let now = original.now(); Date.now = () => now;
  let locked = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { async request(_name, _options, callback) { if (locked) return callback(null); locked = true; try { return await callback({ name: 'import' }); } finally { locked = false; } } } } });
  globalThis.document = { hidden: false };
  const requests = []; let active = 0; let peak = 0;
  globalThis.fetch = async (path, options) => {
    const body = JSON.parse(options.body); requests.push({ path, body }); active++; peak = Math.max(peak, active);
    try { const result = await responder(path, body, requests.length); return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } }); }
    finally { active--; now += 6000; }
  };
  const store = { current: { ...emptyDataset(), checkpoint: cp }, unsaved: null, pending: 0, hook: null, updates: 0,
    async update(change) { this.updates++; this.pending++; const next = structuredClone(this.current); change(next); try { if (this.hook) await this.hook(this.updates, next); next.revision++; this.current = next; return next; } catch (error) { this.unsaved = next; throw error; } finally { this.pending--; } },
    async retry() { if (this.unsaved) { this.current = this.unsaved; this.unsaved = null; } return this.current; }
  };
  const controller = new ImportController(store, () => {});
  t.after(() => { controller.invalidate(); globalThis.fetch = original.fetch; Date.now = original.now; globalThis.document = original.document; if (original.navigator) Object.defineProperty(globalThis, 'navigator', original.navigator); else delete globalThis.navigator; });
  return { controller, store, requests, peak: () => peak, advance: ms => { now += ms; } };
}
const success = (op, data = []) => ({ ...op, status: 'success', data });
const batchSuccess = operations => ({ ok: true, attempts: operations.length, paused: false, results: operations.map(op => success(op, op.kind === 'progress' ? [{ api_name: 'one', name: 'One', description: null, unlocked: true, unlock_time: null }] : [])) });

test('restoring a checkpoint makes no calls; a 429 requires explicit resume after its deadline', async t => {
  const h = harness(t, checkpoint(), () => ({ ok: false, code: 'limited', message: 'Wait before retrying.', attempts: 1, retryAfterSeconds: 60 }));
  assert.equal(h.controller.view.stage, 'paused'); assert.equal(h.requests.length, 0);
  await h.controller.resume(); assert.equal(h.requests.length, 1); assert.equal(h.controller.view.stage, 'paused');
  await h.controller.resume(); assert.equal(h.requests.length, 1, 'Resume before Retry-After must not fetch');
  h.advance(70000); await Promise.resolve(); assert.equal(h.requests.length, 1, 'Clock expiry is not permission to retry');
});
test('browser batches three games and nine operations for responsive updates', async t => {
  const operations = Array.from({ length: 6 }, (_, i) => ['progress', 'schema', 'rarity'].map(kind => ({ appid: i + 1, kind }))).flat();
  const h = harness(t, checkpoint({ candidate: library(6), operations, selected: [1, 2, 3, 4, 5, 6] }), () => ({ ok: true, attempts: 0, paused: true, results: [] }));
  await h.controller.resume(); assert.equal(h.requests.length, 1); const sent = h.requests[0].body.operations;
  assert.equal(new Set(sent.map(o => o.appid)).size, 3); assert.equal(sent.length, 9); assert.equal(h.peak(), 1);
});
test('unknown response retains reserved attempts across controller reload', async t => {
  const h = harness(t, checkpoint({ calls: 21 }), () => { throw Error('Connection lost after dispatch'); });
  await h.controller.resume(); assert.equal(h.store.current.checkpoint.calls, 22); assert.equal(h.requests.length, 1);
  const reloaded = new ImportController(h.store, () => {}); assert.equal(reloaded.view.checkpoint.calls, 22); assert.equal(h.requests.length, 1); reloaded.invalidate();
});
test('budget survives reload and only explicit allowance extension permits another call', async t => {
  const h = harness(t, checkpoint({ calls: 1000 }), (_path, body) => batchSuccess(body.operations));
  await h.controller.resume(); assert.equal(h.requests.length, 0); assert.match(h.controller.view.reason, /allowance/);
  const reloaded = new ImportController(h.store, () => {}); assert.equal(reloaded.view.checkpoint.calls, 1000);
  await reloaded.allowMore(); assert.equal(h.requests.length, 1); assert.equal(reloaded.view.checkpoint.calls, 1001); assert.equal(reloaded.view.checkpoint.allowance, 2000); assert.equal(reloaded.view.stage, 'complete'); reloaded.invalidate();
});
test('partial success is checkpointed and resume requests only unresolved operations', async t => {
  const ops = ['progress', 'schema', 'rarity'].map(kind => ({ appid: 1, kind }));
  const h = harness(t, checkpoint({ operations: ops }), (_path, body, n) => n === 1 ? { ok: true, attempts: 3, paused: true, results: [success(ops[0], [{ api_name: 'one', name: 'One', description: null, unlocked: true, unlock_time: null }]), { ...ops[1], status: 'error', code: 'upstream', message: 'Try again.', retryable: true }, success(ops[2], [{ api_name: 'one', global_completion_rate_pct: 42 }])] } : { ok: true, attempts: 1, paused: false, results: [success(body.operations[0], [{ api_name: 'one', name: 'One', description: null, icon: null, icon_gray: null }])] });
  await h.controller.resume(); assert.deepEqual(h.store.current.checkpoint.operations, [ops[1]]); assert.equal(h.store.current.checkpoint.candidate.games[0].achievements[0].unlocked, true);
  await new Promise(resolve => setImmediate(resolve));
  await h.controller.resume(); assert.deepEqual(h.requests[1].body.operations, [ops[1]]); assert.equal(h.store.current.active.games[0].achievements[0].unlocked, true); assert.equal(h.store.current.active.games[0].achievements[0].global_completion_rate_pct, 42); assert.equal(h.store.current.checkpoint, null);
});
test('expired permission renews scope without resetting the attempt ledger or completed work', async t => {
  const h = harness(t, checkpoint({ calls: 99, expiresAt: new Date(Date.now() - 1000).toISOString(), operations: [{ appid: 1, kind: 'rarity' }] }), (path, body) => path.endsWith('/start') ? { ok: true, attempts: 2, data: library(), token: 'renewed-permission', expiresAt: new Date(Date.now() + 3600000).toISOString() } : batchSuccess(body.operations));
  await h.controller.resume(); assert.equal(h.requests.length, 2); assert.ok(h.requests[0].path.endsWith('/start')); assert.equal(h.requests[1].body.token, 'renewed-permission'); assert.deepEqual(h.requests[1].body.operations, [{ appid: 1, kind: 'rarity' }]); assert.equal(h.controller.view.checkpoint.calls, 102);
});
test('failed durable reservation prevents the first upstream request', async t => {
  const h = harness(t); h.store.hook = async () => { throw Error('Quota exceeded'); };
  await h.controller.check(sample.steamid64); assert.equal(h.requests.length, 0); assert.equal(h.controller.view.stage, 'paused'); assert.ok(h.store.unsaved); assert.equal(h.store.unsaved.checkpoint.calls, 3);
});
test('invalidating while a reservation saves prevents dispatch after save resolves', async t => {
  const h = harness(t, checkpoint(), (_path, body) => batchSuccess(body.operations)); const started = deferred(); const gate = deferred();
  h.store.hook = async n => { if (n === 2) { started.resolve(); await gate.promise; } };
  const running = h.controller.resume(); await started.promise; h.controller.invalidate(); gate.resolve(); await running;
  assert.equal(h.requests.length, 0); assert.equal(h.controller.view.stage, 'idle');
});
test('malformed saved checkpoint is rejected without throwing', () => {
  assert.equal(readCheckpoint(checkpoint({ operations: [null] })), null);
  assert.equal(readCheckpoint(checkpoint({ selected: ['not an ID'] })), null);
});
test('profile lookup stops at review and does not automatically import achievements', async t => {
  const h = harness(t, null, () => ({ ok: true, attempts: 2, data: library(), token: 'permission', expiresAt: new Date(Date.now() + 3600000).toISOString() }));
  await h.controller.check(sample.steamid64); assert.equal(h.requests.length, 1); assert.equal(h.controller.view.stage, 'review'); assert.equal(h.store.current.active, null); assert.equal(h.store.current.checkpoint.calls, 2);
});
test('another controller cannot dispatch while an import owns the browser lock', async t => {
  const started = deferred(); const gate = deferred();
  const h = harness(t, checkpoint(), async (_path, body) => { started.resolve(); await gate.promise; return batchSuccess(body.operations); });
  const running = h.controller.resume(); await started.promise;
  const other = new ImportController(h.store, () => {}); await other.resume(); assert.match(other.view.reason, /another tab/); assert.equal(h.requests.length, 1); assert.equal(h.peak(), 1);
  gate.resolve(); await running; other.invalidate();
});
test('hidden document pauses before dispatch while retaining the checkpoint', async t => {
  const h = harness(t, checkpoint()); document.hidden = true;
  await h.controller.resume(); assert.equal(h.requests.length, 0); assert.equal(h.controller.view.stage, 'paused'); assert.equal(h.store.current.checkpoint.operations.length, 1);
});
test('failure saving returned results retains the previous dashboard and recoverable candidate', async t => {
  const h = harness(t, checkpoint(), (_path, body) => batchSuccess(body.operations)); h.store.current.active = library();
  h.store.hook = async n => { if (n === 3) throw Error('Quota full after response'); };
  await h.controller.resume(); assert.equal(h.requests.length, 1); assert.equal(h.controller.view.stage, 'paused'); assert.equal(h.store.current.active.games[0].achievements[0].unlocked, false); assert.equal(h.store.unsaved.checkpoint.candidate.games[0].achievements[0].unlocked, true);
  await h.controller.resume(); assert.equal(h.requests.length, 1, 'Unsaved results block additional requests');
});
test('double clicking check starts only one profile lookup', async t => {
  const started = deferred(); const gate = deferred();
  const h = harness(t, null, async () => { started.resolve(); await gate.promise; return { ok: true, attempts: 2, data: library(), token: 'permission', expiresAt: new Date(Date.now() + 3600000).toISOString() }; });
  const first = h.controller.check(sample.steamid64); const second = h.controller.check(sample.steamid64);
  await started.promise; await second; assert.equal(h.requests.length, 1); gate.resolve(); await first;
  assert.equal(h.controller.view.stage, 'review'); assert.equal(h.store.current.checkpoint.calls, 2);
});
test('double clicking resume keeps one request stream and holds its browser lock', async t => {
  const started = deferred(); const gate = deferred();
  const h = harness(t, checkpoint(), async (_path, body) => { started.resolve(); await gate.promise; return batchSuccess(body.operations); });
  const first = h.controller.resume(); const second = h.controller.resume();
  await started.promise; await second;
  const other = new ImportController(h.store, () => {}); await other.resume(); assert.match(other.view.reason, /another tab/); assert.equal(h.requests.length, 1); assert.equal(h.peak(), 1);
  gate.resolve(); await first; assert.equal(h.controller.view.stage, 'complete'); other.invalidate();
});
function denied(op,code='steam_access_denied'){return {...op,status:'error',code,message:'Steam denied this operation.',retryable:true};}
test('access-denied pause identifies the game and survives reload; explicit skip preserves results and calls',async t=>{
 const operations=[{appid:1,kind:'progress'},{appid:1,kind:'schema'},{appid:1,kind:'rarity'},{appid:2,kind:'progress'}];
 const h=harness(t,checkpoint({candidate:library(2),operations,selected:[1,2],calls:12}),()=>({ok:true,attempts:2,paused:true,results:[success(operations[0],[{api_name:'one',name:'One',description:null,unlocked:true,unlock_time:null}]),denied(operations[1])]}));
 await h.controller.resume();assert.equal(h.controller.view.stage,'paused');assert.deepEqual(h.store.current.checkpoint.blockedOperation,operations[1]);assert.ok(h.controller.view.reason.includes(h.store.current.checkpoint.candidate.games[0].name));assert.match(h.controller.view.reason,/achievement details/);
 const reloaded=new ImportController(h.store,()=>{});assert.deepEqual(reloaded.view.checkpoint.blockedOperation,operations[1]);
 const before=structuredClone(h.store.current.checkpoint);await new Promise(resolve=>setImmediate(resolve));await reloaded.skipBlockedGame();
 const after=h.store.current.checkpoint;assert.equal(h.requests.length,1);assert.equal(after.calls,14);assert.equal(after.allowance,before.allowance);assert.deepEqual(after.candidate,before.candidate);assert.deepEqual(after.freshness,before.freshness);assert.deepEqual(after.operations,[operations[3]]);assert.equal(after.blockedOperation,undefined);assert.equal(after.failures.length,2);assert.ok(after.failures.every(f=>f.code==='user_skipped'));assert.equal(reloaded.view.stage,'paused');assert.match(reloaded.view.reason,/Choose Resume/);reloaded.invalidate();
});
test('failed skip save blocks work until durable retry and preserves the saved blocked checkpoint',async t=>{
 const op={appid:1,kind:'progress'};const h=harness(t,checkpoint(),()=>({ok:true,attempts:1,paused:true,results:[denied(op)]}));
 await h.controller.resume();await new Promise(resolve=>setImmediate(resolve));h.store.hook=async()=>{throw Error('Disk full');};
 await h.controller.skipBlockedGame();assert.equal(h.requests.length,1);assert.ok(h.store.unsaved);assert.deepEqual(h.store.current.checkpoint.blockedOperation,op);assert.equal(h.store.unsaved.checkpoint.operations.length,0);
 await h.controller.skipBlockedGame();await h.controller.resume();assert.equal(h.requests.length,1);
 h.store.hook=null;await h.controller.retrySaving();assert.equal(h.controller.view.checkpoint.operations.length,0);assert.equal(h.controller.view.checkpoint.blockedOperation,undefined);assert.equal(h.controller.view.stage,'paused');assert.equal(h.requests.length,1);
});
test('401 and 429 do not enable skipping a game',async t=>{
 const h=harness(t,checkpoint(),()=>({ok:true,attempts:1,paused:true,results:[denied({appid:1,kind:'progress'},'steam_auth')]}));
 await h.controller.resume();assert.equal(h.controller.view.checkpoint.blockedOperation,undefined);const updates=h.store.updates;await h.controller.skipBlockedGame();assert.equal(h.store.updates,updates);
 await new Promise(resolve=>setImmediate(resolve));globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,attempts:0,code:'rate_limited',message:'HTTP 429',retryAfterSeconds:60}));
 await h.controller.resume();assert.equal(h.controller.view.checkpoint.blockedOperation,undefined);const after=h.store.updates;await h.controller.skipBlockedGame();assert.equal(h.store.updates,after);
});
test('resuming a blocked game clears stale skip eligibility before an unknown network outcome',async t=>{
 let calls=0;const h=harness(t,checkpoint(),()=>{if(++calls===1)return {ok:true,attempts:1,paused:true,results:[denied({appid:1,kind:'progress'})]};throw Error('Network outcome unknown');});
 await h.controller.resume();assert.ok(h.store.current.checkpoint.blockedOperation);await new Promise(resolve=>setImmediate(resolve));await h.controller.resume();assert.equal(h.store.current.checkpoint.blockedOperation,undefined);assert.equal(h.controller.view.checkpoint.blockedOperation,undefined);assert.equal(h.requests.length,2);
});
test('invalidating a pending skip cannot restore its old controller view',async t=>{
 const op={appid:1,kind:'progress'};const h=harness(t,checkpoint({blockedOperation:op}),()=>{throw Error('No calls expected');});const started=deferred(),gate=deferred();
 h.store.hook=async()=>{started.resolve();await gate.promise;};const running=h.controller.skipBlockedGame();await started.promise;h.controller.invalidate();gate.resolve();await running;
 assert.equal(h.controller.view.stage,'idle');assert.equal(h.controller.view.checkpoint,null);assert.equal(h.requests.length,0);
});
test('saved blocked operation must be a bounded operation still pending in this candidate',()=>{
 assert.equal(readCheckpoint(checkpoint({blockedOperation:{appid:2147483648,kind:'progress'}})),null);
 assert.equal(readCheckpoint(checkpoint({blockedOperation:{appid:1,kind:'schema'}})),null);
 assert.equal(readCheckpoint(checkpoint({blockedOperation:{appid:1,kind:'anything'}})),null);
 assert.ok(readCheckpoint(checkpoint({blockedOperation:{appid:1,kind:'progress'}})));
});

test('confirmed no-achievement schema prunes split-batch work and keeps prior achievement data', async t => {
 const operations=['progress','schema','rarity'].map(kind=>({appid:1,kind}));
 const cp=checkpoint({operations}); const before=structuredClone(cp.candidate.games);
 const h=harness(t,cp,(_path,body)=>{
  assert.equal(body.operations[0].kind,'schema');
  return {ok:true,attempts:1,paused:true,results:[{appid:1,kind:'schema',status:'error',code:'no_achievement_schema',message:'No schema.',retryable:false}]};
 });
 await h.controller.resume();
 assert.deepEqual(h.store.current.checkpoint.operations,[]);
 assert.ok(h.store.current.checkpoint.freshness[1].noAchievementSchema);
 assert.deepEqual(h.store.current.checkpoint.candidate.games,before);
 h.controller.invalidate();await new Promise(resolve=>setImmediate(resolve));
 h.store.current.checkpoint.expiresAt=new Date(0).toISOString();
 const reloaded=new ImportController(h.store,()=>{});
 await reloaded.resume();assert.equal(h.requests.length,1,'No renew or dependent requests when all work resolved');
 assert.equal(reloaded.view.stage,'complete',reloaded.view.reason);assert.deepEqual(h.store.current.active.games,before);reloaded.invalidate();
});
test('persisted negative cache prunes stale checkpoint operations on explicit resume',async t=>{
 const cp=checkpoint({operations:['rarity','progress'].map(kind=>({appid:1,kind})),freshness:{1:{noAchievementSchema:new Date().toISOString()}},expiresAt:new Date(0).toISOString()});
 const h=harness(t,cp);assert.equal(h.requests.length,0);await h.controller.resume();assert.equal(h.requests.length,0);assert.equal(h.controller.view.stage,'complete');
});
test('empty schema success defensively preserves history and prevents subsequent dependent requests',async t=>{
 const cp=checkpoint({operations:['schema','progress','rarity'].map(kind=>({appid:1,kind}))});const before=structuredClone(cp.candidate.games);
 const h=harness(t,cp,()=>({ok:true,attempts:1,paused:false,results:[success({appid:1,kind:'schema'},[])]}));
 await h.controller.resume();assert.equal(h.requests.length,1);assert.equal(h.controller.view.stage,'complete');assert.deepEqual(h.store.current.active.games,before);assert.ok(h.store.current.freshness[cp.candidate.steamid64][1].noAchievementSchema);
});
test('recognized unavailable progress is cached without hiding schema or rarity',async t=>{
 const ops=['schema','progress','rarity'].map(kind=>({appid:1,kind}));
 const h=harness(t,checkpoint({operations:ops}),()=>({ok:true,attempts:3,paused:false,results:[success(ops[0],[{api_name:'one',name:'One',description:null,icon:null,icon_gray:null}]),{...ops[1],status:'error',code:'no_stats',message:'No player stats.',retryable:false},success(ops[2],[{api_name:'one',global_completion_rate_pct:20}])]}));
 await h.controller.resume();const f=h.store.current.freshness[h.store.current.active.steamid64][1];assert.ok(f.progressUnavailable);assert.ok(f.schema);assert.ok(f.rarity);assert.equal(f.noAchievementSchema,undefined);
});
test('pausing while a reservation saves refunds calls that were never dispatched',async t=>{
 const h=harness(t,checkpoint());h.store.hook=async (n)=>{if(n===2)h.controller.pause();};
 await h.controller.resume();assert.equal(h.requests.length,0);assert.equal(h.store.current.checkpoint.calls,0);assert.equal(h.controller.view.stage,'paused');
});

const legacyNoSchema='Steam returned no achievement schema for this game. Previously saved values are retained.';
test('explicit resume repairs legacy no-schema rarity checkpoint with one budgeted schema recheck',async t=>{
 const cp=checkpoint({operations:[{appid:1,kind:'rarity'}],failures:[{appid:1,kind:'schema',message:legacyNoSchema}],blockedOperation:{appid:1,kind:'rarity'},calls:5});
 const h=harness(t,cp,(_path,body)=>{
  assert.deepEqual(body.operations,[{appid:1,kind:'schema'},{appid:1,kind:'rarity'}]);
  assert.equal(h.store.current.checkpoint.calls,7,'Fresh schema call reserved before dispatch');
  return {ok:true,attempts:1,paused:false,results:[{appid:1,kind:'schema',status:'error',code:'no_achievement_schema',message:legacyNoSchema,retryable:false}]};
 });
 assert.equal(h.requests.length,0,'Loading never dispatches');await h.controller.resume();assert.equal(h.requests.length,1);assert.equal(h.controller.view.stage,'complete');assert.equal(h.controller.view.checkpoint.calls,6);
});
test('legacy repair does not duplicate a pending schema and accepts newly available achievements',async t=>{
 const ops=[{appid:1,kind:'rarity'},{appid:1,kind:'schema'}];
 const h=harness(t,checkpoint({operations:ops,failures:[{appid:1,kind:'schema',message:legacyNoSchema}]}),(_path,body)=>{
  assert.deepEqual(body.operations,[ops[1],ops[0]]);
  return {ok:true,attempts:2,paused:false,results:[success(ops[1],[{api_name:'one',name:'Updated',description:null,icon:null,icon_gray:null}]),success(ops[0],[{api_name:'one',global_completion_rate_pct:25}])]};
 });
 await h.controller.resume();assert.equal(h.controller.view.stage,'complete');assert.equal(h.store.current.active.games[0].achievements[0].global_completion_rate_pct,25);assert.equal(h.controller.view.checkpoint.failures.length,0);
});
test('legacy repair never infers absent schema from private stats or arbitrary errors',async t=>{
 const failures=[{appid:1,kind:'progress',message:legacyNoSchema},{appid:1,kind:'schema',message:'Steam reports no achievement stats for this game. Previously saved values are retained.'},{appid:1,kind:'schema',message:'Profile is private.'},{appid:1,kind:'schema',message:legacyNoSchema+' extra'}];
 const op={appid:1,kind:'rarity'};const h=harness(t,checkpoint({operations:[op],failures}),(_path,body)=>{assert.deepEqual(body.operations,[op]);return {ok:true,attempts:1,paused:false,results:[success(op,[])]};});
 await h.controller.resume();assert.equal(h.controller.view.stage,'complete');assert.equal(h.controller.view.checkpoint.failures.length,failures.length);
});

test('activity records game outcomes in the saved checkpoint and caps history', async t => {
 const ops=[{appid:1,kind:'progress'},{appid:1,kind:'rarity'}];
 const h=harness(t,checkpoint({operations:ops,log:Array.from({length:100},()=>({at:new Date().toISOString(),message:'Earlier event'}))}),()=>({ok:true,attempts:2,paused:true,results:[success(ops[0],[{api_name:'one',name:'One',description:null,unlocked:true,unlock_time:null}]),{...ops[1],status:'error',code:'steam_access_denied',message:'Steam denied access.',retryable:true}]}));
 await h.controller.resume();
 assert.equal(h.controller.view.checkpoint.log.length,100);
 const restored=readCheckpoint(h.store.current.checkpoint);
 assert.ok(restored.log.some(e=>e.message.includes('Progress: received')));
 assert.ok(restored.log.some(e=>e.message.includes('Rarity: paused')));
 assert.equal(readCheckpoint({...restored,log:[{at:'bad',message:'test'}]}),null);
 assert.equal(readCheckpoint({...restored,log:[{at:new Date().toISOString(),message:'x'.repeat(1001)}]}),null);
});

test('browser batches dispatch without artificial delays and never overlap', async t => {
 const ops=Array.from({length:6},(_,i)=>({appid:i+1,kind:'progress'}));
 const h=harness(t,checkpoint({candidate:library(6),operations:ops,selected:[1,2,3,4,5,6]}),(_path,body)=>{h.advance(-6000);return batchSuccess(body.operations);});
 const original=globalThis.setTimeout,delays=[];
 globalThis.setTimeout=(callback,ms,...args)=>{if(ms===35000)return original(callback,ms,...args);delays.push(ms);h.advance(ms);queueMicrotask(()=>callback(...args));return 0;};
 try {await h.controller.resume();}finally{globalThis.setTimeout=original;}
 assert.equal(h.requests.length,2);assert.equal(h.peak(),1);
 assert.deepEqual(delays,[]);assert.equal(h.controller.view.stage,'complete');
});

test('normal batches have no retry deadline and no-schema dependent skips are not failures', async t => {
 const ops=['schema','progress','rarity'].map(kind=>({appid:1,kind}));
 const h=harness(t,checkpoint({operations:ops}),()=>({ok:true,attempts:1,paused:false,results:ops.map(op=>({...op,status:'error',retryable:false,code:op.kind==='schema'?'no_achievement_schema':'unavailable',message:'No achievement schema.'}))}));
 await h.controller.resume();
 assert.equal(h.controller.view.stage,'complete');assert.equal(h.controller.view.checkpoint.retryAt,0);
 assert.deepEqual(h.controller.view.checkpoint.failures,[]);
 assert.equal(h.controller.view.checkpoint.freshness[1].progressUnavailable,undefined);
 assert.ok(h.controller.view.checkpoint.freshness[1].noAchievementSchema);
 assert.ok(!h.controller.view.checkpoint.log.some(e=>e.message.includes('unavailable; existing data kept')));
});
