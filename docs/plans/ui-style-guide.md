# Shared UI style guide

2026-11-14. The visual contract for all upcoming frontend work, including existing screens.
Companion: [frontend plan](frontend-plan.md), [screen drafts](frontend-preview.html).
This is the shared design direction. The UI repair pass now implements the core contracts;
see [repair implementation and verification](ui-repair-plan.md). Drift/adoption findings
below describe the pre-migration baseline, not the current installed component set.

## One system, not one design per screen

Overview, Library, Achievements, Optimizer, Trends, Plan, onboarding, import, help, and
Data & backups share the same typography, semantic colors, control variants, spacing,
focus treatment, and status vocabulary. Layout can change for the task; component appearance
and meaning must not. Desktop and mobile are responsive versions of the same system.

**Use shadcn-svelte throughout the site.** This is an explicit user decision, not an optional
implementation suggestion. Keep the existing `nova` registry style in `components.json`.
Add needed shadcn-svelte components to the local UI directory and compose domain screens
from them. Do not introduce another UI kit or hand-build parallel versions of available
controls. Native semantic HTML remains appropriate for page layout, text, images, and file
input plumbing; it is not a loophole for a second styled control system.
Production tokens live in `src/app.css`; reusable controls live in `src/lib/components/ui/`.
Customize shadcn-svelte through its shared semantic tokens and component variants, keeping
its behavior and accessibility foundations. The palette and sizes below are shared theme
choices, not instructions to override individual controls with unrelated CSS.
Screen-local CSS is for layout and genuinely unique visualizations, not alternative buttons,
fields, notices, dialog chrome, or color palettes. The standalone HTML is a visual reference,
not a second production stylesheet to copy into each view.

## Semantic palette

| Token / purpose | Value | Usage |
| --- | --- | --- |
| background | #18212D | App canvas |
| card / popover | #243244 | Grouped content, menus, dialogs |
| foreground | #F0F4F8 | Primary text |
| muted-foreground | #ACBDCE | Secondary text and labels; not disabled opacity |
| primary | #78C9F2 | Primary actions, links, selected controls, ordinary progress |
| primary-foreground | #142332 | Text on primary buttons |
| gold | #E8BE65 | Achievement/completion emphasis, focus outline |
| border | #4D6279 | Quiet decorative dividers and panel boundaries |
| input / control-border | #7893A8 | Visible field and outlined-control boundaries |
| secondary / hover | #34475F | Secondary surfaces and interactive hover |
| success | #A7DFC0 | Confirmed saved/completed status, always with text |
| warning | #E8BE65 | Attention needed, always with a reason and action |
| destructive | #FFB6AD | Errors, destructive actions, unsaved state |

Gold denotes achievement emphasis in content; warning components also include a warning
label/icon and explanation, so gold alone never conveys status. Planned is not unlocked:
use a labeled neutral/blue state for planned targets and a distinct completion label for unlocks.
Overdue/unavailable/unknown use text, not just dimmed rows or colored dots.

Keep separate decorative and interactive borders: the subtle divider is insufficient as the
only indication of an input boundary. Hover must not erase contrast. Avoid per-screen hex
values except actual game artwork and documented chart series tokens. Do not tint entire
screens differently for import, settings, or planning.

## Type, spacing, and shape

- Font throughout: `"Segoe UI", system-ui, sans-serif`; no downloaded display font.
- Body: 16px / 1.5. Secondary and dense data: 14px / 1.5. Small metadata: 12px only for
  nonessential detail; never the main form instructions, errors, or primary controls.
- Page titles: 32px desktop / 28px narrow, weight 650, line-height 1.2. Onboarding may use
  a 40px display title. Section titles: 24px / 1.3, weight 600. Subheadings: 18px / 1.4.
- Numeric metrics: 28–32px with tabular numerals. Tables, counts, dates, and projections
  use tabular numerals when aligned. No all-caps section labels.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px. Use 8–12px within control groups,
  16–24px within sections, and 32px between major sections.
