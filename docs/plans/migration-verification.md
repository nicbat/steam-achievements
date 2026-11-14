# Migration implementation and testing handoff

2026-11-14. Implemented locally; not committed or deployed. This supersedes the
implementation-status paragraphs in earlier planning and audit records.

## Implemented scope

- SvelteKit with shadcn-svelte nova primitives throughout; shared blue/gold tokens,
  dialogs, sheets, confirmation dialogs, controls, tables and chart containers.
  Native hidden file inputs remain intentional. Development `/ui` gallery.
- Minimal server-only Steam proxy: profile verification and scoped achievement
  batches, signed expiring permissions, fixed upstream URLs, serial pacing,
  timeouts, bounded input/output and partial-result handling. Disabled by default.
- Browser-owned IndexedDB dataset: library, every profile's plan, preferences,
  verification timestamps, call ledger and unfinished import. Serialized writes,
  revision checks, cross-tab coordination and deletion tombstones.
- Explicit profile review, quick/full work selection, cached metadata reuse,
  six-hour refresh cooldown (including vanity URL resolution), five-game batches,
  up to 15 operations, persisted 1,000-call allowance and explicit extensions.
  Unknown outcomes retain reservations. No automatic retries or refresh on reload.
- Pause/resume while the tab is available, conditional browser leave warning,
  saving failures that stop dispatch, emergency export, corruption recovery.
- Combined versioned backup/export/full restore preview; collector-file preview;
  all-profile legacy migration; demo isolation. Plans retain completed/inactive
  targets while projections exclude them as appropriate.
- Searchable library/achievements, overview, optimizer, trends/data tables,
  plan overlay/panel, import management, backup management and freshness labels.

## Automated and browser evidence

- `npm run check`: zero errors, zero warnings.
- `npm test`: 60 passing tests. Includes backend scope/input/output/deadline bounds,
  no retry, 429 and partial responses; backup validation; quota failures; migration;
  stale writers; tombstones; corrupt reset race/rollback; import locking, double
  clicks, hidden tabs, reservations, cumulative budget, renewal, cooldown and
  failed-save recovery. Steam transport is mocked.
- Collector: seven passing Python unittests; downloadable collector matches source.
- `npm run test:browser`: two repeatable Playwright flows pass, with every Steam
  endpoint mocked (five mocked POSTs total, zero real Steam calls). Covers:
  file preview/save, plan persistence, backup download/restore, future-version
  rejection, explicit import review, completion, zero-request reload, deletion
  cancel/confirm, corrupt-data export/reset, forced quota failure stopping dispatch,
  failed reload preserving unsaved recovery controls,
  real Chromium beforeunload prompt cancellation, 429 pause without auto retry,
  checkpoint reload and explicit resume. The injected 429 produces exactly one
  expected browser resource-error message; no unexpected console errors.
- Independent UI browser checks: all five data views at 390px and 320px fit without
  document overflow; game filtering/planning/Escape; keyboard-named optimizer
  sliders; charts and expandable data tables; shared gallery Dialog/Sheet.
  Retested charts after compatible dependency updates, no console errors.
- Live local smoke: **exactly three real Steam calls**, using the existing local
  key without logging it: numeric profile/library verification (two calls) and
  one game's progress (one call). Passed. No full personal-library import was run.

- `npm run build`: production build and Vercel adapter output pass. Runtime is
  explicitly Node 24; import function configuration has a 30-second duration.
- Production preview: shared gallery returns 404 and import capabilities are
  disabled without explicit server configuration. Browser flows also run against
  the built app, in addition to development-mode checks.
- Client output scan: 68 files / 52 JavaScript files; zero matches for the actual
  local Steam key and zero server key/signing-code markers in client JavaScript.
  No secret values were printed or added to public artifacts.

 Browser screenshots are generated under `/tmp/atlas-browser-tests`;
manual visual evidence is under `/tmp/ui-capture/steam-data`. These are local test
artifacts, not public assets or repository content.

## Try it yourself

1. Run `npm run dev:local`, then open http://127.0.0.1:5188. The launcher uses the
   existing local key and binds only to localhost. Use the same origin on subsequent
   visits; different ports/hostnames have different browser storage.
2. Try **Explore demo** first. Compare Overview, Library, Achievements, Optimizer,
   Trends and My plan. Add/remove targets, use keyboard controls and narrow the window.
3. Open a collector file; inspect the replacement preview. Add a plan target, reload,
   and confirm it remains. Export a combined backup from **Data & backups**.
4. Check your public Steam profile and review the selected work/call estimate before
   starting. Pause, reload, then resume explicitly. The dashboard keeps its previous
   complete library until the new import is saved. Game details must be public.
5. Restore the backup and check the library, plan and preferences. Download a backup
   before trying deletion. Recovery exports preserve raw damaged records for manual
   recovery; they are not guaranteed valid normal backup files.

For repeatable browser tests, start a single dev server, run
`npx playwright install chromium` once, then `npm run test:browser`.
Tests use isolated contexts and never change your normal browser profile.

