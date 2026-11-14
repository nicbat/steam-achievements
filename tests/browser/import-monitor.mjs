import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchUi } from './harness.mjs';
const sample=JSON.parse(await fs.readFile('public/demo.json','utf8'));
const originals=sample.games.filter(g=>g.achievements.length);
sample.games=Array.from({length:6},(_,i)=>({...structuredClone(originals[i%originals.length]),appid:i+1}));
const ui=await launchUi(),p=ui.page;p.setDefaultTimeout(15000);
let release;const gate=new Promise(r=>release=r);let notify;const started=new Promise(r=>notify=r);let batches=0;
const rows=op=>sample.games.find(g=>g.appid===op.appid).achievements.map(a=>op.kind==='progress'?{api_name:a.api_name,name:a.name,description:a.description,unlocked:a.unlocked,unlock_time:a.unlock_time}:op.kind==='schema'?{api_name:a.api_name,name:a.name,description:a.description,icon:a.icon,icon_gray:a.icon_gray}:{api_name:a.api_name,global_completion_rate_pct:a.global_completion_rate_pct??0});
await p.route('**/api/steam/**',async route=>{
 if(route.request().method()==='GET')return route.fulfill({json:{enabled:true}});
 if(route.request().url().endsWith('/start'))return route.fulfill({json:{ok:true,attempts:2,data:sample,token:'mock',expiresAt:new Date(Date.now()+1800000).toISOString()}});
 const ops=route.request().postDataJSON().operations;batches++;
 assert.equal(new Set(ops.map(o=>o.appid)).size,3);
 if(batches===1){notify();await gate;}
 return route.fulfill({json:{ok:true,attempts:ops.length,paused:false,results:ops.map(op=>({...op,status:'success',data:rows(op)}))}});
});
try{
 await p.goto('/');await p.getByLabel('Steam profile link or SteamID',{exact:true}).fill(sample.steamid64);
 await p.getByRole('button',{name:'Check profile',exact:true}).click();await p.getByRole('button',{name:'Start import',exact:true}).waitFor();
 await p.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Import / refresh',exact:true}).click();
 await p.getByRole('button',{name:'Start import',exact:true}).click();await started;
 await ui.shoot('monitor-running-desktop');
 await p.getByRole('button',{name:'Pause import',exact:true}).click();
 const pausing=p.getByRole('button',{name:'Pausing…',exact:true});await pausing.waitFor();assert.ok(await pausing.isDisabled());
 assert.equal(batches,1);await ui.shoot('monitor-pausing-desktop');
 release();await p.getByRole('button',{name:'Resume import',exact:true}).waitFor();assert.equal(batches,1);
 await p.reload();await p.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Import / refresh',exact:true}).click();
 await p.getByRole('button',{name:'Resume import',exact:true}).waitFor();assert.equal(batches,1);
 await p.setViewportSize({width:320,height:800});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await ui.shoot('monitor-paused-mobile');
 await p.getByRole('button',{name:'Resume import',exact:true}).click();await p.getByRole('button',{name:'View library',exact:true}).waitFor();
 assert.equal(batches,2);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await ui.shoot('monitor-complete-mobile');assert.deepEqual(ui.errors,[]);
 console.log(JSON.stringify({result:'Driven running, pause during in-flight work, reload, explicit resume, completion and320px layout; zero real Steam calls.',shots:ui.shots}));
}catch(e){console.log(await p.locator('body').innerText());throw e;}finally{release();await ui.close();}
