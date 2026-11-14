# Frontend plan: understand your library, choose your next achievement

**Implementation update (2026-11-14):** the migration is now implemented locally.
See [current verification and rollout gates](migration-verification.md). The original
planning/audit evidence below is retained as historical context, not current completion status.

Drafted 2026-11-14. Design proposal, not production implementation.
Companion: [interactive screen drafts](frontend-preview.html),
[review and verification](frontend-review.md), [backend contract](sveltekit-and-steam-import.md).
The backend contract wins if a visual simplification appears to imply different behavior.

## Scope and design decisions

Keep the existing Svelte app and its calculations. Replace the collector-first onboarding
with profile import and local-file alternatives; improve information hierarchy and make
freshness, saving, import recovery, and backups understandable. No accounts, cloud sync,
new server services, paid dependencies, or background jobs. Retain collector instructions
as the fallback, not the first thing a new visitor must learn.

The primary user questions are: What can I finish next? What changed? How current is this?
Where is my plan saved? What should I do when an import stops?

Use Steam-blue surfaces, blue actions, and restrained gold achievement emphasis.
Tokens: canvas #18212D, surface #243244, text #F0F4F8, secondary #ACBDCE,
action #78C9F2, emphasis #E8BE65. System sans, tabular numeric columns; no font download.
Use sentence case. One dominant next action per section; do not turn every number into
a large card. Primary information is visible; explanations and API accounting expand on demand.
Progress bars always have numbers and text. Missing values are “Unknown,” never invented zeros.

## Navigation and screen inventory

| Surface | User's task | Main content / action | Secondary information |
| --- | --- | --- | --- |
| First visit | Get useful data without technical setup | Profile link and Check profile; try sample data | Open data file; privacy requirements; local storage explanation |
| Import review | Decide what work to run | Verified profile, mode, selected games; Start import | Estimated API calls; unchanged/overdue games; file fallback |
| Import status | Know whether work is progressing and saved | Saved games / selected games, current stage; Pause or Resume | Call ledger, skipped work, checkpoint time, error details |
| Overview | Choose something worth playing | Close to completion, recent confirmed unlocks, plan summary | Compact completion/perfect-game/achievement metrics; freshness |
| Library | Find and compare games | Search, sort, useful filters; count and progress per game | Last checked, playtime, planned targets, missing data |
| Game detail | Choose a target | Remaining achievements, descriptions, unlock state; Add to plan | Global unlock rate and date, hidden/spoiler reveal, completion effect |
| Plan | Review intended work | Active targets grouped by game; projected completion change | Completed and unavailable targets retained separately |
| Data | Keep or move a copy | Export backup; Restore backup | Saved location, backup contents, legacy files, delete local data |
| Restore review | Avoid accidental loss | Incoming profile/date; explicit replacement impact | Export current data, validate errors, cancel |

Retain existing Achievement explorer, Optimizer, and Trends as secondary analysis views.
Do not add every view to the first-visit screen. On mobile use wrapping navigation or a
clearly labeled More control; preserve selected view and filters when returning from a game.
The prototype's scenario selector is a review tool and will not ship in the product.

## Core task flows

1. **New visitor:** paste profile → explicitly check public library → review identity/work →
   start → saved batch progress → complete → overview. Checking the profile itself uses a
   small amount of API work; do not label the preflight as free of API calls. No API key prompt.
2. **Returning visitor:** open saved overview with no Steam calls → explicit Refresh →
   select quick refresh or full recheck with scope/estimate → import review. Quick refresh
   checks changed/new/recent games; it must not imply all games became current.
3. **Interruption:** pause request → finish/save the current batch if possible → paused with
   checkpoint → explicit Resume. Reopening offers saved work; it never restarts automatically.
4. **File-first:** choose local file → validate and identify combined backup, collector data,
   or plan-only data → appropriate preview → confirm when replacing data → local commit.
   Reading the file does not upload it and does not trigger Steam calls.
5. **Restore:** choose backup → validate → compare all affected profiles/plans/preferences →
   offer current-data export → confirm replacement → atomic commit → show restored freshness.
6. **Planning:** select game → inspect achievement → add to plan → visible saved status →
   review projected change. Adding a target changes a projection, never the observed unlock state.

## Import and recovery state contract

The implementation keeps the five backend states (idle, running, paused, complete, failed).
The following are reasons or presentation variants, not a second workflow engine.

