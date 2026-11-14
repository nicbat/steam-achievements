import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchUi } from './harness.mjs';
const sample = JSON.parse(await fs.readFile('public/demo.json', 'utf8'));
sample.games = sample.games.filter(g => g.achievements.length).slice(0, 2);
const blocked = sample.games[0].appid;
const ui = await launchUi(), p = ui.page;
let starts = 0; const batches = [];
const rows = op => { const g = sample.games.find(g => g.appid === op.appid); return g.achievements.map(a => op.kind === 'progress' ? {api_name:a.api_name,name:a.name,description:a.description,unlocked:a.unlocked,unlock_time:a.unlock_time} : op.kind === 'schema' ? {api_name:a.api_name,name:a.name,description:a.description,icon:a.icon,icon_gray:a.icon_gray} : {api_name:a.api_name,global_completion_rate_pct:a.global_completion_rate_pct??0}); };
await p.route('**/api/steam/**', async route => {
  if (route.request().method() === 'GET') return route.fulfill({json:{enabled:true}});
  if (route.request().url().endsWith('/start')) { starts++; return route.fulfill({json:{ok:true,attempts:2,data:sample,token:'mock',expiresAt:new Date(Date.now()+1800000).toISOString()}}); }
  const ops = route.request().postDataJSON().operations; batches.push(ops);
  if (batches.length === 1) return route.fulfill({json:{ok:true,attempts:2,paused:true,results:[{...ops[0],status:'success',data:rows(ops[0])},{...ops[1],status:'error',code:'steam_access_denied',message:'Steam denied access (403).',retryable:true}]}});
  return route.fulfill({json:{ok:true,attempts:ops.length,paused:false,results:ops.map(op=>({...op,status:'success',data:rows(op)}))}});
});
try {
  await p.goto('/'); await p.getByLabel('Steam profile link or SteamID',{exact:true}).fill(sample.steamid64);
  await p.getByRole('button',{name:'Check profile',exact:true}).click(); await p.getByRole('button',{name:'Start import',exact:true}).click();
  await p.getByRole('button',{name:'Skip this game',exact:true}).waitFor();
  assert.equal(batches.length,1);
  await p.reload(); await p.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Import / refresh',exact:true}).click(); await p.getByRole('button',{name:'Skip this game',exact:true}).waitFor(); assert.equal(batches.length,1);
  await p.getByRole('button',{name:'Skip this game',exact:true}).click(); await p.getByRole('button',{name:'Go back',exact:true}).click();
  await p.getByRole('button',{name:'Skip this game',exact:true}).click(); await p.getByRole('button',{name:'Skip game',exact:true}).click();
  await p.getByRole('button',{name:'Skip this game',exact:true}).waitFor({state:'hidden'}); assert.equal(batches.length,1);
  await p.getByRole('button',{name:/^Import details/}).click(); await p.getByText('4 / 1,000 API calls accounted for.',{exact:false}).waitFor();
  await p.getByRole('button',{name:'Resume import',exact:true}).click(); await p.getByRole('button',{name:'View library',exact:true}).waitFor();
  assert.equal(starts,1); assert.equal(batches.length,2); assert.ok(batches[1].every(op=>op.appid!==blocked));
  assert.deepEqual(ui.errors,[]);
  console.log('Game denial: reload retains skip, cancel is safe, skip makes no calls, ledger retained, explicit resume imports other games.');
} catch (error) { console.log(await p.locator('body').innerText()); console.log({starts,batchCount:batches.length,errors:ui.errors}); throw error; } finally { await ui.close(); }
