import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchUi } from './harness.mjs';
const sample=JSON.parse(await fs.readFile('public/demo.json','utf8'));
const original=sample.games.find(g=>g.achievements.length>3);
sample.games=Array.from({length:24},(_,i)=>({...structuredClone(original),appid:i+1,name:`Import test game ${i+1}`}));
const ui=await launchUi({video:true}),p=ui.page;
p.setDefaultTimeout(15000);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const gates=Array.from({length:3},deferred),started=Array.from({length:3},deferred);
let batches=0;
await p.route('**/api/steam/**',async route=>{
 if(route.request().method()==='GET')return route.fulfill({json:{enabled:true}});
 if(route.request().url().endsWith('/start'))return route.fulfill({json:{ok:true,attempts:2,data:sample,token:'mock',expiresAt:new Date(Date.now()+1800000).toISOString()}});
 const index=batches++,ops=route.request().postDataJSON().operations;
 if(index<3){started[index].resolve();await gates[index].promise;}
 const results=ops.filter(op=>op.appid!==1||op.kind==='schema').map(op=>op.appid===1?{...op,status:'error',code:'no_achievement_schema',message:'No achievement schema.',retryable:false}:{...op,status:'success',data:original.achievements.map(a=>op.kind==='progress'?{api_name:a.api_name,name:a.name,description:a.description,unlocked:a.unlocked,unlock_time:a.unlock_time}:op.kind==='schema'?{api_name:a.api_name,name:a.name,description:a.description,icon:a.icon,icon_gray:a.icon_gray}:{api_name:a.api_name,global_completion_rate_pct:a.global_completion_rate_pct??0})});
 return route.fulfill({json:{ok:true,attempts:results.length,paused:false,results}});
});
try{
 await p.goto('/');await p.getByLabel('Steam profile link or SteamID',{exact:true}).fill(sample.steamid64);
 await p.getByRole('button',{name:'Check profile',exact:true}).click();await p.getByRole('button',{name:'Start import',exact:true}).click();
 await started[0].promise;
 const list=p.getByRole('region',{name:'Selected games'});
 assert.equal(await list.evaluate(e=>e.scrollTop),0);
 const pause=p.getByRole('button',{name:'Pause import',exact:true});
 const before=await pause.boundingBox();await pause.click();
 const pausing=p.getByRole('button',{name:'Pausing…',exact:true});
 const after=await pausing.boundingBox();assert.equal(after.width,before.width);assert.equal(after.y,before.y);
 gates[0].resolve();await p.getByRole('button',{name:'Resume import',exact:true}).waitFor();
 await p.getByText('No achievements',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Resume import',exact:true}).click();await started[1].promise;
 // A user inspecting earlier games disables following. A new batch must not pull them away.
 await list.dispatchEvent('wheel',{deltaY:-100});await list.evaluate(e=>e.scrollTop=0);
 gates[1].resolve();await started[2].promise;
 assert.equal(await list.evaluate(e=>e.scrollTop),0);
 await p.getByRole('button',{name:'Show current games',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('[aria-label="Selected games"]').scrollTop>0);
 await ui.shoot('import-follow-restored');
 gates[2].resolve();await p.getByRole('button',{name:'View library',exact:true}).waitFor();
 assert.equal(batches,8);assert.deepEqual(ui.errors,[]);
 console.log(JSON.stringify({result:'24 games, mixed no-achievements, stable pause button, manual scrolling retained across batches, explicit follow and completion passed.',shots:ui.shots}));
}catch(error){console.log({batches,errors:ui.errors});console.log(await p.locator('body').innerText());throw error;}finally{gates.forEach(g=>g.resolve());console.log('VIDEO',await ui.close());}
