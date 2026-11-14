# Current handoff

Updated 2026-11-14. Start with [repository rules](../../AGENTS.md) and
[the contribution workflow](../../CONTRIBUTING.md). This file replaces the prior
append-only handoff; historical migration evidence is linked from the [docs index](../README.md).

## Branch and review state

Work is committed on `ui/consistency-audit` in [draft PR #1](https://github.com/nicbat/steam-achievements/pull/1).
The inherited React-to-SvelteKit migration is checkpoint `253793e`; main still contains
the prior app at this handoff. The PR includes that baseline as well as repairs, so its
scope is larger than a UI bugfix. Do not interpret preservation of the baseline as approval.
Check Git before relying on these branch facts in a later session.

Vercel creates PR previews automatically. Production rollout has not been verified in
this audit. Do not equate a preview, build or test pass with public-import readiness.

## Completed and verified

The [UI repair record](ui-repair-plan.md) documents navigation selection, shared styling,
mobile records/navigation, retained filters, plan presentations, stable artwork and import
scrolling. Follow-ups repair Full recheck/Quick refresh, collector file selection and
clipboard feedback, game-detail filter reset/recovery, and Refresh library after completion.
Local development also offers Reset local refresh cooldown for the saved profile when
there is no unfinished checkpoint. This resets only the app timer, sends no requests,
and is absent from production builds.

Application commit `8fc5a6b` passed [Verify application run 43647145302](https://github.com/nicbat/steam-achievements/actions/runs/43647145302):
Svelte check, 98 JavaScript tests, 12 Python tests, all mocked browser flows and production
build. Local checks also passed. No real Steam calls were used by these tests. Visual
artifacts referenced in the repair record live under `/tmp` and may no longer exist.

Repository workflow now has canonical rules, a contribution guide, a documentation index,
a PR template and application CI. These describe the process; they do not enforce branch
protection or prove all interactions correct.

## Next work and limits

1. Keep this PR draft while reviewing the inherited migration and repaired interface.
2. Continue focused acceptance checks for optimizer thresholds, plan import/export variants,
   and backup/restore entry points. Record exact starting states and outcomes; fix confirmed
   issues in separate commits. Do not begin another broad redesign.
3. Actual-user comprehension, accessibility conformance and live-network performance remain
   unproven. “Choppy” was investigated as visible layout/scroll behavior; no frame-time
   benchmark established a general runtime performance diagnosis.
4. Before public live imports, verify deployment protections and a monitored pilot using
   [deployment checks](free-tier-readiness.md) and [monitoring](vercel-monitoring.md).
   Browser accounting is not a global quota across server instances or hostile clients.

## Contracts to preserve

- SvelteKit, shadcn-svelte and the existing theme; browser-owned IndexedDB data with backup
  export/restore. No new cloud database, paid service or background-job requirement.
- Server-only Steam key. One browser request group at a time: three games/up to nine
  operations, three server game workers; schema precedes dependent requests.
- Explicit profile review and resume; bounded allowance and persisted reservations.
  No automatic retry or import on reload. In-flight results settle before pause completes.
- Confirmed absent schema is a normal seven-day cache; unavailable progress uses a separate
  one-day cache. Uploaded empty arrays alone do not prove absent schema.
- Paused/active checkpoints and unsaved-data recovery survive UI repairs. Tests use isolated
  browser storage and mocked Steam endpoints; never reset the user's normal browser data.

Use CONTRIBUTING.md for the code map and commands. One dev server per checkout; stop it
before build. Do not carry stale process IDs, test totals or deployment assumptions forward
without checking. Update this handoff in place when the work or evidence changes.
