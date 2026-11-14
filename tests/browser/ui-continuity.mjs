import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchUi } from './harness.mjs';
const ui = await launchUi(), p = ui.page;
p.setDefaultTimeout(10000);
await p.route('**/api/steam/**', r => r.fulfill({json:{enabled:false}}));
async function nav(label) {
  if(p.viewportSize().width > 900) await p.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:label,exact:true}).click();
  else await p.getByLabel('Go to',{exact:true}).selectOption({label});
  await p.getByRole('heading',{name:label,exact:true}).waitFor();
  assert.equal(await p.locator('#view-title').evaluate(e=>e===document.activeElement),true);
}
try {
  await p.goto('/');
  await p.keyboard.press('Tab');
  const skip=p.getByRole('link',{name:'Skip to content'});
  assert.ok((await skip.boundingBox()).width>1);
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.getByRole('button',{name:'Explore demo',exact:true}).click();
  const artwork = p.locator('.game-artwork').first();
  const artworkBefore = await artwork.boundingBox();
  await p.locator('.game-artwork img').evaluateAll(images => images.forEach(img => img.dispatchEvent(new Event('error'))));
  assert.deepEqual(await artwork.boundingBox(), artworkBefore);
  assert.equal(await p.getByRole('button',{name:'Use my profile',exact:true}).evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  await nav('Library');
  await p.getByLabel('Search games',{exact:true}).fill('Portal');
  await p.getByLabel('Sort games',{exact:true}).selectOption('name');
  await p.getByRole('button',{name:'Sort descending',exact:true}).click();
  await nav('Overview'); await nav('Library');
  assert.equal(await p.getByLabel('Search games',{exact:true}).inputValue(),'Portal');
  assert.equal(await p.getByLabel('Sort games',{exact:true}).inputValue(),'name');
  await p.getByRole('button',{name:'Sort ascending',exact:true}).waitFor();
  await p.getByRole('button',{name:'Portal 2',exact:true}).click();
  await p.getByRole('dialog').waitFor();
  await p.getByRole('dialog').getByRole('button',{name:/^Add .+ to plan$/}).first().click();
  await p.keyboard.press('Escape'); await nav('My plan');
  assert.equal(await p.getByRole('button',{name:'Close plan',exact:true}).count(),0);
  await nav('Library'); assert.equal(await p.getByLabel('Search games',{exact:true}).inputValue(),'Portal');
  await p.getByLabel('Search games',{exact:true}).fill('');
  await p.getByRole('navigation',{name:'Games pages'}).getByRole('button',{name:/next/i}).click();
  await nav('Overview');await nav('Library');await p.getByText('Page 2 of 5',{exact:true}).waitFor();
  await nav('Achievements');
  await p.getByLabel('Search achievements, descriptions, or games',{exact:true}).fill('Portal');
  await p.getByLabel('Sort achievements',{exact:true}).selectOption('game');
  await nav('My plan');await nav('Achievements');
  assert.equal(await p.getByLabel('Search achievements, descriptions, or games',{exact:true}).inputValue(),'Portal');
  assert.equal(await p.getByLabel('Sort achievements',{exact:true}).inputValue(),'game');
  for (const width of [390,320]) {
    await p.setViewportSize({width,height:900});
    await nav('Library'); await p.getByLabel('Search games',{exact:true}).fill('Portal 2');
    await p.getByRole('button',{name:/remaining achievements for Portal 2/}).waitFor();
    for(const label of ['Library','Achievements']) {
      await nav(label);
      const overflow=await p.locator('.responsive-data').evaluate(e=>[...e.querySelectorAll('td,button')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth||r.left<0)}).length);
      assert.equal(overflow,0,`${label} controls fit at ${width}px`);
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await ui.shoot(`repaired-${label.toLowerCase()}-${width}`);
    }
    await p.getByLabel('Search achievements, descriptions, or games',{exact:true}).fill('no-such-achievement-xyz');
    await p.getByRole('button',{name:'Clear filters',exact:true}).click();
    assert.equal(await p.getByLabel('Search achievements, descriptions, or games',{exact:true}).inputValue(),'');
  }
  await p.setViewportSize({width:1440,height:900});
  await nav('My plan'); await p.getByRole('button',{name:'Pin on desktop',exact:true}).click();
  assert.equal(await p.getByRole('complementary').count(),0);
  await nav('Overview');
  await p.getByRole('complementary').waitFor();
  const projection=await p.locator('.overview-projection').evaluate(e=>({direction:getComputedStyle(e).flexDirection,font:getComputedStyle(e).fontSize}));
  assert.equal(projection.direction,'row');
  assert.notEqual(projection.font,'30px');
  await p.getByRole('button',{name:'Close plan',exact:true}).click();
  await p.getByRole('button',{name:/^Plan \(/}).click(); await p.getByRole('dialog').waitFor();
  assert.equal(await p.getByRole('dialog').getByRole('heading',{level:2}).count(),1);
  await p.keyboard.press('Escape');
  // Returning from sample to onboarding resets both views, even for the same sample profile.
  await p.getByRole('button',{name:'Use my profile',exact:true}).click();
  await p.getByRole('button',{name:'Explore demo',exact:true}).click();await nav('Library');
  assert.equal(await p.getByLabel('Search games',{exact:true}).inputValue(),'');
  const fixture=JSON.parse(await fs.readFile('public/demo.json','utf8'));
  fixture.games[0].name='A very long game title with expansions and a complete collection edition '.repeat(3);
  fixture.games[0].last_played=null;
  await p.locator('input[type=file]').first().setInputFiles({name:'long-library.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await p.getByRole('button',{name:'Replace saved data',exact:true}).click();
  await p.getByRole('heading',{name:'Overview',exact:true}).waitFor();
  await nav('Library');assert.equal(await p.getByLabel('Search games',{exact:true}).inputValue(),'');
  await p.setViewportSize({width:320,height:900});
  await p.getByLabel('Search games',{exact:true}).fill('A very long game title');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.getByRole('button',{name:fixture.games[0].name,exact:true}).click();
  await p.getByRole('dialog').waitFor();
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.keyboard.press('Escape');
  assert.equal(await p.getByLabel('Search games',{exact:true}).inputValue(),'A very long game title');
  assert.deepEqual(ui.errors,[]);
  console.log(JSON.stringify({result:'Search/sort/page continuity, game-to-plan flow, mobile record/actions, empty recovery, plan page/sheet/dock and profile-mode reset passed.',shots:ui.shots}));
} catch(error) { console.log(ui.errors); console.log(await p.locator("body").innerText()); throw error; } finally { await ui.close(); }
