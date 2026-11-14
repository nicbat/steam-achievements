import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const {outputText}=ts.transpileModule(await readFile(new URL('../src/lib/import-model.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {selectWork,pendingWork,applyOperation}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const sample=JSON.parse(await readFile(new URL('../public/demo.json',import.meta.url),'utf8'));
const library=()=>({...structuredClone(sample),games:[structuredClone(sample.games.find(g=>g.achievements.length))]});
test('only explicit recent no-schema evidence skips games; full mode respects its seven-day expiry',()=>{
 const previous=library(),next=structuredClone(previous),id=next.games[0].appid,now=Date.now();
 const fresh={ [id]: {noAchievementSchema:new Date(now-6*86400000).toISOString()} };
 assert.deepEqual(selectWork(next,previous,fresh,'full',now),[]);
 fresh[id].noAchievementSchema=new Date(now-7*86400000).toISOString();assert.deepEqual(selectWork(next,previous,fresh,'full',now).map(x=>x.kind),['schema','progress','rarity']);
 fresh[id].noAchievementSchema=new Date(now+1000).toISOString();assert.equal(selectWork(next,previous,fresh,'full',now).length,3);
 next.games[0].achievements=[];assert.equal(selectWork(next,null,{},'quick',now).length,3);
});
test('freshness cannot suppress another profile and schema precedes progress and rarity',()=>{
 const previous=library(),next=structuredClone(previous),id=next.games[0].appid;previous.steamid64='76561198000000001';
 const fresh={[id]:{noAchievementSchema:new Date().toISOString(),schema:new Date().toISOString(),rarity:new Date().toISOString(),progress:new Date().toISOString()}};
 assert.deepEqual(selectWork(next,previous,fresh,'full').map(x=>x.kind),['schema','progress','rarity']);
 assert.deepEqual(pendingWork([{appid:1,kind:'progress'},{appid:2,kind:'rarity'},{appid:1,kind:'schema'}],{}),[{appid:1,kind:'schema'},{appid:1,kind:'progress'},{appid:2,kind:'rarity'}]);
});
test('empty schema cannot erase saved achievements',()=>{const data=library(),before=structuredClone(data);applyOperation(data,{status:'success',appid:data.games[0].appid,kind:'schema',data:[]});assert.deepEqual(data,before);});
test('known unavailable progress waits a day unless play history changes; schema and rarity remain eligible',()=>{
 const previous=library(),next=structuredClone(previous),id=next.games[0].appid,now=Date.now();
 const f={[id]:{progressUnavailable:new Date(now).toISOString()}};
 assert.deepEqual(selectWork(next,previous,f,'quick',now).map(o=>o.kind),['schema','rarity']);
 assert.deepEqual(selectWork(next,previous,f,'full',now+86400000).map(o=>o.kind),['schema','progress','rarity']);
 next.games[0].playtime_forever_min++;assert.ok(selectWork(next,previous,f,'quick',now).some(o=>o.kind==='progress'));
});
