// Local-only convenience launcher. Never exposes or writes the Steam key.
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
const env = { ...process.env };
let key = env.STEAM_API_KEY || env.STEAM_WEB_API_KEY;
for (const path of ['collector/key.env', 'key.env']) {
  if (key) break;
  try {
    const contents = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    key = contents.match(/^\s*(?:export\s+)?(?:STEAM_WEB_API_KEY|STEAM_API_KEY)\s*=\s*["']?([a-fA-F0-9]{32})["']?\s*(?:#.*)?$/m)?.[1];
  } catch (error) { if (error.code !== 'ENOENT') throw new Error(`Could not read ${path}.`); }
}
if (!key) {
  console.error('No local Steam key found. Set STEAM_API_KEY or place it in collector/key.env. Use npm run dev for demo/file-only testing.');
  process.exit(1);
}
env.STEAM_API_KEY = key;
env.STEAM_IMPORT_ENABLED = 'true';
if (!env.STEAM_IMPORT_SIGNING_SECRET) {
  const secretPath = new URL('../.steam-import-secret.local', import.meta.url);
  try { env.STEAM_IMPORT_SIGNING_SECRET = (await readFile(secretPath, 'utf8')).trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Could not read the local signing secret.');
    const secret = randomBytes(32).toString('hex');
    try { await writeFile(secretPath, secret, { flag: 'wx', mode: 0o600 }); env.STEAM_IMPORT_SIGNING_SECRET = secret; }
    catch (error) {
      if (error.code !== 'EEXIST') throw new Error('Could not save the local signing secret.');
      env.STEAM_IMPORT_SIGNING_SECRET = (await readFile(secretPath, 'utf8')).trim();
    }
  }
}
if (env.STEAM_IMPORT_SIGNING_SECRET.length < 32) throw new Error('The signing secret must contain at least 32 characters.');
console.log('Local Steam imports enabled on http://127.0.0.1:5188. Steam calls start only after your explicit actions.');
const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], { cwd: new URL('../', import.meta.url), env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Could not start the development server.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
