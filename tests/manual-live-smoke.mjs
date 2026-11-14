/**
 * Explicit, bounded live smoke test; excluded from npm test's *.test.mjs glob.
 * Start the app with STEAM_IMPORT_ENABLED=true and server-only credentials first.
 * Then run: LIVE_SMOKE_BASE_URL=http://localhost:5173 node tests/manual-live-smoke.mjs
 * Maximum: one numeric-profile lookup (two Steam calls), one progress operation
 * (one Steam call). Never retries, follows redirects, or prints personal data.
 * Credentials remain in the running server; this script does not need to read them.
 */
import { readFile } from "node:fs/promises";

class SmokeFailure extends Error {}

async function main() {
  const base = new URL(
    process.env.LIVE_SMOKE_BASE_URL || "http://localhost:5173",
  );
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  ) {
    throw new SmokeFailure(
      "The smoke test only permits a local development server origin.",
    );
  }
  let snapshot;
  try {
    snapshot = JSON.parse(
      await readFile(new URL("../steam_data.json", import.meta.url), "utf8"),
    );
  } catch {
    throw new SmokeFailure(
      "The local private snapshot could not be read. No requests were sent.",
    );
  }
  if (!/^765\d{14}$/.test(snapshot.steamid64) || !Array.isArray(snapshot.games))
    throw new SmokeFailure(
      "The local snapshot has no valid numeric profile. No requests were sent.",
    );
  const preferred = snapshot.games.find(
    (g) => Number.isSafeInteger(g.appid) && g.appid > 0 && g.has_achievements,
  );
  if (!preferred)
    throw new SmokeFailure(
      "The local snapshot has no achievement game for this bounded test. No requests were sent.",
    );

  async function post(path, body) {
    let response;
    try {
      response = await fetch(new URL(path, base), {
        method: "POST",
        redirect: "error",
        headers: { origin: base.origin, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35_000),
      });
    } catch {
      throw new SmokeFailure(
        "The local request could not be confirmed. It will not be retried.",
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new SmokeFailure(
        "The server returned an unreadable response. No retry was made.",
      );
    }
    if (!response.ok || data.ok !== true) {
      const code =
        typeof data.code === "string" && /^[a-z_]{1,60}$/.test(data.code)
          ? data.code
          : "unknown_error";
      throw new SmokeFailure(
        `Local endpoint rejected the request (${response.status}, ${code}). No retry was made.`,
      );
    }
    return data;
  }

  const started = Date.now();
  const start = await post("/api/steam/start", { profile: snapshot.steamid64 });
  if (
    start.attempts !== 2 ||
    typeof start.token !== "string" ||
    start.data?.steamid64 !== snapshot.steamid64 ||
    !Array.isArray(start.data?.games)
  )
    throw new SmokeFailure(
      "Profile verification did not match the bounded test contract. No batch was sent.",
    );
  if (!start.data.games.some((g) => g.appid === preferred.appid))
    throw new SmokeFailure(
      "The test game is no longer in the public library. No batch was sent.",
    );
  const batch = await post("/api/steam/batch", {
    token: start.token,
    operations: [{ appid: preferred.appid, kind: "progress" }],
  });
  if (
    batch.attempts !== 1 ||
    !Array.isArray(batch.results) ||
    batch.results.length !== 1 ||
    batch.results[0].appid !== preferred.appid ||
    batch.results[0].kind !== "progress"
  )
    throw new SmokeFailure(
      "The one-operation batch did not match the bounded test contract. No retry was made.",
    );
  if (
    batch.results[0].status !== "success" ||
    !Array.isArray(batch.results[0].data)
  )
    throw new SmokeFailure(
      "The selected game progress was unavailable. No retry was made.",
    );
  console.log(
    JSON.stringify({
      result: "passed",
      endpointRequests: 2,
      upstreamAttempts: start.attempts + batch.attempts,
      progressOperations: 1,
      elapsedMs: Date.now() - started,
      personalDataLogged: false,
    }),
  );
}
main().catch((error) => {
  // Only deliberately authored messages above are printed; never dump fetch errors,
  // URLs, response bodies, profile identifiers, tokens, or environment variables.
  console.error(
    `Live smoke test stopped: ${error instanceof SmokeFailure ? error.message : "Unexpected local failure."}`,
  );
  process.exitCode = 1;
});
