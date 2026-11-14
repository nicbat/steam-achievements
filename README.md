# Achievement Atlas

A SvelteKit dashboard for Steam achievements, library stats, and completion plans.
The interface uses shadcn-svelte primitives and a shared blue/gold theme. A minimal
backend makes bounded Steam requests; your library, plans, preferences, and import
checkpoints stay in your browser. No database, Cloudflare, account, or cloud sync.

## Try it locally

Requires Node 22.12+ (Vercel project targets Node 24).

```bash
npm ci
npm run dev:local
```

Open **http://127.0.0.1:5188**. The local launcher reads `STEAM_API_KEY`,
`STEAM_WEB_API_KEY`, `collector/key.env`, or `key.env`, without printing the key.
It keeps a server-only signing secret in the ignored `.steam-import-secret.local`
file so checkpoints survive local restarts, and binds to localhost. Keep that file private.
Use `npm run dev` for demo/file-only mode without a key. Do not run multiple dev
servers against the same checkout. Keep the same hostname and port to retain browser data.

Start with **Explore demo**, open a collector JSON file, or check a public Steam
profile. Profile checking costs up to three Steam calls and shows a review before
achievement import begins. New batches pause when the tab is hidden. Reloading never
starts Steam calls automatically. A browser leave warning appears during requests or
unsaved work; browsers may suppress that warning, so checkpoints are the recovery mechanism.

**Data & backups** exports a versioned JSON backup of your library, all profile plans,
preferences, and verification dates. Restore shows a replacement preview. Browser
storage is not a permanent backup: retain downloaded copies. Existing IndexedDB and
localStorage data migrate on the same origin. Demo changes are session-only.

## Verification

```bash
npm run check
npm test
python3 -m unittest discover -s collector -p 'test_*.py'
npm run build
```

Stop the dev server before building. Browser regression tests use mocked Steam
responses and consume **zero real Steam calls**. With a single dev server running at
127.0.0.1:5188:

```bash
npx playwright install chromium
npm run test:browser
```

`UI_BASE_URL` can override the local test URL. Tests use isolated browser contexts.
The optional `tests/manual-live-smoke.mjs` is deliberately excluded from automated
suites; it makes three real Steam requests and requires a live-enabled local server
and the private local collector export. See [migration verification](docs/plans/migration-verification.md)
for coverage, results, and user-testing suggestions. The development-only `/ui`
gallery displays shared primitives; production returns 404.

## Features

- Overview, searchable library/achievements, game details, completion optimizer,
  trends, charts with data tables, and per-game verification dates.
- Per-profile plans retain completed/inactive targets; JSON plan import/export and
  Markdown checklists remain available.
- Explicit quick/full refresh, bounded requests, persisted call reservations,
  pause/resume, rate-limit recovery, and an explicit 1,000-call allowance extension.
- Atomic browser saves, stale-tab conflict protection, deletion tombstones,
  unsaved-data export, and damaged-storage recovery.

## Vercel deployment

The migration is implemented and tested locally; **it has not been deployed**.
`vercel.json` selects SvelteKit and the adapter creates Vercel output. Verify the
existing project's framework setting and preserve its production origin before rollout.

Configure server-only variables from [.env.example](.env.example). Live imports are
disabled unless `STEAM_IMPORT_ENABLED=true`. Before enabling a public deployment,
configure and verify the planned WAF protection across both `/api/steam/*` endpoints,
then run a small monitored pilot and inspect account usage. Local call allowances and
signed permissions are not a global abuse-proof quota. There is no shared quota store.
No paid services have been enabled and no cloud capacity/billing guarantee is implied
by local tests. See [deployment checks](docs/plans/free-tier-readiness.md) and
[monitoring notes](docs/plans/vercel-monitoring.md).

## Collector fallback

Python 3, standard library only:

```bash
python3 collector/steam_collect.py YOUR_STEAMID --key YOUR_API_KEY
```

The collector also accepts profile URLs/vanity names, `--workers` (default 1, maximum 4),
`--max-calls` (default 1,000), and `--output`. Requests are serialized and spaced;
there are no automatic retries. A systemic error or exhausted allowance stops the
run without replacing the output. Restarting repeats work; prefer the browser importer
for resumable imports.
Key resolution: `--key` > `STEAM_WEB_API_KEY` > `collector/key.env`.
`src/assets/collector.py` must match `collector/steam_collect.py`.

## Design and implementation records

- [Backend and storage plan](docs/plans/sveltekit-and-steam-import.md)
- [Frontend screen plan](docs/plans/frontend-plan.md) and [illustrative drafts](docs/plans/frontend-preview.html)
- [Shared style guide](docs/plans/ui-style-guide.md) and [shadcn adoption audit](docs/plans/shadcn-svelte-audit.md)
- [Migration verification and testing handoff](docs/plans/migration-verification.md)

Source lives in `src/routes`, `src/lib`, and `src/lib/components`; shared primitives
are in `src/lib/components/ui`. Earlier durable-backend proposals are archived and
are not first-release requirements.
