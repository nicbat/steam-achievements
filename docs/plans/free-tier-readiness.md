# Minimal backend readiness

**Implementation update (2026-11-14):** the migration is now implemented locally.
See [current verification and rollout gates](migration-verification.md). The original
planning/audit evidence below is retained as historical context, not current completion status.

Updated 2026-11-14. The user chose simplicity and accepts imports stopping when the
tab closes. The [current plan](sveltekit-and-steam-import.md) is authoritative.

## Selected scope

SvelteKit on Vercel Hobby, short Steam API requests, browser-held caches and resumable
local checkpoints. No Cloudflare, Redis, Vercel Workflow, server snapshot cache,
background queue, or account system. Combined backup/restore remains required.

The earlier [durable-backend review](archive/durable-readiness-review-2026-11-14.md)
is historical. Its three independent reviews supplied useful browser integrity,
validation, retry, payload, and secret-handling requirements retained in the current
plan. Strong global budget enforcement and unattended execution are explicitly
removed from v1 rather than falsely claimed without shared state.

## Evidence still relevant

- Vercel team nicbats-projects was confirmed Hobby. Project steam-achievements uses
  Node 24 and still has the Vite preset. No environment variables were present.
- CLI usage inspection could not expose remaining Hobby allowances; an Observability
  query required a paid feature. No connected browser was available. Dashboard Usage
  remains a deployment check, not presumed unused capacity.
- Local 205-game export measured 5,174,995 bytes on disk, 4,110,273 compact JSON,
  783,641 gzip. Parse imports in the browser and send small summaries/batches.
- The old collector estimate was 526 cold calls or 210 with reusable metadata.
  At two calls/second, a cold run would already take 263 seconds before overhead;
  short browser-orchestrated batches are safer than a single long request.
- Cloudflare and Workflow local spikes passed, but are not dependencies or validation
  of the minimal backend. No providers were provisioned, no live Steam calls made,
  no deployment performed, and no paid plan enabled during that investigation.

## Remaining checks

Implement bounded collector/endpoints and the browser controller; test checkpoints,
warning behavior, partial errors, and storage failures. Configure the Steam key,
permission-signing secret, per-request limits and import flag. Check account usage,
included platform protections, and a preview's real request costs before a limited
pilot. Exact global quota protection cannot be promised by this stateless design.
There is no Cloudflare login, durable store, or workflow-runner setup requirement.

The close-page dialog uses browser-controlled wording and is not guaranteed on
forced shutdown/mobile termination. Save throughout the operation and recover from
checkpoints. [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).

## Minimal-plan independent review (2026-11-14)

Three further subagents reviewed the simplified plan for minimality, server load,
and Steam API use. Findings are incorporated in the main plan:

- One browser-wide import lock and one in-flight request; no added scheduler/store.
- Persisted whole-import attempt ledger, conservative lost-response accounting,
  and explicit review at 1,000 attempts. This is an accidental-loop guard only.
- Zero automatic retries; stop on throttling/systemic failure and retry only unresolved
  operations explicitly. Do not copy the standalone collector's retry behavior.
- Quick refresh touches selected changed games; broad overdue/full checks are explicit.
  Metadata age alone cannot trigger a library-wide sweep.
- Five-game batches, twenty outbound-attempt ceiling, sequential paced upstream calls,
  deadlines and byte limits. Oversized cases use a clear fallback instead of new
  streaming infrastructure. Account for discovery and schema/rarity requests too.
- Configure the included Vercel Hobby rate-limit rule before the limited pilot;
  its regional/IP request counter is not a global Steam allowance counter.
- Defer cross-profile cache deduplication and backup reminders. Keep atomic backup,
  migration, revisions and deletion safety because plans have no cloud recovery copy.

[Vercel WAF documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
confirms one Hobby fixed-window rule, IP/JA4 keys, and regional counters. Rule setup
and enforcement are planned, not applied. The default is twenty import requests/IP
per sixty seconds, subject to staging validation and included allowance.

Valve's [API terms](https://steamcommunity.com/dev/apiterms?l=english) specify
100,000 calls/day and key confidentiality. Our 1,000-call local review threshold and
two-call/second pacing are chosen app defaults, not Valve limits. Other consumers
of the same key share its allowance. About 190 of the old 526-call cold imports
would consume 100,000 calls before retries/other traffic; broad anonymous use still
needs an explicit aggregate-budget decision. None of these reviews deployed code,
configured rate limits, or made live Steam requests.
