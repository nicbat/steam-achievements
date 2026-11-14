import assert from 'node:assert/strict';
import { launchUi } from './harness.mjs';
const ui = await launchUi();
try {
  const p = ui.page;
  await p.route('**/api/steam/**', route => route.fulfill({ json: { enabled: false } }));
  await p.goto('/');
  await p.getByRole('button', { name: 'Explore demo', exact: true }).click();
  const nav = p.getByRole('navigation', { name: 'Main navigation' });
  for (const width of [1440, 390, 320]) {
    await p.setViewportSize({ width, height: 900 });
    for (const name of ['Library', 'Overview']) {
      const selected = nav.getByRole('button', { name, exact: true });
      if (width > 900) await selected.click();
      else await p.getByLabel('Go to', { exact: true }).selectOption({ label: name });
      await p.getByRole('heading', { name, exact: true }).waitFor();
      // Move away: hover previously masked the missing selected appearance.
      await p.mouse.move(width - 5, 880);
      await p.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
      assert.equal(await p.locator('.sidebar [aria-current="page"]').count(), 1);
      const item = p.locator('.sidebar button').filter({ hasText: new RegExp(`^${name}$`) });
      assert.equal(await item.getAttribute('aria-current'), 'page');
      const appearance = await item.evaluate(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color, alignment: style.justifyContent };
      });
      assert.equal(appearance.background, 'rgb(52, 71, 95)');
      assert.equal(appearance.color, 'rgb(240, 244, 248)');
      assert.ok(['flex-start', 'flow-start'].includes(appearance.alignment));
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
  assert.deepEqual(ui.errors, []);
  console.log('Navigation selection stays visible without hover at desktop, 390px and 320px.');
} finally {
  await ui.close();
}