## Boundaries and rollout gates

- No deployment, WAF rule, Vercel account setting, production traffic test, or
  account-wide usage verification was performed. Keep public live imports disabled
  until both endpoint protections and the small monitored pilot are verified.
- Per-browser accounting is an accidental-use guard, not an authoritative global
  quota. Clearing browser storage, using other browsers or hostile clients can
  bypass it. The backend deliberately has no shared budget database.
- Actual concurrency across independent server instances is not coordinated.
  Per-request pacing and bounds do not alone guarantee account-wide usage limits.
- Browser storage may be evicted; downloaded backups are needed. The leave warning
  is browser-controlled and cannot guarantee protection against tab/process loss.
  Safari/Firefox and real mobile devices have not been tested in this pass.
- Compatible dependency updates removed three moderate audit findings. `npm audit`
  still reports seven low-severity dependency-chain findings rooted in `deepmerge`
  used by the Svelte Vite plugin. Its proposed force fix downgrades SvelteKit to an
  incompatible historic release, so it was not applied. No high/critical findings
  remained in this audit. Recheck before production rollout.
- No cloud database, Cloudflare service, paid plan or background worker was added.
  No sitewide business/user research or exhaustive accessibility certification is
  implied by the focused keyboard, responsive and simulated-user checks.

## User-testing follow-up: access denial and text density

The reported numeric profile URL succeeded on a bounded follow-up backend probe
(GetOwnedGames 200, GetPlayerSummaries 200). The earlier denial was not reproduced;
its cause is unconfirmed. Eight diagnostic calls were used in this follow-up, with
no retries. Access-denial errors now identify the failed lookup stage without
asserting a broken API key. Known structured per-game privacy/no-stats responses
are distinguished from systemic denials; unknown denials still pause.

Main screens now prioritize actions and data. API/storage/calculation explanations
and profile-plan lists sit behind shared collapsibles. Redundant banners, helper
paragraphs, badges and missing-description placeholders were removed.

63 application tests pass. Added a mocked browser regression for profile denial,
explicit retry, retained call accounting and no automatic batch start, including
320px import-review verification. Existing save/restore/recovery browser flows pass.

## Game-level 403 workaround

A three-call bounded diagnostic reproduced HTTP403 from app10's rarity endpoint,
while its schema returned200 without achievements and a control achievement game
returned a normal schema. This is an upstream Steam response, not browser CORS.
Batches now avoid rarity calls after the same batch confirms missing/empty
achievement schema. Missing player progress alone does not suppress metadata.

Unknown game403s still pause. The checkpoint records the denied game/operation,
and an explicit Skip this game action removes that game's remaining work under
the browser lock. It preserves successful results, freshness, and counted calls;
it makes no network request and requires Resume to continue. Auth/rate-limit/
network failures are not eligible. Old checkpoints may require one Resume to
record the blocked operation before Skip appears.

73 application tests pass, including skip persistence/failure/invalidation cases
and schema/rarity dependency checks. A mocked browser flow verifies denial,
reload, skip cancellation/confirmation, retained accounting, and successful
continuation with other games.


## API audit and prevention follow-up

