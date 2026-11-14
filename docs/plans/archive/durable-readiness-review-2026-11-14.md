# Superseded architecture review

Historical only; current design is [the minimal backend](../sveltekit-and-steam-import.md).

# Free-tier backend readiness and independent review

Checked 2026-11-14. This is the decision record for the
[implementation plan](../sveltekit-and-steam-import.md). No service was provisioned,
no deployment or billing configuration changed, and no live Steam request was made.
Local feasibility spikes used synthetic data in /tmp, not the user's Steam export.

## Selected stack

**Vercel Hobby + Cloudflare Workers Free. No Redis service is required.**

- Vercel: existing SvelteKit app/domain, server endpoints, and Vercel Workflow for
  resumable import execution. A workflow step processes a bounded batch; it does
  not represent one Steam call. Accepted jobs can continue after closing the tab.
- Cloudflare: one production SQLite-backed Durable Object (DO) for shared quota
  counters, jobs, leases, generations, capability hashes, manifests, compressed
  immutable chunks, metadata cache, and expiry indexes. Use its key/value storage
  API; no separate SQL database/account service is introduced. Storage operations
  are transactional and strongly consistent.
- A thin Worker HTTPS gateway authenticates Vercel's server-only service credential
  before invoking the object, enforces bounded bodies, and forwards binary streams.
  No browser receives the service credential. Compression, decompression, large
  JSON parsing, and serialization run in Vercel or the browser, not the gateway.
- Cloudflare Turnstile Free for expensive new imports and suspicious traffic.
  Validate hostname/action and bind token redemption to one admission atomically.