- Panel padding: 24px desktop / 16px narrow. Page gutters: 32px desktop / 16px narrow.
  Default content max-width 1200px; dense analytical views may reach 1440px with the
  same header, gutters, and title alignment. Reading/form text stays around 65–75 characters.
- Radii: controls 6px; panels/dialogs 10px; badges 4px; progress tracks fully rounded.
  Rounded pills are reserved for genuinely toggleable chips, not every label.
- Use borders and spacing rather than repeated shadows. Only overlays need elevation.

## Shared component contracts

| Component | Consistent treatment and behavior |
| --- | --- |
| Button | Primary blue, secondary outlined, quiet/ghost, destructive, link; same type and radius everywhere |
| Button sizing | Default and icon hit area at least 44px; compact visual content may sit inside that area; labels wrap on narrow screens |
| Field | Persistent visible label, optional help, associated error, same border/padding/focus; placeholder never replaces label |
| Page header | One h1, optional concise description, primary page action; action stacks below heading on mobile |
| Panel | Groups related content; not every number needs its own card; same padding/radius/border |
| Status notice | Same icon/text/action structure for info, success, warning, error; reason, preserved work, next action |
| Progress | Labeled count and denominator when known; durable vs unsaved clearly separate; no guessed percentage |
| Badge | Compact text status; no interactive styling unless it is actually a control |
| Game row | Name, progress count, freshness, next action; shared formatting across overview/library/optimizer/plan |
| Empty state | Specific reason and a useful next action; same spacing and tone |
| Dialog | Shared title/body/action layout, safe default focus, keyboard containment, Escape and focus restoration |
| Toast | Brief noncritical confirmation; persistent errors belong inline, not only in a disappearing toast |
| Table / pagination | Consistent row padding, heading case, numeric alignment, sort indicators, and Previous/Next controls |
| Chart | Same label fonts, series meanings, axis/grid treatment, tooltip and accessible text alternative |

A loading button keeps its footprint and says what is happening. Disabled controls explain
why when it is not obvious. Hover, active, selected, focused, disabled, loading, error, and
empty states are part of the component specification, not last-minute screen overrides.

Use the existing Lucide icon family for product controls, consistent stroke and 18–20px size.
Icons accompany text unless space truly requires an icon-only control, which needs an
accessible name. Game artwork and achievement icons are content; provide consistent fallback
size without inventing unrelated emoji styles across screens.

Use one focus treatment: visible 3px gold outline with 3–4px offset, never clipped or hidden.
Avoid combining several competing outline/ring systems. Route changes focus the heading;
modals restore focus on close. Honor reduced motion; no decorative automatic animation.

## Shared language and data formatting

- “Saved in this browser” = durable local save; “Checked with Steam” = verified source data;
  “Download started” = backup action. Never use one generic Updated label for all three.
- Use “Data & backups” as the full destination label. A compact “Backups” nav label is allowed
  on narrow layouts, but the screen title and actions retain the same terminology.
- Use Check profile, Start import, Pause import, Resume import, Discard import progress,
  Export backup, Restore backup. Avoid competing synonyms across screens.
- Display locale-formatted dates; exact timestamp available in detail. Relative timestamps
  must not hide which event they describe. Cooldowns display an available-at time.
- Progress uses unlocked / total and a percentage consistently. Unknown is “Unknown” or
  “Not checked,” not zero. Rarity is “Global unlock rate.” Projection changes use percentage points.
- Current and projected values use consistent precision and rounding rules from existing
  calculation helpers; visual formatting must not change the calculation.

## Drift found in the existing code

