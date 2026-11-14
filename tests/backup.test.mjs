import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function moduleUrl(file, deps={}) { let {outputText}=ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});for(const [name,url]of Object.entries(deps))outputText=outputText.replaceAll(JSON.stringify(name),JSON.stringify(url)).replaceAll(`'${name}'`,JSON.stringify(url));return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`; }
const steam = await moduleUrl('../src/lib/steam.ts');
const plan = await moduleUrl('../src/lib/plan.ts', {'./steam':steam});
const { emptyDataset, serializeBackup, parseBackup, validateSnapshot } = await import(await moduleUrl('../src/lib/backup.ts', {'./steam':steam,'./plan':plan}));
const sample = JSON.parse(await readFile(new URL('../public/demo.json',import.meta.url),'utf8'));
const sid = sample.steamid64;
const item = {kind:'achievement',appid:1,game:'Missing game',apiName:'missing',name:'Retained intention'};
test('combined backup retains all profile plans, excludes internal state and unknown secrets',()=>{
 const d=emptyDataset();d.active=structuredClone(sample);d.active.apiKey='test-secret-do-not-export-abc123xyz';d.active.player.apiKey='test-secret-do-not-export-abc123xyz';d.plans[sid]=[item];d.plans['76561198000000001']=[];d.checkpoint={token:'test-secret-do-not-export-abc123xyz'};d.refreshes[sid]=new Date().toISOString();d.preferences.planPinned=true;
 const text=serializeBackup(d);assert.ok(!text.includes('test-secret-do-not-export-abc123xyz'));assert.ok(!Object.hasOwn(JSON.parse(text),'checkpoint'));assert.ok(!Object.hasOwn(JSON.parse(text),'refreshes'));
 const restored=parseBackup(text);assert.deepEqual(restored.plans,d.plans);assert.equal(restored.active.steamid64,sid);assert.equal(restored.preferences.planPinned,true);assert.equal(restored.checkpoint,null);
});
test('empty combined backup is valid',()=>assert.deepEqual(parseBackup(serializeBackup(emptyDataset())),emptyDataset()));
test('restore rejects identity mismatch, duplicate games and duplicate achievements',()=>{
 for (const mutate of [d=>d.player.steamid64='76561198000000001',d=>d.games.push(d.games[0]),d=>{const g=d.games.find(g=>g.achievements.length);g.achievements.push(g.achievements[0]);}]) {const d=structuredClone(sample);mutate(d);assert.throws(()=>validateSnapshot(d));}
});
test('restore rejects future formats, duplicate targets, invalid IDs/preferences/freshness',()=>{
 const base=JSON.parse(serializeBackup(emptyDataset()));
 for(const mutate of [x=>x.version=2,x=>x.plans.bad=[],x=>x.plans[sid]=[item,item],x=>x.preferences.optimizerTarget=101,x=>x.freshness[sid]={'1':{progress:'yesterday'}}]){const b=structuredClone(base);mutate(b);assert.throws(()=>parseBackup(JSON.stringify(b)));}
});
test('strict plan files reject another profile but keep unavailable targets',async()=>{
 const {parsePlanJson,planItemStatus}=await import(plan);
 const text=JSON.stringify({app:'achievement-atlas',version:1,steamid64:sid,items:[item]});
 assert.deepEqual(parsePlanJson(text,sid),[item]);assert.throws(()=>parsePlanJson(text,'76561198000000001'),/different profile/);assert.equal(planItemStatus(sample,item),'inactive');
});
test('explicit no-achievement schema cache survives export and restore with date validation',()=>{
 const d=emptyDataset();d.active=structuredClone(sample);d.freshness[sid]={'1':{noAchievementSchema:new Date().toISOString(),progressUnavailable:new Date().toISOString()}};
 assert.deepEqual(parseBackup(serializeBackup(d)).freshness,d.freshness);
 const b=JSON.parse(serializeBackup(d));b.freshness[sid]['1'].noAchievementSchema='not a date';assert.throws(()=>parseBackup(JSON.stringify(b)),/freshness date/);
});
