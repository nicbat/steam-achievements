# UI repair plan

2026-11-14. Current investigation; supersedes earlier claims that visual migration is complete.
Branch: `ui/consistency-audit`. Keep this PR in draft while repairing the UI.

## Outcome and scope

Make Achievement Atlas feel like one coherent application: predictable navigation,
readable game data, consistent controls and calm import updates. Preserve the existing
Steam-blue theme, shadcn-svelte, browser storage and import contracts. Work in small
commits with a browser walkthrough after each slice. Do not restart the framework migration.

The inherited migration is preserved separately in commit `253793e`. That checkpoint
is provenance, not approval of its implementation or deployment readiness. This PR
necessarily includes that baseline because main still contains the React app.

## Evidence from the running application

Reviewed the sample library at 1440, 390 and 320 CSS pixels, covering Overview, Library,
Achievements, Optimizer, Trends, My plan and Data & backups, plus first-visit import.
Used isolated Playwright browser storage and intercepted Steam endpoints; no live Steam calls.
The screenshot walkthrough reported no JavaScript exceptions or page-wide horizontal overflow.
Those checks alone did not establish usable mobile layouts or visual consistency.

1. **Selected navigation disappears off hover.** Reproduced on Library: `aria-current=page`
   is present but background is transparent and text is muted. Unlayered `.sidebar button`
   CSS overrides shadcn variants; obsolete `.active` CSS has no matching class. The hover
   background masked this in previous screenshots. Fixed in this slice by leaving only
   navigation layout in CSS and letting Button variants own selected/hover appearance.
   Labels now align left instead of centering within their rows.
2. **Navigation resets work.** Search Library for Portal, visit Overview, return to Library:
   the search is empty. Conditional view rendering unmounts the component with its local
   filters, sorting and pagination. Achievement explorer uses the same local-state pattern;
   its behavior needs the equivalent task test. Returning from the game dialog is a different
   flow and must continue preserving filters.
3. **Mobile data is still a desktop table.** Library and Achievements contain horizontally
   scrolling tables. At 390 and 320 pixels, names/playtime dominate the initial viewport;
   completion and planning actions require lateral scrolling. This is not page overflow,
   but it fails the intended stacked mobile game-row design.
4. **Shared primitives have competing style owners.** app.css combines element selectors,
   legacy classes, data-slot overrides and repeated media queries. Domain components also
   override Card and Button using local CSS and important utilities. Overview cards use
   custom padding/borders; import cards use registry defaults; Library combines Card with
   `.panel`. Shared color variables have not solved spacing, hierarchy or state consistency.
5. **Navigation and page hierarchy need consolidation.** Desktop sidebar labels such as
   Data & backups and Import / refresh wrap within the 190px rail. Mobile navigation is a
   horizontally scrolled row. Backup and plan destinations are repeated in the header and
   sidebar, while sample mode adds another action above each view. Decide their roles before
   moving individual buttons around.
6. **Motion remains an investigation, not a measured performance diagnosis.** Button uses
   `transition-all`; import auto-follow scrolls to each active group; failed overview images
   are removed from layout. These are possible contributors to jumps. No frame-time or live
   import benchmark was performed; do not describe them as proven causes of runtime lag.

## Design contract for repairs

Retain canvas #18212D, surface #243244, text #F0F4F8, secondary text #ACBDCE,
action #78C9F2 and gold #E8BE65. Segoe UI/system sans throughout; tabular numbers
for data. Use the existing style guide's 16px body, 14px secondary text, 32/28px
page headings and 44px control targets. Major sections use 32px spacing; panels
24px desktop / 16px narrow. Use left-aligned headings, labels and game identities.

Keep game artwork and achievement progress as the distinctive content. The shell and
controls should be quiet and predictable. This is a consistency repair, not a new palette,
marketing landing page, chart library or decorative animation project.

Desktop structure: header / navigation rail + page heading + task content.
Mobile structure: compact header / explicit navigation / page heading / stacked task content.
Choose a mobile navigation pattern after comparing a wrapping navigation and labeled menu
with the actual nine destinations. Do not silently hide destinations.

## Ordered implementation slices

### 1. Shared shell and primitive ownership

- [x] Fix off-hover selection and navigation alignment; add a focused regression.
- [x] Inventory consumed legacy selectors; remove unused rules and consolidate repeated
  breakpoints without blind replacement.
- [x] Let shared variants own control states. Standardize panel padding/header treatment
  and remove duplicate Card/`.panel` styling one consumer at a time.
- [x] Resolve sidebar width/wrapping and global versus page-specific actions.
- [x] Verify all navigation destinations, keyboard focus, long labels, and 320px reflow.

### 2. Navigation continuity and mobile library

- [x] Lift search, filter, sort and page state to an application-owned view-state model.
  Define reset on dataset/profile replacement; preserve state on ordinary navigation.
- [x] Use stacked game rows on narrow screens with name, unlocked/total, completion,
  freshness and detail/plan action visible together. Retain desktop comparison tables.
- [x] Apply the same responsive decision to Achievements; add Clear filters to empty results.
- [x] Verify search -> game -> plan -> library retains context; check paging and keyboard access.

### 3. Calm import and stable assets

- [x] Record a mocked delayed multi-batch import with mixed normal no-achievement outcomes,
  pause/resume and manually scrolled list. Separate deliberate following from unexpected jumps.
- [x] Reserve action/status footprints across running, pausing, saving and paused states.
- [x] Limit transitions to intended properties; respect reduced motion.
- [x] Keep artwork footprints stable on load/failure using accessible fallbacks.
- [x] Re-run import recovery tests; preserve accounting, explicit resume and storage semantics.

