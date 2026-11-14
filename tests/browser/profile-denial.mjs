import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchUi } from './harness.mjs';
const sample = JSON.parse(await fs.readFile('public/demo.json', 'utf8'));
sample.games = sample.games.slice(0, 1);
const ui = await launchUi(), p = ui.page;
let lookups = 0, batches = 0;
await p.route('**/api/steam/**', async route => {
  if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true } });
  if (route.request().url().endsWith('/batch')) { batches++; return route.abort(); }
  lookups++;
  if (lookups === 1) return route.fulfill({ status: 502, json: { ok: false, code: 'steam_access_denied', attempts: 1, message: 'Steam denied access while checking your game library. Try again later.' } });
  return route.fulfill({ json: { ok: true, attempts: 2, data: sample, token: 'mock', expiresAt: new Date(Date.now() + 1800000).toISOString() } });
});
try {
  await p.goto('/');
  await p.getByLabel('Steam profile link or SteamID', { exact: true }).fill(`https://steamcommunity.com/profiles/${sample.steamid64}`);
  await p.getByRole('button', { name: 'Check profile', exact: true }).click();
  await p.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  assert.equal(lookups, 1); assert.equal(batches, 0);
  await ui.shoot('profile-denial', { fullPage: true });
  await p.getByRole('button', { name: 'Try again', exact: true }).click();
  await p.getByRole('button', { name: 'Start import', exact: true }).waitFor();
  assert.equal(lookups, 2); assert.equal(batches, 0);
  await ui.shoot('concise-import-review', { fullPage: true });
  await p.setViewportSize({ width: 320, height: 800 });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ui.shoot('concise-import-review-mobile', { fullPage: true });
  await p.getByRole('button', { name: 'Import details', exact: true }).click();
  await p.getByText('3 / 1,000 API calls accounted for.', { exact: false }).waitFor();
  assert.deepEqual(ui.errors, ['Failed to load resource: the server responded with a status of 502 (Bad Gateway)']);
  console.log(JSON.stringify({ result: 'Profile denial recovers only on explicit retry; accumulated calls retained; review starts no batches; mobile fits', shots: ui.shots }));
} finally { await ui.close(); }
