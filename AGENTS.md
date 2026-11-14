# Working in Achievement Atlas

Applies throughout this repository. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
editing and [the current handoff](docs/plans/agent-handoff.md) for open work.

- Work on a task branch and keep progress in commits and a PR. Inspect `git status`
  first; preserve changes you did not make. Do not merge or deploy production unless
  the user asks. Pushing a PR may automatically create a Vercel preview.
- Keep changes focused on an observable problem. Reproduce it, state the expected
  result, repair one coherent slice, and verify that result before broadening scope.
  Do not combine a framework rewrite, data migration and visual redesign in one task.
- Keep SvelteKit, shadcn-svelte, existing theme and browser-owned data. Do not add
  services, dependencies or abstractions merely to clean up code.
- Use shared component variants for visual states. Consult the style guide before
  changing CSS; avoid competing global, local and inline overrides.
- Write readable source. Do not compress handlers or whole templates onto long lines.
  Keep formatting-only cleanup separate from behavior changes when practical.
- A button must perform the action its label promises, or explain why it cannot.
  Check its outcome from relevant empty, sample, saved, paused and completed states.
  For UI behavior fixes, add a focused regression and inspect the running UI.
- Preserve explicit import review/resume, bounded requests, persistence and recovery.
  Mock Steam in automated tests. Never print or commit credentials or personal exports.
  Do not clear the user's browser storage. Live diagnostics require explicit scope.
- Run checks appropriate to the change using CONTRIBUTING.md. A successful build or
  preview is not proof of a working interaction. Report what was tested and what was not.
- Keep one dev server per checkout; stop it before building, then restart if needed.
- Update current docs in place. Historical plans describe past decisions, not new
  requirements. Do not add another overlapping handoff or append contradictory status.
- At handoff, record branch/PR, completed work, unresolved issues, evidence and next step.
  Distinguish local tests, CI, preview deployment and production readiness.
