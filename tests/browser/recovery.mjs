import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {launchUi} from './harness.mjs';
const source=JSON.parse(await fs.readFile('public/demo.json','utf8'));
const sample=structuredClone(source);sample.player.persona_name='Test library';sample.games=[structuredClone(source.games.find(g=>g.achievements.length>=3))];const game=sample.games[0];game.achievements=game.achievements.slice(0,3).map((a,i)=>({...a,unlocked:i===0,unlock_time:i===0?a.unlock_time:null}));game.achievements_total=3;game.achievements_unlocked=1;game.completion_rate_pct=100/3;sample.totals.owned_games=1;sample.totals.total_achievements=3;sample.totals.total_achievements_unlocked=1;
await fs.writeFile('/tmp/atlas-test-library.json',JSON.stringify(sample));
const ui=await launchUi();const p=ui.page;const checks=[];let posts=[];

let limited=true,hold=false,release;
await p.route('**/api/steam/**',async route=>{
 const req=route.request();if(req.method()==='GET')return route.fulfill({json:{enabled:true}});
 const body=req.postDataJSON();posts.push({path:new URL(req.url()).pathname,body});
 if(req.url().endsWith('/start'))return route.fulfill({json:{ok:true,attempts:2,data:{...sample,games:sample.games.map(g=>({...g,achievements:[],achievements_total:0,achievements_unlocked:0,has_achievements:false,completion_rate_pct:null}))},token:'mock',expiresAt:new Date(Date.now()+1800000).toISOString()}});
 if(hold)await new Promise(r=>release=r);
 if(limited)return route.fulfill({status:429,json:{ok:false,attempts:1,code:'rate_limited',message:'Steam is temporarily limiting requests.',retryAfterSeconds:0}});
 return route.fulfill({json:{ok:true,attempts:body.operations.length,paused:false,results:body.operations.map(o=>({...o,status:'success',data:game.achievements.map(a=>o.kind==='progress'?{api_name:a.api_name,name:a.name,description:a.description,unlocked:a.unlocked,unlock_time:a.unlock_time}:o.kind==='schema'?{api_name:a.api_name,name:a.name,description:a.description,icon:a.icon,icon_gray:a.icon_gray}:{api_name:a.api_name,global_completion_rate_pct:a.global_completion_rate_pct??10})}))}});
});
async function nav(name){await p.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click()}
try{
 await p.goto('/');await p.getByRole('button',{name:'Explore demo',exact:true}).waitFor();
 await p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('achievement-atlas',2);r.onsuccess=()=>{const db=r.result,tx=db.transaction('datasets','readwrite');tx.objectStore('datasets').put({broken:true},'current');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=reject}}));
 await p.reload();await p.getByRole('button',{name:'Reset damaged storage…',exact:true}).waitFor();
 const downloadPromise=p.waitForEvent('download');await p.getByRole('button',{name:'Export recovery data',exact:true}).click();const download=await downloadPromise;assert.equal(JSON.parse(await fs.readFile(await download.path(),'utf8')).dataset.broken,true);
 await p.getByRole('button',{name:'Reset damaged storage…',exact:true}).click();await p.getByRole('button',{name:'Keep data',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Reset damaged storage…',exact:true}).count(),1);
 await p.getByRole('button',{name:'Reset damaged storage…',exact:true}).click();await p.getByRole('button',{name:'Reset browser storage',exact:true}).click();await p.getByText('Browser storage reset. You can now restore a valid backup.',{exact:true}).waitFor();checks.push('Corrupt storage exports raw recovery, cancel preserves it, explicit reset succeeds');
 await p.getByLabel('Steam profile link or SteamID',{exact:true}).fill(sample.steamid64);await p.getByRole('button',{name:'Check profile',exact:true}).click();await p.getByRole('button',{name:'Start import',exact:true}).waitFor();
 await p.evaluate(()=>{const original=IDBObjectStore.prototype.put;window.failSave=true;IDBObjectStore.prototype.put=function(...args){if(window.failSave&&this.name==='datasets')throw new DOMException('Test quota','QuotaExceededError');return original.apply(this,args)}});
 await p.getByRole('button',{name:'Start import',exact:true}).click();await p.getByText('Changes could not be saved',{exact:true}).waitFor();assert.equal(posts.length,1);checks.push('Quota failure stops batch dispatch and shows recovery actions');
 await p.evaluate(()=>{const original=IDBObjectStore.prototype.get;window.failRead=true;IDBObjectStore.prototype.get=function(...args){if(window.failRead&&this.name==='datasets')throw new DOMException('Test unavailable storage','UnknownError');return original.apply(this,args)}});
 await p.getByRole('button',{name:'Discard unsaved changes and reload',exact:true}).click();await p.getByRole('button',{name:'Discard and reload saved data',exact:true}).click();await p.getByText('Changes could not be saved',{exact:true}).waitFor();await p.getByText('Action needed',{exact:true}).waitFor();checks.push('Failed reload preserves the unsaved recovery controls and storage error');
 await p.evaluate(()=>window.failRead=false);
 await p.evaluate(()=>window.failSave=false);await p.getByRole('button',{name:'Retry saving',exact:true}).first().click();await p.getByRole('button',{name:'Resume import',exact:true}).waitFor();
 hold=true;await p.getByRole('button',{name:'Resume import',exact:true}).click();await p.waitForFunction(()=>document.body.innerText.includes('Pause import'));
 const dialogPromise=p.waitForEvent('dialog');const reloadPromise=p.reload({timeout:5000}).catch(()=>{});const dialog=await dialogPromise;assert.equal(dialog.type(),'beforeunload');await dialog.dismiss();await reloadPromise;checks.push('Actual browser leave prompt appears during request and cancellation keeps tab');
 hold=false;release();await p.getByText('Steam is temporarily limiting requests.',{exact:false}).first().waitFor();await new Promise(r=>setTimeout(r,1200));assert.equal(posts.length,2);checks.push('429 pauses without automatic retry');
 await p.reload();await nav('Import / refresh');await p.getByRole('button',{name:'Resume import',exact:true}).waitFor();assert.equal(posts.length,2);limited=false;await p.getByRole('button',{name:'Resume import',exact:true}).click();await p.getByRole('button',{name:'View library',exact:true}).waitFor({timeout:20000});assert.equal(posts.length,3);checks.push('Checkpoint reload makes no request; explicit resume completes');
 await nav('Data & backups');await p.getByRole('button',{name:'Delete local data…',exact:true}).click();await p.getByRole('alertdialog').getByRole('button',{name:'Delete local data',exact:true}).click();await p.getByRole('button',{name:'Explore demo',exact:true}).waitFor();await p.reload();await p.getByRole('button',{name:'Explore demo',exact:true}).waitFor();assert.equal(posts.length,3);checks.push('Confirmed deletion persists through reload without resurrection');
 console.log(JSON.stringify({checks,errors:ui.errors,steamPosts:posts.length},null,2));assert.deepEqual(ui.errors,['Failed to load resource: the server responded with a status of 429 (Too Many Requests)']);
}catch(e){console.log('FAIL',e.message,(await p.locator('body').innerText()).slice(0,7000));await ui.shoot('recovery-failure',{fullPage:true});throw e}finally{await ui.close()}