### 4. Consistent domain screens

- [x] Review Overview, Plan, Optimizer, Trends, Data and help side by side using the repaired
  shell. Unify headings, section spacing, action hierarchy and empty states.
- [x] Review plan as page, sheet and docked panel; avoid conflicting nested headings/actions.
- [x] Test long names, unknown dates, no achievements, large libraries and populated plans.

## Acceptance and current limits

Every slice gets a separate commit and updated PR notes. Browser acceptance includes
mouse-away selection, keyboard navigation, search continuity, narrow layout, dialogs and
sample/file/import recovery tasks. Run Svelte checks and relevant tests; run the full
browser suite before calling the UI repair complete. Use controlled imports for repeatability.

This audit does not prove accessibility conformance, public import safety, smooth live-network
performance or usability with actual users. The backend deployment gates in the handoff remain.
The four implementation slices above are now implemented and browser-checked. Keep the PR
draft for review of the inherited migration and the repaired interface; actual-user and
live-network validation remain separate from these controlled checks.

Local visual evidence from this pass is in `/tmp/atlas-ui-audit/` (not tracked or portable).
Reproduce the navigation regression with a local dev server and
`node tests/browser/navigation.mjs`. Existing functional suites are documented in README.

Validation for the first fix: `npm run check` reports 0 errors / 0 warnings;
`npm test` passes 98 tests; `node tests/browser/navigation.mjs` passes at all three
widths; `node tests/browser/flows.mjs` passes file preview, plan persistence,
backup/restore, mocked import and mobile backup checks with no browser errors.
No production build or complete browser-suite run was performed for this scoped CSS fix.


## Repair implementation follow-up

- Base element resets now live in the CSS base layer, so component typography and spacing
  utilities work. Removed unused landing/upload/overlay rules and consolidated narrow
  breakpoints. Shared Card owns direct-content padding via `layout="padded"`; migrated
  Library, Achievements, Plan, Optimizer, Trends and collector instructions. Overview
  metrics and plan projections use that contract too.
- Desktop rail widened to 224px. Mobile uses a labeled native destination selector with
  every available screen. Sample/profile switching lives in the header. Data & backups
  stays in navigation; the header shortcut remains for first visit. The plan button opens
  the sheet or the full plan when already docked. Selected navigation changes immediately.
- Library and Achievement search/filter/sort/page state belongs to the application page.
  Normal navigation and game dialogs retain it; changing profile or sample mode, and
  explicitly replacing a file/backup, resets it. Same-profile refresh retains context and
  clamps displayed pages to available results. State is session-only, not persisted on reload.
- Mobile Library/Achievements reuse the same semantic table records and actions, displayed
  as stacked labeled rows below 700px. No duplicate rendering or second data model. Empty
  results provide Clear filters. Filter groups now use spaced-item semantics so each chip
  retains its complete border.
- Overview and Plan no longer share a global `.projection` selector. Plan has one primary
  heading per presentation and no ineffective close button on its page; pinned plan does
  not duplicate the full plan page. Empty plans link to Find achievements.
- Shared artwork keeps its dimensions on failure and shows an icon fallback. Button
  transitions affect colors only; progress transitions affect transform only. Reduced motion
  is respected. The keyboard skip link is a fixed overlay, avoiding focus-induced layout shifts.
- Import following only scrolls when the active group exits the viewport. Wheel, touch,
  keyboard and pointer interaction stop following; Show current games restores it explicitly.
  The monitor header and primary pause/resume footprint stay stable. First-time completion
  stays on the import summary instead of implicitly switching to Overview.

Regression coverage added: `ui-continuity.mjs` (search/sort/page continuity, game/plan round
trip, file/profile reset, long title/unknown date, mobile row geometry, failed-artwork geometry,
keyboard skip and reduced motion, plan page/sheet/dock) and `import-motion.mjs` (recorded
24-game mixed-result import, pause button geometry, manual scroll retention and explicit follow).
The existing recovery test intentionally logs one mocked HTTP 429; that expected response is
not a new console exception. All Steam requests in these checks are intercepted.

Final verification: 98 application tests pass; the complete browser suite passes, including
both new regressions. The final keyboard/long-title/plan-deduplication refinements passed
another targeted continuity run. Final Svelte check reports 0 errors / 0 warnings, and
`npm run build` succeeds with Vercel adapter output. Local development was stopped for the
build and restarted afterward. No deployment or real Steam calls were made.

Review artifacts (local, not committed):
- `/tmp/atlas-ui-repaired/`: desktop, 390px and 320px snapshots of seven screens.
- `/tmp/atlas-browser-tests/1794692459081-repaired-library-320.png`: mobile Library.
- `/tmp/atlas-browser-videos/page@2e9ab95398ac3d977527a6d47bb84741.webm`: controlled import walkthrough.


## Full recheck follow-up

Reproduced the Full recheck button doing no work: it changed a local mode while a separate
Check profile button performed the lookup. Replaced the detached mode toggles with form
actions for Quick refresh and Full recheck. Both validate the profile and open import review;
review names the requested scope, and Start import still gates achievement batches.
Initial visitors retain Check profile. Cooldowns and API limits are unchanged.

`refresh-actions.mjs` failed on the old UI and passes on the repair, covering correct full/quick
checkpoint modes, no batches before confirmation, required-profile validation and 320px reflow.
The existing end-to-end file/plan/import/backup flow passes; Svelte check is clean.