| Situation | Visible message and action | Safety requirement |
| --- | --- | --- |
| Checking profile | “Checking public library…”; no invented percent | Guard double submit and acquire origin-wide lock first |
| Review ready | Profile identity, selected games, estimate, mode | Explicit start; explain estimate can change |
| Running | “Keep this tab open while importing”; saved X of Y | Separate durable processed count, successfully checked count, and unavailable count; one request at a time |
| Saving current batch | “Saving this batch…” | Do not show safe-to-close until write succeeds |
| Pause requested | “Pausing after the current batch…” | Stop future dispatch immediately; no promise of canceled upstream calls |
| User/hidden-tab paused | “Saved progress is ready to resume” | No automatic resume on focus or reload |
| Network/server error | Plain-language cause; Resume unresolved work | Preserve prior dashboard and successful operations; no auto retry |
| Rate limited | “Steam requests are paused”; available-after time | Resume disabled until allowed; countdown expiry is not a trigger |
| Allowance reached | Used/reserved calls, remaining estimate; explicit bounded Continue | Cumulative total survives continuation; no generic retry resetting it |
| Storage failure | “New results could not be saved”; Retry saving / Export unsaved results | No more Steam requests; distinguish memory from durable checkpoint |
| Another tab importing | “An import is active in another tab” | No second stream; offer saved library, no unsafe takeover |
| Permission expired | Explain any extra verification in Resume | User action; preserve ledger and checkpoints |
| No progress | “Import paused because no more results were returned” | No repeated continuation loop |
| Private/unavailable profile | Explain public profile AND Game details; edit link or file route | Do not replace prior library with empty data |
| Verified empty library | Clearly state no owned games were returned | Different from private/error; confirm replacement if applicable |
| Oversized/unsupported data | State supported limit/fallback in plain language | Do not silently truncate; retain prior snapshot |
| Import complete with gaps | Checked/failed/unavailable counts and per-game dates | Never call whole library current; retry only eligible unresolved work |
| All selected work complete | Completion summary; View library | Update freshness only for work actually verified |
| Save conflict | “Data changed in another tab”; reload current saved version | Preserve recoverable edits; no silent overwrite |
| Local data corrupt/unavailable | Explain recovery options, file/demo route | Do not present as ordinary first visit or silently reset |

Cancel means stop this import, not delete the existing library. Confirm before discarding a
checkpoint; label that action “Discard import progress.” Pause retains it. Switching views
should keep the controller alive where safe. Restore, profile switch, or deletion invalidates
it before writing. Browser leave-page wording is controlled by the browser; mobile kills
cannot be protected by a dialog. The warning supplements checkpoints, not replaces them.

## Make a lot of information readable

Overview reading order: data identity/freshness → next useful game → plan → supporting totals.
A compact recent-changes list uses confirmed unlocks since the previous snapshot; absent history
means “No comparison available,” not “No new achievements.” Avoid a chart that merely repeats a number.

Library rows: game name, unlocked/total + percentage bar, remaining count, freshness, and one
primary detail link. On narrow screens use stacked labeled rows instead of shrinking a wide table.
Search applies to the loaded library locally; filters show result count and Clear filters.
Sorting must state its direction and retain keyboard focus. Keep existing pagination; no new
infinite scrolling. Preserve state on return from detail.

Rarity is global unlock percentage, not estimated difficulty or time to finish. “Closest to
completion” ranks remaining achievement count and is not a promise that the game is easy.
Explain the completion-average denominator and rounding near the metric, with details on demand.
Projection compares current versus planned completion in percentage points, not percent growth;
unavailable targets are excluded. Show planned, unlocked, and unknown as distinct text states.

Trend charts need a title, time range, labeled axes/units, accessible summary/data alternative,
and unknown-date handling. Do not use color alone for series. Preserve existing analysis views
without making more charts a condition of first-release onboarding. Never fabricate a time series
from a single snapshot. Spoilers require an intentional reveal; do not expose hidden descriptions
through hover text or accessibility labels before reveal.

## Local data and destructive actions

Always call the location “Saved in this browser.” Explain clearing site data or changing devices
can lose custom plans; importing from Steam can restore game data, not the user's custom intent.
Do not imply cloud recovery or guaranteed offline reopening.

Export one combined backup by default, including all retained profile plans. A download action
reports “Download started,” not “Backup saved.” Data screen distinguishes the last successful local
save from a backup download. No automatic backup nagging in v1.

Restore preview must name the active profile change, incoming date, library availability, plans
replaced/removed for every profile, and preference replacement. Empty-plan backups and backups
without a library are valid. A generic “This replaces your data” warning alone is insufficient.
Wrong-profile plan-only imports are rejected; combined backup profile changes can be confirmed.
Invalid file, size limit, future version, and unavailable storage need different actionable errors.
All failures preserve prior data. Offer export before replacement/deletion, but do not require users
to download a file just to cancel. Deletion cannot delete already downloaded backups.

## Accessibility and responsive acceptance

