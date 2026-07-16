#!/usr/bin/env node
/**
 * verify-relay-timeout-hierarchy.mjs
 *
 * GUARD 2026-07-16: the "relay" circuit-breaker timeout MUST be strictly greater than the relayFetch
 * AbortController timeout. Deploy eba6220 regressed because the breaker inherited the generic 30s default
 * while the fetch allowed 60s — the breaker fired first ("Timed out after 30000ms") and the full-history
 * Relay feed could never complete, so 0 rows ever landed.
 *
 * Static invariant checks (no DB, no network):
 *  1. lib/relay-timeout.ts exports relayApiTimeoutMs + relayBreakerTimeoutMs, and breaker = fetch + slack (>0).
 *  2. circuit-breaker/registry.ts sets the relay breaker timeout from relayBreakerTimeoutMs() (not the 30s default).
 *  3. relay-client.ts derives its fetch timeout from relayApiTimeoutMs() (shared source, not an inline literal).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-timeout-hierarchy";

const TIMEOUT_SRC = path.join(ROOT, "apps/backend/src/lib/relay-timeout.ts");
const REGISTRY = path.join(ROOT, "apps/backend/src/lib/circuit-breaker/registry.ts");
const CLIENT = path.join(ROOT, "apps/backend/src/integrations/relay-payments/relay-client.ts");

const failures = [];

function read(p, label) {
  if (!fs.existsSync(p)) {
    failures.push(`MISSING ${label}: ${path.relative(ROOT, p)}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const timeoutSrc = read(TIMEOUT_SRC, "relay-timeout source");
if (timeoutSrc) {
  if (!/export function relayApiTimeoutMs\s*\(/.test(timeoutSrc)) {
    failures.push("relay-timeout.ts must export relayApiTimeoutMs()");
  }
  if (!/export function relayBreakerTimeoutMs\s*\(/.test(timeoutSrc)) {
    failures.push("relay-timeout.ts must export relayBreakerTimeoutMs()");
  }
  // breaker = fetch + slack, and slack must be a positive literal
  const slackMatch = timeoutSrc.match(/RELAY_BREAKER_SLACK_MS\s*=\s*([\d_]+)/);
  const slack = slackMatch ? Number(slackMatch[1].replace(/_/g, "")) : NaN;
  if (!Number.isFinite(slack) || slack <= 0) {
    failures.push("RELAY_BREAKER_SLACK_MS must be a positive literal");
  }
  if (!/return\s+relayApiTimeoutMs\(\)\s*\+\s*RELAY_BREAKER_SLACK_MS/.test(timeoutSrc)) {
    failures.push("relayBreakerTimeoutMs() must return relayApiTimeoutMs() + RELAY_BREAKER_SLACK_MS (breaker strictly > fetch)");
  }
}

const registry = read(REGISTRY, "circuit-breaker registry");
if (registry) {
  const relayLine = registry.split("\n").find((l) => /^\s*relay:\s*\{/.test(l)) ?? "";
  if (!/timeout:\s*relayBreakerTimeoutMs\(\)/.test(relayLine)) {
    failures.push("registry.ts relay breaker must set timeout: relayBreakerTimeoutMs() (not the 30s default)");
  }
}

const client = read(CLIENT, "relay client");
if (client) {
  if (!/relayApiTimeoutMs/.test(client)) {
    failures.push("relay-client.ts must derive its fetch timeout from relayApiTimeoutMs() (shared source)");
  }
  // No inline 30000 timeout literal feeding relayFetch (the old smoking gun)
  if (/relayFetch\([^)]*,\s*30000\s*\)/.test(client)) {
    failures.push("relay-client.ts must not pass an inline 30000ms timeout to relayFetch");
  }
}

if (failures.length) {
  console.error(`[${LABEL}] FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`[${LABEL}] OK — relay breaker timeout > fetch timeout, derived from one shared source.`);
