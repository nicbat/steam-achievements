# Fresh-agent handoff

Start here, then read `docs/plans/migration-verification.md` for implementation
history and evidence. Later sections supersede earlier serial-import decisions.

## User's current priority

Work through the frontend and backend by actually interacting with the site.
Prioritize a calm, concise import flow, clear ordinary no-achievement outcomes,
correct error handling and conservative API spending. Existing tests alone are
not proof the experience is good. Keep shadcn-svelte and the established theme.
The user welcomes subagents, wants incremental complexity, and does not want
Cloudflare, a cloud database, paid hosting dependencies or background jobs.

## Workspace and runtime

- Project: `/home/nicbat/Projects/steam-data`.
- `npm run dev:local` serves http://127.0.0.1:5188 with the existing private key.
  Never print keys, signing secrets, or request URLs containing credentials.
- Start only one server. Stop it before production build because SvelteKit shares
  generated output; restart it for user testing afterward.
- The React-to-Svelte migration and follow-ups are uncommitted. Preserve the large
  existing working tree. Nothing has been deployed or committed in this session.
- Users own data in browser IndexedDB with export/restore. Tests use isolated
  browser contexts. Do not clear the user's normal browser data.

## Current import behavior

- Minimal SvelteKit backend; Steam key remains server-side.
- Browser sends one group at a time, three games / up to nine operations.
- Backend runs three concurrent game workers; each game's schema precedes its
  dependent progress/rarity requests. No artificial 500ms/five-second waits.
- Confirmed absent schema is normal, cached seven days, and suppresses dependent
  calls. Known unavailable player progress has a separate one-day cache, bypassed
  when play history changes. Empty uploaded arrays alone do not prove absence.
- Unknown 403/auth/rate-limit/network/malformed responses pause. No automatic
  retries. Existing in-flight parallel calls settle and save their results.
- Per-browser 1,000-call allowance, explicit extensions, reservations before
  dispatch, browser locks and durable checkpoints. Limits are not a global quota.
- Saved checkpoints resume only explicitly. Exact old no-schema failures can
  trigger one fresh schema check on Resume to repair legacy pending rarity work.

## Current UI

`ImportPanel.svelte` handles actions/review/diagnostics; `ImportMonitor.svelte`
shows a small virtualized window of stable game rows. Primary action is above the
list. Pause becomes disabled Pausing immediately while current work settles.
Elapsed time is real; outcomes arrive by group, with no fabricated ETA/progress.
Technical log is collapsed by default, chronological, max 100 events. It is not a
permanent archive; completed logs disappear when the in-memory screen is gone.

Latest fixes: normal batch responses now set retryAt=0, preventing a stale UI
clock from briefly showing Resume after. Genuine cooldown notice stays in a
stable row while paused and becomes Ready to resume at expiry. Confirmed no-schema
dependent skips no longer add unavailable failures or progress-unavailable cache
entries. Exact historical no-schema skip messages are removed from checkpoint
failure summaries on reload. Genuine missing/private stats remain distinct.

## Key implementation files

- `src/lib/server/steam-import.ts`: endpoints, parsing, bounds, game workers.
- `src/lib/import-controller.ts`: lifecycle, persistence, accounting, pause/logs.
- `src/lib/import-model.ts`: selection, caches, dependency pruning, group size.
- `src/lib/backup.ts`, `browser-storage.ts`, `dataset-session.ts`: validation/storage.
- `src/lib/components/ImportPanel.svelte`, `ImportMonitor.svelte`: import UI.
- `src/routes/+page.svelte`: application integration and browser lifecycle.
- `collector/steam_collect.py` and identical `src/assets/collector.py`: standalone
  collector. Still serial, no retries, 1,000-call default; no resumable checkpoint.

## Verification and next work

Commands: `npm test`, `npm run check`, `npm run test:browser`, `npm run build`,
`python3 -m unittest discover -s collector -p 'test_*.py'`.
Browser flows include a controlled delayed import, in-flight Pause, reload,
explicit Resume, desktop/mobile layouts, no-achievements, access failures,
backup/restore and storage failures. These mock Steam; no live throughput or
real rate-limit benchmark has been established. Do not assume three workers is a
Valve-promised safe rate. Avoid full-library live diagnostic runs unnecessarily.

Continue inspecting actual interaction: long imports, many no-achievement games,
large libraries, interrupted saves, mobile controls, and outcome language. Do not
reinstate old pacing or expand complexity merely because older plan sections say
so. Public imports must remain disabled until deployment protection and monitored
pilot are verified: per-invocation concurrency and client accounting cannot
protect an API key globally across Vercel instances or hostile callers.

Latest validation after cooldown/no-achievement fixes: 98 application tests pass,
Svelte check0errors/0warnings, and the targeted no-achievement browser regression
passes. No live Steam calls were used. The previous production build passed before
these small follow-ups; it was not rerun for this handoff.