The current audit supersedes the same-batch-only workaround above. No live Steam
requests were made during this audit; all failure cases use fixtures. Endpoint
inputs were checked against [Valve's ISteamUserStats reference](https://partner.steamgames.com/doc/webapi/ISteamUserStats?l=english);
absence/error distinctions also rely on the earlier bounded observations and tests.

- Schema is checked before player progress and rarity, even if a resumed/client
  queue arrives in the old order. Confirmed absent or empty schema skips both
  dependent calls without erasing prior achievements. Malformed schema is not
  mistaken for absence.
- Explicit no-schema observations are cached seven days in validated browser
  metadata and backups. They prune dependent work across batches and reloads.
  Empty uploaded achievement lists alone are not evidence of absent schema.
- Recognized unavailable player progress is cached one day for unchanged games;
  changed play history bypasses that cache. It remains separate from successful
  progress freshness and never suppresses a game's schema merely because player
  stats are unavailable. Future timestamps are not trusted for cache validity.
- An old checkpoint with the exact historical no-schema failure rechecks schema
  once on explicit Resume. It does not invent a dated cache entry from old text.
  This repairs pending rarity work while allowing Steam to report new achievements.
- Completed work does not renew expired tokens unnecessarily. Calls reserved but
  cancelled before dispatch are refunded; ambiguous dispatched requests stay counted.
- Server and browser limits agree at 10,000 games/achievement rows. Oversized
  libraries stop before the additional profile summary request. Unknown 403,
  authentication, malformed responses, rate limits and outages still pause safely.
- The collector and its downloadable copy now default to one worker, serialize
  requests with 500ms spacing, enforce a default 1,000-call allowance, and stop all
  queued work on systemic failures without overwriting the output. No automatic
  retries. The collector has no checkpoint: restarting repeats prior requests.
- Overview and game check labels recognize explicit unavailable observations so
  a just-checked no-achievement game is not immediately shown as unchecked.

Validation: 92 application tests and 12 offline collector tests pass; Svelte check
reports zero errors/warnings. Browser regression verifies a no-achievement game
completes automatically, skips dependent work, saves the absence observation,
accounts for actual calls, and makes no automatic calls after reload.

Public deployment gates remain unchanged: per-browser allowances and per-request
limits are not an account-wide quota. Public live imports must remain disabled
until deployment protections and the monitored pilot are verified. No database,
Cloudflare service, paid plan, or automatic retry mechanism was added.

Final checks: all five browser flow scripts pass (including expected mocked
429/502 failures), production Vercel build passes, and `git diff --check` is clean.
The local test server is running at http://127.0.0.1:5188; nothing was deployed.

## Import activity and pacing

The import screen now shows the latest four timestamped activity entries with
older entries expandable (maximum 100). Active batch game names are shown while
waiting; per-game results appear when the bounded response arrives. Received
results are distinguished from the subsequent durable-save confirmation. Game
outcomes are checkpointed for unfinished-import reloads; this is not a permanent
log archive and completed history is only retained in the current screen.

Removed the five-second minimum between batch starts. Requests remain sequential
with the server's 500ms spacing, plus a 500ms gap after each client batch response
to preserve spacing at batch boundaries. The old eight-worker collector has not
been restored. Five-game/15-operation limits, deadlines, save-before-dispatch,
call allowances and explicit retry behavior are unchanged.

94 application tests pass, including bounded/validated log persistence and a
mock-clock check that fast batches wait only 500ms without overlapping.

Activity follow-up verification: all five browser flows pass (320px activity
layout included); Svelte check and production build pass. No live Steam requests
were made by these tests. Local development server restarted for user testing.

## Parallel imports and monitor redesign

This supersedes the serial pacing described above. The 500ms spacing was a
conservative local design choice, not a measured Steam rate limit. Backend batches
now run at most three games concurrently, with sequential schema-before-dependent
work inside each game. The browser requests three games per group (up to nine
operations) for more frequent responses and starts the next group after saving,
without an artificial delay. No retries or extra data requests were added.

A shared stop prevents queued calls after a systemic failure is known. Calls
already in flight settle so successful results and attempt accounting are retained;
at most two other requests may be underway when one fails. Server deadlines,
response/attempt limits, explicit resume, browser allowance and deployment gates
remain. Concurrency is per invocation, not a global quota across server instances.

Independent design and UX reviews found bursty batch updates, reverse-prepended
API transcripts, transient saving rows moving controls, poor mobile timestamp
layout, and an unresponsive-looking Pause state. The replacement uses stable game
rows, actual processed counts, a reserved status line, immediate disabled Pausing
feedback, and a collapsed chronological diagnostic log. It distinguishes no
achievements, unavailable data and user skips from completed checks. API accounting
includes reservations and is labeled accordingly. The list renders only a small
window of rows for large libraries; manual scrolling stops automatic following.

Root browser interaction covered controlled delayed responses, running state,
pause during an in-flight group, reload, explicit resume, completion, and320px
layout. These are real interactions with the local application and mocked Steam
responses, not a live Steam performance benchmark. The monitor honestly shows group
membership while awaiting a response; it does not fabricate per-request completion
or an ETA. Parallelism and failure stopping are separately tested with controlled
backend promises. 97 application tests pass, including31 backend tests.

The six browser scripts pass, including the new delayed-response monitor flow.
Svelte check reports zero errors/warnings. Final visual evidence:

- [Running desktop](/tmp/atlas-browser-tests/1794690995156-monitor-running-desktop.png)
- [Pausing desktop](/tmp/atlas-browser-tests/1794690995276-monitor-pausing-desktop.png)
- [Paused mobile](/tmp/atlas-browser-tests/1794690996302-monitor-paused-mobile.png)
- [Completed mobile](/tmp/atlas-browser-tests/1794690996457-monitor-complete-mobile.png)

Primary actions now precede the list; elapsed time indicates waiting without
inventing progress. Auto-follow lands on complete rows, and reduced-motion users
avoid progress-bar transitions. No real Steam benchmark or global quota guarantee
is implied by these local deterministic tests.

Production build passes with the Vercel adapter. Local server restarted for user
testing; no deployment or external account changes were made.

## Cooldown flicker and fresh-agent handoff

Normal responses previously stored retryAt=Date.now() even without Retry-After.
The UI's one-second clock could lag this value, briefly rendering Resume after
on each batch. Normal responses now store0; cooldown display is confined to paused
imports and retains its row as the real deadline expires. Confirmed absent-schema
dependent skips no longer count as unavailable operations or set unavailable
progress cache entries. Exact historical no-schema skip failures are cleaned on
checkpoint read. 98 application tests, Svelte check, and targeted browser flow pass.

Start a fresh session with [agent-handoff.md](agent-handoff.md). Latest browser
[evidence](/tmp/atlas-browser-tests/1794691347673-import-activity-mobile.png).
