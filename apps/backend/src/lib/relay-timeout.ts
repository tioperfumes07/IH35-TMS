/**
 * Single source of truth for the Relay HTTP timeout hierarchy (GUARD 2026-07-16).
 *
 * ROOT CAUSE this file exists for: the opossum "relay" circuit breaker inherited the generic 30s
 * default while relayFetch's AbortController allowed 60s — the breaker always fired first, so the
 * full-history Relay feed (proven live: Relay ignores start_date/end_date and returns ~1471 rows in
 * one response for TRANSP) could NEVER complete inside the app, even though the same pull succeeds
 * outside the breaker. Raising RELAY_API_TIMEOUT_MS alone was dead code.
 *
 * INVARIANT (enforced by scripts/verify-relay-timeout-hierarchy.mjs + vitest):
 *   breaker timeout = fetch timeout + RELAY_BREAKER_SLACK_MS  (strictly greater)
 * The fetch AbortController must always be the one that fires; the breaker is the outer safety net.
 */

/** Per-request Relay fetch timeout (AbortController). Env-tunable; default 120s — the live TRANSP
 *  full feed exceeded 30s, and history only grows until Relay ships real server-side filters. */
export function relayApiTimeoutMs(): number {
  const raw = Number(process.env.RELAY_API_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 120_000;
}

/** Slack added on top of the fetch timeout for the circuit breaker so the abort always wins. */
export const RELAY_BREAKER_SLACK_MS = 15_000;

/** Circuit-breaker timeout for the "relay" dependency — strictly greater than the fetch timeout. */
export function relayBreakerTimeoutMs(): number {
  return relayApiTimeoutMs() + RELAY_BREAKER_SLACK_MS;
}
