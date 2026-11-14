import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const mockUrl = `data:text/javascript;base64,${Buffer.from('export const loadDataset=(...args)=>globalThis.__sessionStorage.load(...args); export const saveDataset=(...args)=>globalThis.__sessionStorage.save(...args);').toString('base64')}`;
const source = await readFile(new URL('../src/lib/dataset-session.ts', import.meta.url), 'utf8');
let { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
outputText = outputText.replaceAll('"./browser-storage"', JSON.stringify(mockUrl)).replaceAll("'./browser-storage'", JSON.stringify(mockUrl));
const { DatasetSession } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const initial = () => ({ version: 1, revision: 0, generation: 0, active: null, plans: {}, preferences: {}, freshness: {}, refreshes: {}, checkpoint: null });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('reload does not allow stale unsaved edits to overwrite a newer tab revision', async () => {
  let persisted = { ...initial(), revision: 1, preferences: { planPinned: false } };
  const attempts = [];
  globalThis.__sessionStorage = { load: async () => structuredClone(persisted), save: async (next, expected) => { attempts.push(expected); if (expected !== persisted.revision) throw Error('Revision conflict'); persisted = { ...next, revision: expected + 1 }; return structuredClone(persisted); } };
  const session = new DatasetSession(initial(), () => {});
  await assert.rejects(session.update(d => { d.preferences.planPinned = true; }), /conflict/);
  await session.reload(); assert.equal(session.current.revision, 1);
  await assert.rejects(session.retry(), /conflict/);
  assert.deepEqual(attempts, [0, 0]); assert.equal(persisted.preferences.planPinned, false);
});
test('queued mutations count as pending and serialize retries, reloads, and saves', async () => {
  let persisted = initial(); const gate = deferred(); const entered = deferred(); let saveCount = 0; let loads = 0;
  globalThis.__sessionStorage = { load: async () => { loads++; return structuredClone(persisted); }, save: async (next, expected) => { saveCount++; if (saveCount === 1) throw Error('Quota full'); if (saveCount === 2) { entered.resolve(); await gate.promise; } assert.equal(expected, persisted.revision); persisted = { ...next, revision: expected + 1 }; return structuredClone(persisted); } };
  const session = new DatasetSession(initial(), () => {});
  await assert.rejects(session.update(d => { d.preferences.planPinned = true; }));
  const retry = session.retry(); const reload = session.reload(); const update = session.update(d => { d.preferences.optimizerTarget = 80; });
  assert.equal(session.pending, 3);
  await entered.promise; assert.equal(loads, 0, 'Reload must wait behind pending retry'); assert.equal(saveCount, 2, 'New edits must wait behind pending retry');
  gate.resolve(); await Promise.all([retry, reload, update]);
  assert.equal(session.pending, 0); assert.equal(session.unsaved, null); assert.equal(persisted.revision, 2); assert.deepEqual(persisted.preferences, { planPinned: true, optimizerTarget: 80 });
});
