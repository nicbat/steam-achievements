# Contributing

## Start with the current state

Read [AGENTS.md](AGENTS.md), [the handoff](docs/plans/agent-handoff.md), and the
[documentation index](docs/README.md). Check `git status`, the current branch and PR
before editing. Preserve inherited work. Create a task branch if none is appropriate;
continue an existing task branch when it already owns the work.

For a bug, write down the trigger, actual result and expected user-visible result.
For a larger change, put scope, acceptance criteria and the next small slice in the
existing task plan. Do not create a second plan for the same work. Separate unrelated
refactors and formatting from behavior changes. Commit verified slices and push them
to a draft PR; do not leave completed work only in the working tree.

## Where changes belong

- `src/routes/+page.svelte`: application shell, navigation and integration. Keep domain
  calculations, storage and import lifecycle in their modules, not new page handlers.
- `src/lib/components/`: domain views. `ui/` contains shared shadcn primitives; its many
  small files are not separate features. Change shared variants deliberately and check consumers.
- `src/app.css` and [style guide](docs/plans/ui-style-guide.md): tokens and shared layout.
  Avoid adding a second styling owner to fix one screen.
- `src/lib/import-controller.ts`, `import-model.ts`, `server/steam-import.ts`: import
  lifecycle, selection and server requests. Preserve request accounting and recovery.
- `src/lib/browser-storage.ts`, `dataset-session.ts`, `backup.ts`: durable data boundaries.
- `collector/steam_collect.py`: collector source. Keep `src/assets/collector.py` identical.
- `tests/*.test.mjs`, `collector/test_*.py`, `tests/browser/`: unit and browser regressions.

## Verify the outcome

Use Node 24 to match CI. Install with `npm ci` and `npx playwright install chromium`.
For isolated demo/file development and mocked browser tests, run:

```bash
STEAM_IMPORT_ENABLED=false npm run dev -- --host 127.0.0.1 --port 5188 --strictPort
```

In another terminal:

```bash
npm run check
npm test
python3 -m unittest discover -s collector -p 'test_*.py'
npm run test:browser
```

Stop that server before `npm run build`: dev and build share generated SvelteKit output.
Use `npm run dev:local` only when live-enabled local development is intended; it can
load private credentials. Automated tests must intercept Steam calls and use isolated
browser contexts. `tests/manual-live-smoke.mjs` is excluded from automated verification.

Choose checks by risk:

- Documentation only: inspect the diff, validate changed local links and commands, and
  check for conflicting current instructions. No UI test is needed for prose alone.
- UI behavior: reproduce the failure, add a focused browser regression, run Svelte check
  and affected tests, and manually inspect the affected flow. Before completing a UI
  repair, run the full browser suite and production build (local or CI).
- Import/storage/collector: run the affected unit and recovery tests, the full application
  suite and relevant browser flows. Verify the downloadable collector matches its source.
- Shared CSS/primitives: inspect affected consumers at desktop, 390px and 320px, including
  focus, off-hover selection, empty/error states and dialogs. Check layout and screenshots,
  not only absence of exceptions or horizontal overflow.

For each changed control, verify the promised effect: navigation, file chooser, download,
state change, or a visible reason it is blocked. Test the applicable starting states:
empty, demo, saved data, filtered results, paused import and completed import. Include
keyboard use, cancellation and repeat activation when relevant. A happy-path test does
not establish that other entry points work. Keep fixtures deterministic; never add live
Steam calls to CI. Report artifact locations, but `/tmp` screenshots are ephemeral evidence.

## PR and completion

Use the PR template. Explain the user-visible before/after, scope, tests and known limits.
The `Verify application` workflow runs checks, JavaScript/Python tests, mocked browser
flows and the production build. Vercel preview success is a separate deployment signal.
Check the latest commit's CI result before declaring it verified; a previous green run
is not evidence for new code. Branch protection is not configured by this documentation.

Update the current handoff in place with the branch/PR, remaining work and evidence tied
to a commit or CI run. Do not claim every control, accessibility, performance or production
readiness is proven by a passing suite. Keep the PR draft while material review remains.
Production rollout and public live-import protection have separate deployment requirements.
