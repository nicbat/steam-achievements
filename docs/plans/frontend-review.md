# Frontend design review and verification

> Historical migration record. Status, test totals and proposed behavior below may be
> superseded. See [current handoff](agent-handoff.md) and [workflow](../../CONTRIBUTING.md).

2026-11-14. Companion to the [frontend plan](frontend-plan.md) and
[screen prototype](frontend-preview.html). All prototype data and operations are simulated.

## Independent review method

Three subagents approached the work separately: screen design/implementation, information
architecture and recovery flows, and task-based user simulation. After drafting, the latter
reviewers inspect the actual prototype for consistency and confusion. Browser checks and
screenshot inspection supplement those reviews. These are heuristic evaluations, not a
usability study with actual users, and not proof of production/backend correctness.

## Simulated task walkthroughs

| Persona and task | Predicted confusion | Severity | Design requirement |
| --- | --- | --- | --- |
| New visitor: import profile and find a next goal | Thinks Steam login, personal API key, or Python is required | High | Profile input, no login/key requirement, verified identity, file/demo alternatives |
| Returning after three weeks: refresh library | Believes a quick refresh checked every game | High | Checked/retained/overdue coverage, explicit full recheck with estimate |
| Mobile visitor: switch apps during import | Assumes background completion or interprets stopped progress as broken | High | Explain paused while away, durable checkpoint count, explicit Resume |
| Planner: pick remaining achievement and add it | Confuses rarity with difficulty or planned with unlocked | Medium | Global unlock-rate label/caveat, Planned status, percentage-point projection |
| Private profile: recover from failed import | Interprets error as no games and loses previous data | High | Private/unavailable explanation, edit/file actions, no empty replacement |
| Backup restore: replace multiple profiles' plans | Does not realize all plans are replaced | Critical | Named profile impacts, current export opportunity, explicit replacement |
| Storage full: preserve newest results | Normal export silently contains older durable data | Critical | Distinct unsaved-data export and retry-saving path; halt requests |
| Large import: reach call allowance | Generic Continue hides additional API use | High | Saved/remaining work first, explicit bounded allowance, cumulative count |
| Shared browser: another tab imports | Repeated clicks launch competing imports | High | Explain other tab, no false “switch tabs” capability or unsafe takeover |

## Decisions from the reviews

- “Check profile” precedes import review and itself uses bounded Steam work.
- Keep one active saved library visible while a separate candidate snapshot is collected.
- Do not equate processed games with successfully checked games; show unavailable counts.
- Replace ambiguous Cancel/Restart with Pause and explicit Discard import progress.
- A rate-limit countdown only enables Resume; it never starts work.
- Separate local save time, Steam verification time, and backup download initiation.
- Preserve completed and unavailable plan intent, with unavailable targets excluded from projections.
- No extra infrastructure or blocking product decision was introduced by these screens.

## Prototype coverage versus production gates

The screen selector is for design review only. Sample file/restore/export operations do not
validate real backups or exercise IndexedDB. Real atomicity, leave-page warnings, lifecycle
suspension, multi-tab locks, request pacing, cumulative ledgers, and API limits remain the
acceptance tests in the backend and frontend plans. Native browser dialogs and screen-reader
behavior also require verification in the final Svelte application.

## Review findings addressed in the written plan

The independent flow and persona passes also added: verify storage before spending calls;
make a plans-only restore intelligible; distinguish refresh cooldown from server rate-limit wait;
keep sample identity visible; offer Change profile before import; and clarify when a candidate
with terminal gaps becomes the active snapshot. Completed/inactive target preservation is a
release gate for imports, not something deferred until planner visual polish.

The prototype pass found real presentation contradictions: quick-refresh scope changed on the
progress screen; budget counters reset after continuation; collector-file preview implied the
wrong replacement scope; near-completion ordering/filtering disagreed; and no-results lacked a
clear reset action. These were sent back to the designer for correction before final verification.
Native dialogs already supplied the right foundation, but route focus and control boundaries
needed refinement. These changes require no added backend features.

## Final browser verification

Ran the standalone HTML through headless Chromium/Playwright on localhost, with no live API.
All 20 scenario screens rendered at 1440, 390, and 320 CSS-pixel widths without horizontal
page overflow. No JavaScript console errors or external network requests were observed.

Verified connected interactions:

- Quick refresh preserves its eight-game scope into progress.
- Budget approval preserves 982 counted calls and increases the displayed allowance to 2,000.
- Storage, network, and rate-limit pauses remain paused while browsing the saved library,
  and View import returns to the original reason.
- Collector-file review explicitly preserves all profile plans instead of using backup replacement.
- Profile entry, review, Change profile, filtering and Clear filters work in the sample.
- Modal safe initial focus, Tab containment, Escape, and return focus pass. The first test found
  Tab could leave the native dialog's page focus cycle; explicit boundary wrapping fixed it.
- Reduced-motion mode renders. Desktop/mobile screenshots were visually inspected.
- First-visit screens hide saved-data navigation/export. Changing review scenarios clears stale toasts.

Measured token contrast: normal text/panel 11.77:1, secondary text/panel 6.77:1,
blue/panel 7.08:1, gold/panel 7.42:1, primary-button text/background 8.69:1.
The initial divider color was only 2.07:1 on panels, so interactive control boundaries use
an intentionally stronger color; decorative dividers retain the quiet original color.
This is a selected-token check, not an exhaustive accessibility audit.

Final captures (local temporary artifacts):

- [Desktop overview](/tmp/ui-capture/steam-data/2026-11-14T19-24-20-final-overview.png)
- [First visit](/tmp/ui-capture/steam-data/2026-11-14T19-24-20-final-welcome.png)
- [API allowance review](/tmp/ui-capture/steam-data/2026-11-14T19-24-20-final-budget.png)
- [Restore preview](/tmp/ui-capture/steam-data/2026-11-14T19-24-20-final-restore.png)
- [Mobile overview](/tmp/ui-capture/steam-data/2026-11-14T19-24-20-final-mobile-overview.png)

Earlier draft captures remain in the same temporary folder: `2026-11-14T19-22-15-overview-draft.png`,
`2026-11-14T19-22-16-mobile-draft.png`, and the five `2026-11-14T19-23-56-final-*` captures.
Use the 19:24:20 versions above for review.

## Remaining design limitations

The sample is a screen study, not a complete functioning application. Example game links share
one detail screen; most target removal/restore/export outcomes are explicitly simulated;
rate-limit time is illustrative rather than a running timer; profile input maps to a sample
identity. Advanced explorer/trends/optimizer views remain in the existing Svelte implementation
and are covered by the plan rather than duplicated here. Full screen-reader, text-zoom,
mobile-device lifecycle and production data tests remain release gates. Real user sessions
are still needed to validate the simulated confusion hypotheses.

No blocking product decisions remain for the first frontend implementation slice. Visual taste
can be refined against the prototype without changing the agreed backend architecture.
