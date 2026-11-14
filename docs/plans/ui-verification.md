# Svelte UI verification

**Implementation update (2026-11-14):** the migration is now implemented locally.
See [current verification and rollout gates](migration-verification.md). The original
planning/audit evidence below is retained as historical context, not current completion status.

Verified locally 2026-11-09. No deployment performed.

- `npm run check`: zero errors and warnings.
- `npm test`: seven import/storage/plan regression tests pass.
- Collector unittest suite: seven tests pass; bundled collector matches source.
- `npm run build`: production Vercel adapter output generated successfully.
- Production preview browser tests: invalid and BOM JSON, saved library restore,
  legacy localStorage migration, search, pagination, game details, plan changes,
  JSON export, persisted plan, desktop pinning, and mobile layout pass.
- LayerChart browser checks: charts render, named scatter tooltip matches the
  selected point, and clicking opens the corresponding game.
- No browser console errors during successful test flows.

Browser smoke scripts used the shared Playwright installation. The imported fixture
was `public/demo.json`, not the private export. Mobile checks used 390 × 844; desktop
checks used 1440px width. Screenshots below are local artifacts, not deployed URLs.

## Current captures

- [Overview with loaded artwork](/tmp/steam-ui/2026-11-10T00-55-55-svelte-overview.png)
- [Trends](/tmp/steam-ui/2026-11-10T00-55-56-svelte-trends.png)
- [Scatter tooltip](/tmp/steam-ui/2026-11-10T00-55-56-svelte-scatter-tooltip.png)
- [Production mobile overview](/tmp/ui-capture/steam-data/2026-11-10T00-57-23-svelte-mobile.png)
- [Production mobile plan](/tmp/ui-capture/steam-data/2026-11-10T00-57-23-svelte-plan-mobile.png)
- [Production library](/tmp/ui-capture/steam-data/2026-11-10T00-57-23-svelte-library-final.png)

## Earlier inspection captures

- [Initial overview before artwork finished loading](/tmp/ui-capture/steam-data/2026-11-10T00-52-51-svelte-overview.png)
- [Library search](/tmp/ui-capture/steam-data/2026-11-10T00-52-52-svelte-library.png)
- [Development mobile overview](/tmp/ui-capture/steam-data/2026-11-10T00-55-41-svelte-mobile.png)
- [Development mobile plan](/tmp/ui-capture/steam-data/2026-11-10T00-55-41-svelte-plan-mobile.png)
- [Development library](/tmp/ui-capture/steam-data/2026-11-10T00-55-41-svelte-library-final.png)

## Limits

Live Steam imports, queue behavior, API budgets, and production telemetry are not
implemented or tested in this UI phase. Chart code is lazy-loaded; no claim of an
end-to-end performance improvement is made without controlled comparative timings.
Large lists now use 50-row pagination rather than the previous React virtualizer.
The current controls include shadcn-svelte Button and Bits UI dialogs; domain tables
and LayerChart views are customized Svelte components.
