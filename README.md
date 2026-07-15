# Steam Data — Achievement Atlas

A zero-backend React app that turns a Steam data export (`steam_data.json`, produced
by `collector/steam_collect.py`) into an achievement dashboard and completion-rate
optimizer. Everything runs client-side — your API key never touches this app, and the
uploaded JSON never leaves the browser.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
```

Generate `steam_data.json` with the collector (see `collector/`), then upload it in the
app.

## Build

```bash
npm run build    # static output in dist/ — deploy to any static host ($0)
npm run preview
```

## Collector

`collector/steam_collect.py` is a dependency-free (stdlib-only) script that calls the
Steam Web API and writes `steam_data.json`. It needs only Python 3 — no `pip install`.

```bash
cd collector
python3 steam_collect.py YOUR_STEAMID --key YOUR_API_KEY
```

The key is resolved as `--key` > `STEAM_WEB_API_KEY` env var > `collector/key.env`.
`collector/analyze.py` is the original CLI average + optimizer that the web Optimizer
was ported from.

## Status — all phases built

- [x] **P1** Vite + React + TS scaffold, Steam-dark theme; drag-and-drop upload with
      validation; localStorage persistence; profile overview + Steam-accurate average
- [x] **P2** Achievement explorer (virtualized 9k-row table, search, filter chips,
      sortable columns, descriptions, rarity bars) + Library view (sort by playtime /
      completion / last played)
- [x] **P3** Completion optimizer — port of `analyze.py` with a live what-if projection
      you build by toggling suggested moves — plus rarity walls (rarest owned / easy missed)
- [x] **P4** Get-started onboarding (key → download collector → run → upload, with
      copy-to-clipboard command) + Trends charts (unlocks over time, completion
      distribution, playtime-vs-completion scatter; lazy-loaded)

- [x] **Plan** A shared, persisted plan you build from any screen: pinnable slide-over
      drawer, plan-aware Impact column (recomputes live as you add moves), add-to-plan on
      Achievements / Rarity / Library (drill into a game to pick individual achievements) /
      Optimizer, Markdown checklist download + JSON export/re-import. Scatter tooltip fixed.

## Repo layout

```
.                       Vite + React app (this is the main project)
  index.html
  package.json
  vite.config.ts
  src/
    types.ts            JSON schema types (mirror steam_collect.py output)
    lib/
      steam.ts          flooredRate, averageCompletion (Steam's floor-per-game method)
      optimizer.ts      optimize() suggestion lists
      plan.ts           PlanItem, projection, computeImpactByApp, markdown/json, storage
      hooks.ts          useWide, usePersistedBool, usePersistedNumber
      derive.ts, format.ts
    context/PlanContext shared plan store (localStorage, keyed by steamid)
    components/          Nav, Upload, ProfileOverview, Dashboard, PlanDrawer, PlanPill, AddButton
    views/              Achievements, Library, Optimizer, HowItWorks, Trends, GetStarted
    assets/collector.py bundled copy of collector/steam_collect.py (offered as download)
public/
  demo.json           committed sample export — powers the landing-page "live demo"
collector/              Local data collector + analysis CLI
  steam_collect.py      collector → steam_data.json (stdlib only)
  analyze.py            avg + optimizer CLI (source the web Optimizer was ported from)
  key.env               optional API-key fallback (gitignored)
docs/                   Original planning docs / mockups (plan.html, mockups.html, …)
steam_data.json         sample export (gitignored)
```

The bundled `src/assets/collector.py` is a copy of `collector/steam_collect.py` — re-copy
it if the collector changes. See `docs/plan.html` for the original plan.
