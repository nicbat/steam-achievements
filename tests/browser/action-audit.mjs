import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {launchUi} from './harness.mjs';
const ui=await launchUi(),p=ui.page;p.setDefaultTimeout(10000);
const sample=JSON.parse(await fs.readFile('public/demo.json','utf8'));sample.games=sample.games.slice(0,2);
let starts=0,batches=0;
await p.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('Test clipboard denial')}}}));
await p.route('**/api/steam/**',r=>{
 if(r.request().method()==='GET')return r.fulfill({json:{enabled:true}});
 if(r.request().url().endsWith('/start')){starts++;return r.fulfill({json:{ok:true,attempts:2,data:sample,token:'mock',expiresAt:new Date(Date.now()+1800000).toISOString()}});}
 batches++;const ops=r.request().postDataJSON().operations;
 return r.fulfill({json:{ok:true,paused:false,attempts:ops.length,results:ops.map(op=>({...op,status:'success',data:sample.games.find(g=>g.appid===op.appid).achievements.map(a=>op.kind==='progress'?{api_name:a.api_name,name:a.name,description:a.description,unlocked:a.unlocked,unlock_time:a.unlock_time}:op.kind==='schema'?{api_name:a.api_name,name:a.name,description:a.description,icon:a.icon,icon_gray:a.icon_gray}:{api_name:a.api_name,global_completion_rate_pct:a.global_completion_rate_pct??0})}))}});
});
const nav=name=>p.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();
try{
 await p.goto('/');await p.getByRole('button',{name:'Explore demo',exact:true}).click();await nav('Library');
 await p.getByRole('button',{name:'Portal 2',exact:true}).click();await p.getByLabel('Search game achievements',{exact:true}).fill('does-not-match');
 await p.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal(await p.getByLabel('Search game achievements',{exact:true}).inputValue(),'');
 await p.getByLabel('Search game achievements',{exact:true}).fill('does-not-match');await p.keyboard.press('Escape');
 await p.getByRole('button',{name:'Subnautica',exact:true}).click();assert.equal(await p.getByLabel('Search game achievements',{exact:true}).inputValue(),'');
 assert.ok(await p.getByRole('dialog').getByRole('article').count()>0);await p.keyboard.press('Escape');
 await nav('How it works');await p.getByRole('button',{name:'Collector instructions',exact:true}).click();
 await p.getByLabel('API key',{exact:true}).fill('00000000000000000000000000000000');await p.getByLabel('Steam profile',{exact:true}).fill('test-profile');
 await p.getByRole('button',{name:'Copy command',exact:true}).click();await p.getByText('Could not copy. Select the command below and copy it manually.',{exact:true}).waitFor();
 const chooserPromise=p.waitForEvent('filechooser');await p.getByRole('button',{name:'Open data file',exact:true}).click();const chooser=await chooserPromise;
 await chooser.setFiles({name:'library.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sample))});
 await p.getByRole('dialog',{name:'Review library file'}).waitFor();await p.getByRole('button',{name:'Replace saved data',exact:true}).click();
 await p.getByRole('heading',{name:'Overview',exact:true}).waitFor();await p.getByRole('button',{name:'Refresh library',exact:true}).click();
 await p.getByRole('button',{name:'Full recheck',exact:true}).click();await p.getByRole('button',{name:'Start import',exact:true}).click();
 await p.getByRole('button',{name:'View library',exact:true}).click();await p.getByRole('heading',{name:'Overview',exact:true}).waitFor();
 await p.getByRole('button',{name:'Refresh library',exact:true}).click();await p.getByRole('button',{name:'Full recheck',exact:true}).waitFor();
 assert.equal(starts,1);assert.equal(batches,1);
 await p.getByRole('button',{name:'Full recheck',exact:true}).click();await p.getByText(/Refresh is available after/).waitFor();assert.equal(starts,1);
 await p.getByRole('button',{name:'Reset local refresh cooldown',exact:true}).click();
 await p.getByText('Local refresh cooldown reset. Choose Quick refresh or Full recheck when ready.',{exact:true}).waitFor();
 assert.equal(starts,1);assert.equal(batches,1);
 await ui.shoot('local-cooldown-reset');
 await p.getByRole('button',{name:'Full recheck',exact:true}).click();
 await p.getByRole('button',{name:'Start import',exact:true}).waitFor();
 assert.equal(starts,2);assert.equal(batches,1);
 assert.deepEqual(ui.errors,[]);
 console.log('Action audit passed: detail filter recovery/reset; collector clipboard failure and real file chooser; refresh after completion and visible cooldown without extra requests.');
}finally{await ui.close()}
