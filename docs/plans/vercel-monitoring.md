# Vercel monitoring: minimal backend

Updated 2026-11-14 for the [current plan](sveltekit-and-steam-import.md).

Use included Runtime Logs and dashboard Usage for a small manually monitored pilot.
No Cloudflare, Workflow, paid monitoring, log drain, or custom operations UI is
required. Logs are diagnostic; they cannot enforce a global Steam allowance.

Project steam-achievements belongs to nicbats-projects (Hobby), uses Node 24, and
still has the Vite preset. Production origin: https://steam-achievements.nicbat.com.
The November 14 inspection found no project environment variables. The previous
production inspection showed a static deployment without a live import endpoint.
No deployment or account settings were changed.

CLI billing usage was unavailable and a metric query required Observability Plus;
no upgrade was performed. Check actual dashboard Usage before enabling imports.

Log compact sanitized summaries per API batch: attempted calls, retries, completed
and failed game counts, duration, and error category. Never log API keys, signed
permissions, upstream credential-bearing URLs, browser exports, or full snapshots.
There is no server queue depth or authoritative daily budget counter to report.
Inspect request failures/429s and provider usage; disable live imports with the
configuration switch if necessary. Before enabling the pilot, configure and verify
the included Hobby WAF rule across both import endpoints: initially twenty requests
per IP per minute. Its regional request counts are not a global Steam call budget.
See the main plan for byte/time/attempt ceilings and the local import ledger.
The rule is planned, not currently configured.

Preview with mocked upstream first; verify a small authorized live import before
rollout, preserve the production origin and retain demo/file-import fallbacks.