- Use a US-jurisdiction DO namespace and Vercel iad1 initially. A location hint alone
  is not a residency guarantee; describe provider recovery/log retention separately.
  [DO storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
  [data location](https://developers.cloudflare.com/durable-objects/reference/data-location/).

Keep control and cache namespaces in one object for the pilot: this permits atomic
byte accounting and manifest publication with generation/fencing checks. Separate
objects only if measured contention warrants it. The 150 MB disk/storage cap below
is not an in-memory allowance: never read all values or perform unbounded list scans.

## Why this choice changed during review

Upstash Free plus Vercel Workflow was the initial candidate. Review found that
Upstash's documented eventual consistency/failover semantics did not establish the
strict quota and deletion-generation guarantees in our plan. A strongly consistent
DO resolves that and can also hold chunks, removing Upstash entirely. No Upstash
account, Redis tokens, Lua command billing, or Redis eviction configuration is needed.
[Upstash consistency](https://upstash.com/docs/redis/features/consistency).

QStash was considered but adds another service/callback configuration and message
allowance. Browser-driven continuation remains an explicit contingency if Workflow
fails deployment validation; it pauses with the tab closed and is not silently
substituted for durable execution. A long-running paid server is not required.

## Verified account state and access limits

Authenticated Vercel CLI confirmed team nicbats-projects is Hobby. Project
steam-achievements is still configured as Vite with Node 24. No project environment
variables or storage resources were visible in the team. The local collector key
file exists; its value was not read, printed, uploaded, or tested. Production still
needs an app-owned Steam key and the server configuration listed below.

`vercel usage --since 30d` reported billing usage unavailable, explicitly not zero.
A team-wide function metric query required Observability Plus; we did not upgrade.
No connected browser was available to inspect dashboard Usage. Actual team-wide
remaining allowances therefore remain unverified. `wrangler whoami` confirmed
that Cloudflare is not authenticated locally. Its account eligibility and remaining
free allowances require login/setup before deployment; no login was initiated.

These are deployment prerequisites, not unresolved architecture choices. No public
capacity guarantee is made until both account dashboards and a preview are checked.

## Provider allowances and retention

- Vercel Hobby: 1 million function invocations/month, 4 CPU-hours, 360 GB-hours
  provisioned memory, and 300-second maximum with Fluid compute. Standard function
  payloads have a 4.5 MB ceiling. Network waits consume memory time.
  [Hobby](https://vercel.com/docs/plans/hobby),
  [function limits](https://vercel.com/docs/functions/limitations).
- Vercel Workflow: 50,000 events/month and 1 GB workflow writes. A successful step
  normally creates three events; retries/orchestration add more. Function and
  underlying Queue usage also count. Queue Free includes 1 million operations;
  payload size and delivery options affect the count, so do not equate operations
  with steps. [Workflow](https://vercel.com/docs/workflows/pricing),
  [Queues](https://vercel.com/docs/queues/pricing).
- Cloudflare DO Free: 100,000 requests/day, 13,000 GB-seconds/day, 5 million rows
  read/day, 100,000 rows written/day, 5 GB account storage. Workers gateway limits
  apply separately, including 100,000 requests/day and 10 ms CPU/request. DO CPU
  has a separate documented default of 30 seconds. Free exhaustion errors rather
  than enabling overage charges; daily limits reset at midnight UTC. KV operations,
  deletes, and alarms must be included in row/request accounting.
  [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
  [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).
- Explicitly create a SQLite-backed class. Its KV combined key/value limit is 8 MB;
  the 128 KiB limit belongs to the legacy KV-backed class, which is not our design.
  Still use binary chunks no larger than 512 KiB.
  [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/).
- Turnstile Free includes unlimited challenges/verification requests, up to twenty
  widgets and ten hostnames per widget. No DNS move is required. Use fixed production
  hostnames; use test keys and mocks for arbitrary previews.
  [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/),
  [validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

Workflow Hobby payloads are readable for one day after completion, but provider
copies can remain up to 66 days and metadata longer. Workflow inputs, outputs,
metadata, and sanitized errors contain only opaque job IDs and small nonpersonal
progress; snapshots/secrets/capabilities must never enter its event payloads.
Logical cache expiry/deletion revokes app access immediately; it does not promise
immediate erasure of provider recovery copies. Cloudflare storage recovery retention
also belongs in the privacy disclosure. [Workflow retention](https://vercel.com/docs/workflows/retention/).

## Measurements and compatibility checks

Measured locally, without uploading the export:

- Existing 205-game export: 5,174,995 bytes on disk; 4,110,273 compact JSON;
  783,641 gzip. Demo: 203 games, 4,036,980 compact / 766,887 gzip bytes.
- The representative compressed snapshot needs two 512 KiB chunks. Store binary
  buffers, avoiding base64's approximately one-third expansion. Actual DO disk,
  index, metadata, and staging overhead still needs measurement.
- Existing collector estimates: 526 cold Steam calls, 210 with shared metadata
  cached, or five for a three-game incremental refresh with fresh metadata.
- At two calls/second, the cold import needs at least 263 seconds before overhead.
  One five-minute function is too fragile. Start batches at at most twenty upstream
  attempts / thirty seconds of work, with sixty-second function configuration,
  bounded request timeouts, checkpoints, and lease fencing.

An isolated copy in /tmp/steam-workflow-spike installed workflow@5.5.0 alongside
this app's SvelteKit/Vite/Vercel adapter. The production build generated Vercel
output, and a local POST started a synthetic workflow whose status reached completed
and returned { ok: true }. Add @opentelemetry/api@1.9.0 explicitly to satisfy its
peer dependency. Optional native-module tracing warnings remain; no cloud preview
has yet verified the bundled production routes. The app's dependencies/source were
not changed by this spike. A repeat local run completed successfully with the
repository ignore rules copied into the isolated directory; all spike servers
were stopped afterward. Official integration:
[SvelteKit](https://workflow-sdk.dev/docs/getting-started/sveltekit).

SDK inspection found atomic start-hook support under experimental_hook in 5.5.0.
Because this API is experimental, pin it only after a preview verifies its World
support. Regardless, duplicate run delivery must converge on coordinator leases;
correctness cannot depend solely on experimental start deduplication.

Cloudflare local spike in /tmp/steam-do-spike passed with Wrangler 4.162.0,
Miniflare 5.20261113.0-beta, workerd 1.20261113.1 and Node 26.13.0. A SQLite-backed
DO using transactionSync and storage.kv admitted exactly ten of twenty concurrent
requests at a cap of ten. A 512 KiB binary chunk round-tripped byte-for-byte; one
extra byte was rejected with 413. After a full local restart, the cap and chunk
remained intact. No application SQL, cloud login, or deployment was needed.

Neither a local emulator nor the Workflow smoke test certifies cloud quotas, CPU
billing, network latency, or end-to-end import capacity.

## Central pilot limits

These are provisional application limits, not isolated provider allocations.
Other projects share account allowances; measured headroom can lower every value.
A single configuration module supplies these defaults to all components.

- Steam: 1,000 attempts per rolling 24 hours AND 20,000 per rolling 30 days. Keep
  80,000/day only as an outer ceiling, not planned launch throughput.
- One executing import, ten waiting jobs, two concurrent upstream calls maximum,
  paced at two attempts/second. One coordinator per production Steam key.
- Vercel: target <=1 CPU-hour, <=100 GB-hours function memory, <=30,000 Workflow
  events, <=500 MB Workflow writes, and <=100,000 Queue operations per rolling
  thirty days. These require measured estimation plus account monitoring.
- Cloudflare: target <=20,000 gateway requests and <=20,000 DO requests/day,
  <=1 million rows read/day, <=50,000 rows written/day, <=6,000 GB-seconds/day.
  Requests, row updates, deletions, alarm writes, scans, and retries all count.
  Preserve 20% of app operational allowances for completion/status/download/cleanup.
  Request and row limits are independent: three writes per request can exhaust the
  write target first. Do not leave timers/open streams keeping the DO awake.
- Stored bytes: 150 MB app cap, initially 80 MB baselines, 40 MB shared metadata,
  20 MB transient jobs/results, 10 MB control/index headroom. Reserve bytes before
  staging chunks, count abandoned chunks, and compare with real provider disk use.
- Poll progress at most every ten seconds while running, thirty seconds in a short
  queue; stop when hidden and honor Retry-After instead of polling through a long
  quota wait. Progress responses never read full snapshots.
- Start surge mode at 75% of the currently limiting allowance; stop new admissions
  before the hard cap, retaining recovery headroom. Use per-session/IP/profile
  limits and edge rejection; failed/denied traffic also consumes hosting resources.

Twenty thousand calls covers about 38 all-cold representative imports/month before
retries; this is a deliberately small pilot. Those imports need ~1,026 collection
batches and ~3,078 ordinary step events before orchestration. Minimum pacing time
is 2.78 running hours/month, or 5.56 GB-hours at 2 GB memory, before other latency.
Warm refreshes are much cheaper. Actual cold/warm mix, retries, CPU, and other
projects' usage determine capacity; do not advertise a supported user count yet.

## Execution, queue and storage details

- Do not have every waiting job poll with its own workflow. Ten jobs checking every
  thirty seconds through a full quota day would exceed the free event allowance.
  Keep waiting jobs in the DO. Use one dispatcher with a bounded alarm/wake path to
  start eligible jobs, and one active import workflow. A coordinator alarm can call
  a service-authenticated Vercel dispatch endpoint; sign/bind request identity and
  reject replays. Schedule the actual next eligibility time, never short repeated
  quota checks. One shared alarm scheduler selects the earliest dispatch or expiry
  task; cleanup and dispatch must not overwrite each other's alarm. Back off failed dispatches with a bounded retry count, then surface
  an operator-recoverable state. Alarm state survives browser closure.
- Persist pending-start before launching a runner; use stable job identity, record
  run ID/acknowledgement, and retry uncertain starts safely. A recovered duplicate
  runner can obtain no second executing lease. Return accepted only once durable
  dispatch/recovery is recorded, not after a detached promise.
- Reserve the next batch, not the whole library. Checkpoint long jobs across windows
  and display when they can resume. Active/paused jobs have a seven-day maximum
  lifetime; terminal metadata expires after 24 hours, unclaimed finished results
  after one hour, and successful baselines after at most thirty days. Reject work
  that cannot fit safe job/storage limits explicitly with the collector fallback.
- Gate every Steam attempt through one coordinator transaction immediately before
  dispatch: validate generation/lease, pacing, kill switch and budgets, then charge.
  Grant a short dispatch deadline; retain charges through the rolling window plus
  that deadline. An ambiguous response stays charged; a retry needs a new charge.
  Do not reuse one permission to dispatch twice. Store gate, lease and checkpoint
  versions durably. Never reset missing/rolled-back counters automatically.
- Put control, job, manifest, chunk, metadata, and expiry-index keys in distinct
  namespaces. Publish the verified immutable chunk manifest with generation and
  byte-accounting changes atomically. Always verify hashes/lengths before replacing
  browser data. Check logical expiry on reads; DO storage has no Redis-style TTL.
  Run bounded, indexed alarm cleanup, counting deletion writes. Never expire quota
  state early. Abandoned chunks are reclaimable; live generations cannot reference
  missing/expired chunks. No large scans or all-store in-memory reconstruction.
- Cache deletion/privacy invalidation increments a generation, revokes access,
  cancels jobs and schedules chunk cleanup. Every publication checks the generation
  so old workflows cannot resurrect deleted data. No live counter PITR/rollback;
  recovery disables imports until state is conservatively reconstructed or the
  affected budget windows have elapsed.

## Deployment prerequisites and remaining measurable gates

1. Authenticate/inspect Cloudflare Workers Free and both providers' remaining usage.
   No paid Workers upgrade, automatic fallback billing, or paid Vercel feature.
2. Configure server-only Steam API key, gateway/service signing secrets, session
   signing secret, Turnstile secret, import flag, and budget settings. Only Turnstile
   site key is public. Worker dispatch credentials and Vercel gateway credentials
   should have separate purposes and rotation paths. Secrets are never workflow args.
3. Provision SQLite-backed DO namespace/Worker and Turnstile, then verify a preview
   with generated Workflow routes/authentication and the existing Vercel adapter.
   Change production framework preset to SvelteKit at rollout. Preserve the domain.
   Mock ordinary previews; explicitly enabled staging shares the outer Steam-key
   budget or uses an independent key. Never casually duplicate an active DO in the
   same free account or copy production secrets into arbitrary preview branches.
4. Instrument actual cold/warm/large/retry imports: gate operations, rows read/write,
   chunk bytes, gateway CPU, DO duration, workflow/queue events, Vercel CPU/memory,
   and wall time. Tighten pilot caps if any resource fails its allowance. Verify
   runtime-size bounds and reserve enough operational capacity to finish/download.
5. Run fault tests for concurrent admissions, duplicate runner starts, expiry,
   crash/retry accounting, deletion during import, privacy change, storage full,
   large library, quota pause/resume and completed-result download after tab closure.
6. Use manual provider Usage/Logs checks for a limited pilot. No notification recipient
   was supplied and no alert was sent. Choose a free alert destination before broad
   public rollout; until then keep the limited manually monitored pilot explicit.

The full plan is ready for implementation. These items need authenticated setup or
real implementation measurements; they are not claims that production is ready.

## Independent review outcomes

Three independent reviews were completed and incorporated:

- Architecture/security: replaced the eventually consistent control store; specified
  at-least-once requests, idempotent commits, safe runner startup, immutable chunks,
  deletion generations, secret/error sanitization, and challenge replay binding.
- Cost/reliability: centralized launch limits, removed idle workflow polling, added
  Queue/DO/row budgets, bounded batch reservations, reserved recovery capacity, and
  kept team headroom and actual provider billing as explicit measurement gates.
- Browser/data recovery: required atomic full-dataset backup/restore, profile/version
  validation, multi-tab revisions, deletion fencing, repeatable legacy migration,
  preservation of inactive plan targets, and accurate limits on offline behavior.

The main plan contains those contracts. No user decision about paid services is
needed. Only revisit the design if implementation measurements reveal an actual
cost requirement or a material change to the agreed user experience.
