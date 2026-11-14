# shadcn-svelte adoption audit

**Implementation update (2026-11-14):** the migration is now implemented locally.
See [current verification and rollout gates](migration-verification.md). The original
planning/audit evidence below is retained as historical context, not current completion status.

2026-11-14. Independent subagent audit requested by the user.
Decision: use shadcn-svelte throughout the site for available UI primitives, keeping the
configured nova style. See the [style guide](ui-style-guide.md) for shared theme rules.

## Finding: partial adoption, not site-wide adoption

`components.json` configures shadcn-svelte nova/slate, Tailwind CSS in `src/app.css`, and
`#lib/components/ui` aliases. That directory currently contains only Button. Only
`src/routes/+page.svelte` and `GetStarted.svelte` import it. Installing Bits UI and matching
the color palette does not make custom controls shadcn-svelte components.

## Migration map

Paths below are relative to `src/lib/components/` unless otherwise stated.

| Current implementation | Required shared primitives / action |
| --- | --- |
| `src/routes/+page.svelte`: custom sidebar buttons and direct Bits UI plan dialog | shadcn Sidebar/navigation composed with Button; Sheet for the plan overlay; Badge for demo state |
| `GetStarted.svelte`: shared Button, raw visible form fields | Keep Button; Input and Label/Field for visible fields and validation |
| `GameLibrary.svelte`: custom buttons, select/search, chips, table, progress, pagination | Button, Input, Native Select or Select, Toggle Group, Table, Progress, Pagination |
| `AchievementExplorer.svelte`: similar custom filter/table controls | Same shared primitives as Library; shared status Badge and accessible field labeling |
| `GameDetail.svelte`: native dialog, custom filters/actions | Dialog, Input, Native Select/Select, Button, Badge; preserve domain achievement layout |
| `PlanPanel.svelte`: custom close/remove/import/export controls | Button and shared panel/Card; host in Sheet when overlaid; Alert Dialog for destructive confirmation |
| `OptimizerView.svelte`: custom buttons/range controls/panels | Button, Slider, Card; retain calculation and suggestion logic |
| `Overview.svelte`: custom metric panels/progress and game actions | Card, Progress, Button, Avatar/Badge where appropriate; retain domain grid and game artwork |
| `Trends.svelte`: direct LayerChart chrome/tooltips and custom game buttons | shadcn chart theme/container/tooltip integration, Button; retain supported LayerChart plots/data |
| New import/recovery/data screens | Alert, Progress, Input, Button, Card, Dialog/Alert Dialog, Collapsible; shared status vocabulary |
| `src/app.css`: .button/.btn/.input/.chip and global field styles | Migrate consumers, then remove competing primitive styling; keep semantic tokens and layout CSS |

Choose primitives by behavior, not appearance alone. A filter toggle is not a navigation tab.
Prefer the simple Table primitive with existing sorting/pagination logic; no new data-table
engine is required. Add only components needed by the current migration slice. Bits UI can
remain an underlying shadcn dependency; app screens should use the shared shadcn wrappers
rather than constructing a second dialog system directly from Bits UI.

## Shared-component mismatches

Current Button defaults to `h-8` / `size-8` (32px), while the planned shared control hit area
is 44px. It also has ring/outline styling that must be reconciled with the shared focus
contract. Resolve these centrally in the local shadcn component and tokens, not through
per-screen overrides. Theme customization is allowed; replacing component behavior with
handwritten alternatives defeats the decision.

Native landmarks, headings, paragraphs, images, hidden file inputs, and domain-specific
layout remain appropriate. These are not competing UI libraries. Raw visible controls
need migration unless a concrete functional exception is documented. Game data/calc logic
and existing chart data are not to be rewritten merely to adopt the component library.

## Order and acceptance

1. Add needed shadcn primitives; align Button variants, control sizing, theme and focus.
2. Build a small local component gallery from those actual components.
3. Migrate shell, fields, dialogs/sheets and destructive confirmations first.
4. Migrate library/explorer/planner/optimizer controls, tables and progress.
5. Apply shared panels, badges, chart integration and status patterns; remove unused legacy CSS.
6. Build new frontend flows exclusively from the shared primitives and domain compositions.

Review imports/rendered controls and styles, not just package presence. Check existing and new
screens together at desktop/mobile widths, keyboard operation, focus restoration, contrast,
form labels, disabled/loading/error states and 320px reflow. Run Svelte checks/build and the
relevant browser flows after code migration. A raw-element search is a useful audit aid,
not a test that bans legitimate native HTML or the internals of shadcn components.

## Prototype and status boundaries

`frontend-preview.html` is standalone handwritten HTML and is **not** a shadcn-svelte
implementation. Keep it as an explicitly illustrative layout reference. Future executable
screen drafts should use the real Svelte components. Historical verification reports
remain historical; they do not demonstrate completion of this migration.

This turn completed the audit and planning updates. Production UI migration remains work
for the first frontend implementation slice. No component library was changed or installed.
