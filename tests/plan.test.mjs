import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
async function moduleUrl(file, deps={}) { let {outputText}=ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.ESNext}});for(const [name,url]of Object.entries(deps))outputText=outputText.replace(JSON.stringify(name),JSON.stringify(url));return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`; }
const steam=await moduleUrl('../src/lib/steam.ts');
const {projectAverage,parsePlanJson}=await import(await moduleUrl('../src/lib/plan.ts',{'./steam':steam}));
const game={appid:1,name:'Game',has_achievements:true,achievements_total:4,achievements_unlocked:1,achievements:[{api_name:'done',unlocked:true},{api_name:'next',unlocked:false},{api_name:'third',unlocked:false},{api_name:'fourth',unlocked:false}]};
const item=apiName=>({kind:'achievement',appid:1,game:'Game',apiName,name:apiName});
test('projection ignores duplicates, unlocked and missing targets after refresh',()=>{assert.equal(projectAverage([game],[item('next'),item('next'),item('done'),item('missing')]).mean,50);});
test('empty and malformed plan input fails safely',()=>{assert.throws(()=>parsePlanJson('null'),/Not an Achievement/);assert.deepEqual(parsePlanJson(JSON.stringify({items:[null,{kind:'achievement',appid:NaN,game:'x',apiName:'x',name:'x'}]})),[]);});