| Area | Current difference | Migration action |
| --- | --- | --- |
| `src/app.css` vs prototype | Different backgrounds, surfaces, blues, golds, muted text | Adopt semantic palette once in app.css; replace literal aliases as touched |
| Typography | App body 15px and h2 21px; prototype body 16px and h2 23px | Apply shared type scale across all views together |
| Controls | Shared Svelte Button defaults to 32px; legacy .button/.btn has separate padding/radii | Make Button canonical, migrate legacy usages, remove obsolete styles after last consumer |
| Focus | Global outline and Button ring variants can compete | One shared focus contract; verify actual rendered variants |
| Errors / status | Hard-coded error/positive colors plus generic notices | Semantic status tokens and shared notice/badge treatments |
| Component-local styles | Multiple local sizes/radii alongside global styles | Retain layout-specific CSS; replace duplicated visual primitives with shared components |

Do not claim consistency is complete simply because tokens exist: old components must actually
consume them. Do not perform a broad blind CSS replacement; check each view and its narrow layout.

## Implementation and review gate

Before implementing new screens, migrate shared controls to shadcn-svelte and consolidate
tokens, then make a small
component gallery using the actual Svelte components. Include all button states, fields with
errors, notices, badges, progress, game rows, empty states, a dialog, and chart labels. This is
a local development/review surface, not a new public feature or a Storybook dependency.

Migrate the existing screens and new flows using those components. Temporary compatibility
classes may bridge old controls, but must resolve to the same tokens and sizes and have an
explicit removal step. The old HTML concept remains historical, not another theme to maintain.

For every frontend slice:

1. Compare representative existing and new screens side by side at desktop and narrow widths.
2. Check identical controls have identical appearance and behavior, including hover/focus/errors.
3. Check colors, text sizes, spacing, radii, icons, and terminology against this guide.
4. Check keyboard access, contrast, 320px reflow, text resizing, reduced motion, and touch targets.
5. Reject new isolated color/size constants unless a meaningful exception is documented here.

The prototype currently illustrates the direction but still has some ad hoc sizing and specimen
controls. The shared production components and gallery are the implementation source of truth;
prototype CSS is not to be copied wholesale. Accessibility verification follows the linked
frontend plan; this guide itself is not a conformance claim.

## shadcn-svelte adoption gate

At the original audit, only Button was installed under `src/lib/components/ui/`.
The migration has since installed and adopted the shared primitives. The [adoption audit](shadcn-svelte-audit.md) records the
remaining migration. Installing a component or matching its colors does not prove adoption.

For each existing or new screen, use the appropriate shared shadcn-svelte primitives for
controls and conventional UI surfaces. Prefer Native Select for simple dropdowns; introduce
Select/Combobox only when their behavior is needed. Use Table with the existing local sorting
and pagination logic before introducing a more elaborate data-table engine. Compose game
rows and achievement summaries from shared primitives plus domain layout.

Use shadcn-svelte's chart integration for shared chart chrome/tooltips/theme while retaining
the existing LayerChart-based calculations and data. Do not add a second plotting library
or force a noninteractive custom visualization into an unrelated control.

Audit render trees/imports as well as screenshots. Raw interactive controls outside the UI
implementation need a documented functional reason (such as a hidden file input); existing
legacy controls are migration debt, not permanent exceptions. Static HTML prototypes only
illustrate layouts. Future executable screen drafts should use the actual Svelte components.

Component selection follows the [official component catalog](https://www.shadcn-svelte.com/docs/components).


## Current implementation ownership

- Element defaults live in `@layer base`; component utilities may override them.
- Card's `layout="structured"` uses Header/Content padding; `layout="padded"` is for
  direct children. Both share 24px desktop / 16px narrow padding. Do not restore `.panel`.
- Mobile navigation uses the labeled native selector; desktop uses shared Button variants.
- Responsive data rows use `.responsive-data` and cell `data-label` attributes, preserving
  one table/action tree. Screens own domain layout, not duplicate controls.
- Domain selectors must be specific to their component; do not reintroduce global names
  such as `.projection` shared between Overview and Plan.
