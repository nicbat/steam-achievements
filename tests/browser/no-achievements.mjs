import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchUi } from './harness.mjs';
const sample = JSON.parse(await fs.readFile('public/demo.json', 'utf8'));
sample.games = sample.games.slice(0, 1).map(g => ({...g,appid:10,name:'Counter-Strike',achievements:[],has_achievements:false,achievements_total:0,achievements_unlocked:0,completion_rate_pct:null}));
const ui = await launchUi(), p = ui.page;
p.setDefaultTimeout(15000);
let starts = 0, batches = 0;
await p.route('**/api/steam/**', async route => {
  if(route.request().method()==='GET') return route.fulfill({json:{enabled:true}});
  if(route.request().url().endsWith('/start')) { starts++; return route.fulfill({json:{ok:true,attempts:2,data:sample,token:'mock',expiresAt:new Date(Date.now()+1800000).toISOString()}}); }
  batches++;
  const ops=route.request().postDataJSON().operations;
  assert.equal(ops[0].kind,'schema');
  // Only schema returned: the browser must prune dependent work even when a
  // response ends before progress/rarity, rather than dispatch another batch.
  return route.fulfill({json:{ok:true,attempts:1,paused:false,results:ops.map(op=>({...op,status:'error',code:op.kind==='schema'?'no_achievement_schema':'unavailable',message:op.kind==='schema'?'Steam returned no achievement schema for this game. Previously saved values are retained.':'Skipped achievement checks because this game has no achievement schema. Previously saved values are retained.',retryable:false}))}});
});
try {
  await p.goto('/'); await p.getByLabel('Steam profile link or SteamID',{exact:true}).fill(sample.steamid64);
  await p.getByRole('button',{name:'Check profile',exact:true}).click();
  await p.getByRole('button',{name:'Start import',exact:true}).waitFor();
  await p.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Import / refresh',exact:true}).click();
  await p.getByRole('button',{name:'Start import',exact:true}).click();
  await p.getByRole('button',{name:'View library',exact:true}).waitFor();
  assert.equal(starts,1); assert.equal(batches,1);
  assert.equal(await p.getByText(/^Resume after/).count(),0);
  assert.equal(await p.getByRole('button',{name:/Import details.*unavailable/}).count(),0);
  const saved=await p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('achievement-atlas',2);r.onsuccess=()=>{const db=r.result,tx=db.transaction('datasets','readonly'),get=tx.objectStore('datasets').get('current');get.onsuccess=()=>resolve(get.result);get.onerror=reject;tx.oncomplete=()=>db.close();};r.onerror=reject;}));
  assert.equal(saved.checkpoint,null); assert.equal(saved.active.games[0].appid,10);
  assert.ok(Number.isFinite(Date.parse(saved.freshness[sample.steamid64]['10'].noAchievementSchema)));
  await p.getByRole('button',{name:/^Import details/}).click(); await p.getByText('3 / 1,000 API calls accounted for.',{exact:false}).waitFor();
  await p.getByRole('region',{name:'Game progress'}).getByText('No achievements',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Diagnostic log',exact:true}).click();
  await p.getByRole('region',{name:'Import activity'}).getByText(/no achievements; remaining checks skipped/).waitFor();
  await p.setViewportSize({width:320,height:800});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await ui.shoot('import-activity-mobile');
  await p.reload(); await p.getByRole('navigation',{name:'Main navigation'}).waitFor();
  assert.equal(starts,1); assert.equal(batches,1); assert.deepEqual(ui.errors,[]);
  console.log(JSON.stringify({result:'No-achievement game completes automatically, dependent calls pruned, actual calls counted, absence cached and reload sends no requests.',shots:ui.shots}));
} catch(error) {console.log({starts,batches,errors:ui.errors});console.log(await p.locator('body').innerText());throw error;} finally {await ui.close();}