Target WCAG 2.2 AA; this draft is not a conformance claim. See
[W3C quick reference](https://www.w3.org/WAI/WCAG22/quickref/) and
[W3C modal-dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

- Native landmarks, ordered headings, labeled fields and inline error associations; skip to content.
- All controls keyboard usable, visible focus, logical focus order, no hover-only information.
- Modal initial focus inside, contained Tab navigation, Escape/cancel, focus restored to opener
  or logical destination. Destructive confirmation defaults focus to the safe action.
- Announce meaningful status transitions politely, not every changing counter. Errors use text;
  progress has an accessible name and value only once its denominator is known.
- Ordinary text contrast at least 4.5:1, large text and relevant non-text indicators at least 3:1.
  Aim for 44px interactive targets as a product design target; do not misstate the AA minimum.
- No lost content at 320 CSS pixels, text resizing, or reduced-motion preference. Mobile actions
  remain reachable without horizontal page scrolling; no sticky element obscures focused controls.
- Test real screen-reader behavior during Svelte implementation; DOM checks cannot replace it.

## Implementation slices and completion gates

0. **shadcn-svelte foundation:** add required primitives, centralize theme/control variants,
   build a local component gallery, and migrate existing visible controls. Gate: no parallel
   custom primitive system; existing/new views pass the shared component audit.
1. **Data foundation and Data screen:** atomic local migration, combined backups, validation,
   replacement preview, failure/conflict states. Gate: round-trip and failure preservation tests.
2. **Onboarding and import controller:** profile/file/demo entry, review, progress, pauses,
   API allowance, multi-tab behavior. Gate: mocked API ledger tests plus browser recovery tasks.
   Completed/inactive plan preservation must work before releasing any new import, even though
   the richer plan presentation arrives in slice 4.
3. **Overview and freshness:** integrate per-game dates, quick/full review, near-completion and
   recent-change hierarchy. Gate: unknown/stale/partial datasets do not imply false freshness.
4. **Library/detail/plan polish:** local search/filter, narrow layouts, target state/projection
   semantics, retained inactive targets. Gate: keyboard/mobile and cross-profile plan tests.
5. **Analysis polish:** accessible existing explorer/optimizer/trends, empty-data explanations.
   Gate: charts use real supported history and have text alternatives.

Do not implement new backend infrastructure to support a visual flourish. Prototype interactions
are simulated: storage transactions, actual file parsing, Steam requests, leave-page behavior,
and rate-limit enforcement need separate production implementation and tests.

Before release: perform a short task session with actual users (first import, find a target,
pause/resume, export/restore). Record unprompted mistakes and ability to explain where data lives.
Subagent persona walkthroughs are hypotheses, not observed user research. Resolve high-impact
confusion before visual polishing. The prototype and reviews provide an implementation brief;
no new product decision is required to start the first slice.

## Existing-code handoff

The flow review identified these migration points; avoid treating existing behavior as the new specification:

| Existing area | Required change |
| --- | --- |
| `GetStarted.svelte` | Move personal-key/Python instructions into the collector fallback; profile/file/demo entry comes first |
| `+page.svelte` file acceptance | Add validation and replacement review before committing; distinguish storage load failure from no saved data |
| Plan reconciliation/help copy | Retain completed and missing targets with explicit status; remove claims that they are automatically deleted |
| Overview's single updated timestamp | Represent last save separately from per-game Steam verification and partial-refresh coverage |
| Save-warning behavior | Mark memory-only results clearly; halt import scheduling until checkpoint persistence succeeds |
| Shared shell | Own the import controller above view navigation; show persistent status, profile identity, and Data & backups |

The implementation should use reusable status, freshness, game-row, metric, and confirmation
components, not separate duplicated pages for each error. Keep domain state outside presentation.
No new UI framework, server polling loop, animation library, or chart dependency is required.

## Review refinements

- Check usable local storage before starting profile lookup/import. If writes are unavailable,
  explain the limitation before spending Steam calls and offer demo/file recovery options without
  claiming durable storage will work. Preserve existing recoverable memory data.
- Sample mode always says “Sample library” and offers “Use my profile.” Never imply sample
  results belong to the visitor. Import review includes Change profile before Start.
- During the ordinary six-hour refresh cooldown show the next available time and explain that
  the saved library remains usable. This differs from a server rate-limit wait. Reload does not
  bypass either. Neither timer triggers an automatic refresh.
- Transient errors pause with the candidate still staged. If all selected operations have either
  succeeded or reached a terminal unavailable state, publish valid updates atomically, preserve
  prior values for unavailable fields, and summarize updated/retained/unavailable separately.
  “Complete” means no remaining scheduled work, not that every game was checked successfully.
- If a backup contains plans but no active library, say “Plans restored. Open or import a library
  to use them”; do not hide the restored plans behind apparently empty onboarding.
- Verify the concrete empty-state tasks: no search matches → Clear filters; empty plan →
  Find achievements; verified empty library → explain verified result and offer another profile.

## Consistent UI across the entire site

The [shared UI style guide](ui-style-guide.md) is the visual contract for every existing and
new screen. Consolidating semantic tokens and shared controls is the first frontend task,
before adding new screen-specific styling. The guide records current drift, component
contracts, typography/spacing scales, status colors, icon and wording rules, and a side-by-side
review gate. Existing Overview, Library, Achievements, Plan, Optimizer, Trends, and help screens
must migrate too; onboarding and backups must not become a separate visual theme.

## Component library decision

Use **shadcn-svelte everywhere** for available UI primitives, retaining the configured nova
style and shared theme. The [adoption audit](shadcn-svelte-audit.md) maps the current gaps.
The first frontend slice must consolidate existing custom controls into that foundation;
all new screens use it from the outset. The standalone HTML preview is a layout study, not
a compliant component implementation. Further executable prototypes use real shadcn-svelte
components so visual review tests the same building blocks that will ship.
