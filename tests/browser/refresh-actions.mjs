import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchUi } from './harness.mjs';
const sample=JSON.parse(await fs.readFile('public/demo.json','utf8'));
sample.games=sample.games.slice(0,2);
const ui=await launchUi(),p=ui.page;
let starts=0,batches=0;
await p.route('**/api/steam/**',route=>{
 if(route.request().method()==='GET')return route.fulfill({json:{enabled:true}});
 if(route.request().url().endsWith('/start')){starts++;return route.fulfill({json:{ok:true,attempts:2,data:sample,token:'mock',expiresAt:new Date(Date.now()+1800000).toISOString()}});}
 batches++;return route.fulfill({status:500,json:{ok:false}});
});
async function checkpoint(){return p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('achievement-atlas',2);r.onsuccess=()=>{const db=r.result,tx=db.transaction('datasets','readonly'),get=tx.objectStore('datasets').get('current');get.onsuccess=()=>resolve(get.result.checkpoint);get.onerror=reject;tx.oncomplete=()=>db.close();};r.onerror=reject;}));}
try{
 await p.goto('/');await p.getByRole('button',{name:'Explore demo',exact:true}).waitFor();
 await p.locator('input[type=file]').first().setInputFiles({name:'library.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sample))});
 await p.getByRole('button',{name:'Replace saved data',exact:true}).click();await p.getByRole('heading',{name:'Overview',exact:true}).waitFor();
 await p.getByRole('button',{name:'Refresh library',exact:true}).click();
 await p.getByRole('button',{name:'Full recheck',exact:true}).click();
 await p.getByRole('button',{name:'Start import',exact:true}).waitFor({timeout:5000});
 assert.equal(starts,1);assert.equal(batches,0);
 const full=await checkpoint();assert.equal(full.mode,'full');assert.equal(full.selected.length,2);
 await p.getByText('Full recheck checks every game. Review the work below before starting.',{exact:true}).waitFor();
 await ui.shoot('full-recheck-review');
 await p.getByRole('button',{name:'Discard import progress',exact:true}).click();
 await p.getByRole('alertdialog').getByRole('button',{name:'Discard import progress',exact:true}).click();
 await p.getByLabel('Steam profile link or SteamID',{exact:true}).fill('');
 await p.getByRole('button',{name:'Full recheck',exact:true}).click();assert.equal(starts,1);
 await p.getByLabel('Steam profile link or SteamID',{exact:true}).fill(sample.steamid64);
 await p.setViewportSize({width:320,height:900});
 await p.getByRole('button',{name:'Quick refresh',exact:true}).click();
 await p.getByRole('button',{name:'Start import',exact:true}).waitFor();
 assert.equal((await checkpoint()).mode,'quick');assert.equal(starts,2);assert.equal(batches,0);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(ui.errors,[]);
 console.log(JSON.stringify({result:'Full recheck and Quick refresh directly open review with the correct mode; empty input is validated; no achievement batches start before confirmation.',shots:ui.shots}));
}finally{await ui.close();}
