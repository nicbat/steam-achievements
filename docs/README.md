# Documentation map

## Current instructions

- [Repository rules](../AGENTS.md): short agent entry point.
- [Contribution workflow](../CONTRIBUTING.md): implementation, verification and PR process.
- [Current handoff](plans/agent-handoff.md): branch, current evidence and remaining work.
- [UI repair record](plans/ui-repair-plan.md): reproduced bugs, repairs and acceptance limits.
- [UI style guide](plans/ui-style-guide.md): shared visual conventions.
- [Deployment checks](plans/free-tier-readiness.md) and [monitoring](plans/vercel-monitoring.md):
  rollout considerations; neither is evidence that production configuration has been verified.

## Historical context

The frontend plan/review, shadcn audit, UI verification, migration verification and
SvelteKit/Steam import plan record the migration's evolution. They contain superseded
counts, batch sizes, status and proposals. Use source, tests and the current handoff for
present behavior; do not implement an old proposal just because it appears in a plan.
The HTML mockups in this directory and `plans/` are illustrative drafts, not acceptance evidence.
`plans/archive/` holds abandoned durable-backend proposals, not current requirements.

## Maintenance

Update current instructions in place. Add a new plan only for a distinct substantial task;
link it from the handoff. Keep historical records intact and clearly labeled. Replace stale
status rather than adding a contradictory paragraph at the top. When code behavior changes,
update the corresponding reference and tests in the same PR. Report disagreements explicitly
instead of treating an old document as authority over the user's current request.
