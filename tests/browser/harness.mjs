import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export async function launchUi({ video = false } = {}) {
  const baseURL = process.env.UI_BASE_URL || 'http://127.0.0.1:5188';
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) throw Error('Browser tests must target a local server.');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...(video ? {recordVideo:{dir:path.join(os.tmpdir(),'atlas-browser-videos')}} : {}), baseURL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(), errors = [], shots = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return { page, context, errors, shots, async shoot(name, options = {}) {
    const dir = path.join(os.tmpdir(), 'atlas-browser-tests'); await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${name}.png`); await page.screenshot({ path: file, ...options }); shots.push(file); return file;
  }, async close() { await context.close(); const recording = video ? await page.video().path() : null; await browser.close(); return recording; } };
}
