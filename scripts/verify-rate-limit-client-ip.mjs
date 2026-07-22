#!/usr/bin/env node
/**
 * verify-rate-limit-client-ip — per-route rate limits must bucket by the REAL caller.
 *
 * DEFECT THIS LOCKS OUT (found 2026-07-22): api.ih35dispatch.com runs Cloudflare → Render, but
 * Fastify was built without `trustProxy`, so `req.ip` was the Cloudflare edge. The ~141 opt-in
 * `config.rateLimit` routes therefore keyed every user on the internet into a handful of egress
 * buckets: one busy tenant could exhaust the limit for everyone (self-inflicted DoS) while an
 * attacker got the same allowance as the whole user base. The limits existed and did not limit.
 *
 * Asserted:
 *   1. Fastify is constructed with trustProxy scoped to CLOUDFLARE_IP_RANGES — never `true`
 *      (`true` trusts any caller's X-Forwarded-For, letting a client choose its own bucket).
 *   2. @fastify/rate-limit is registered with a keyGenerator using resolveClientIp.
 *   3. resolveClientIp prefers CF-Connecting-IP and never reads x-forwarded-for directly
 *      (its left-most entry is attacker-controlled).
 *
 * Run: node scripts/verify-rate-limit-client-ip.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = "apps/backend/src/index.ts";
const HELPER = "apps/backend/src/config/client-ip.ts";
const LABEL = "verify-rate-limit-client-ip";

export function checkRateLimitKeying({ index, helper }) {
  const failures = [];

  if (/trustProxy:\s*true/.test(index)) {
    failures.push(`${INDEX}: trustProxy must NOT be \`true\` — that trusts any caller's X-Forwarded-For, so a client can choose its own rate-limit bucket`);
  }
  if (!/trustProxy:\s*\[?\s*\.{0,3}\s*CLOUDFLARE_IP_RANGES/.test(index)) {
    failures.push(`${INDEX}: Fastify must set trustProxy to CLOUDFLARE_IP_RANGES (scoped, not a wildcard) or req.ip stays the Cloudflare edge`);
  }
  if (!/register\(\s*rateLimit\s*,[\s\S]{0,400}?keyGenerator/.test(index)) {
    failures.push(`${INDEX}: @fastify/rate-limit must be registered with a keyGenerator — default keying is req.ip, which behind Cloudflare is one shared bucket`);
  }
  if (!/keyGenerator[\s\S]{0,200}?resolveClientIp/.test(index)) {
    failures.push(`${INDEX}: the rate-limit keyGenerator must use resolveClientIp`);
  }

  if (helper === null) {
    failures.push(`${HELPER}: missing — the client-IP resolver the keyGenerator depends on`);
    return failures;
  }
  if (!/cf-connecting-ip/i.test(helper)) {
    failures.push(`${HELPER}: must prefer CF-Connecting-IP (Cloudflare overwrites it; a client cannot forge it through the edge)`);
  }
  if (/headerValue\(\s*req\s*,\s*["']x-forwarded-for["']\)/i.test(helper)) {
    failures.push(`${HELPER}: must not read x-forwarded-for directly — its left-most entry is attacker-controlled`);
  }
  if (!/CLOUDFLARE_IP_RANGES/.test(helper)) {
    failures.push(`${HELPER}: must export CLOUDFLARE_IP_RANGES so trustProxy stays scoped to the real edge`);
  }
  return failures;
}

function selftest() {
  const problems = [];
  const goodIndex = `const app = Fastify({ logger: true, trustProxy: [...CLOUDFLARE_IP_RANGES] });
    await app.register(rateLimit, { global: false, keyGenerator: (req) => resolveClientIp(req) });`;
  const goodHelper = `export const CLOUDFLARE_IP_RANGES = ["104.16.0.0/13"];
    export function resolveClientIp(req){ return headerValue(req, "cf-connecting-ip") ?? req.ip; }`;

  if (checkRateLimitKeying({ index: goodIndex, helper: goodHelper }).length) problems.push("good fixture rejected");

  const cases = [
    ["trustProxy true", { index: goodIndex.replace("[...CLOUDFLARE_IP_RANGES]", "true"), helper: goodHelper }, "must NOT be `true`"],
    ["no trustProxy", { index: `const app = Fastify({ logger: true });\n${goodIndex.split("\n")[1]}`, helper: goodHelper }, "CLOUDFLARE_IP_RANGES"],
    ["no keyGenerator", { index: `const app = Fastify({ logger: true, trustProxy: [...CLOUDFLARE_IP_RANGES] });\nawait app.register(rateLimit, { global: false });`, helper: goodHelper }, "keyGenerator"],
    ["helper missing", { index: goodIndex, helper: null }, "missing"],
    ["helper drops CF header", { index: goodIndex, helper: `export const CLOUDFLARE_IP_RANGES=[]; export function resolveClientIp(req){ return req.ip; }` }, "CF-Connecting-IP"],
    ["helper reads raw XFF", { index: goodIndex, helper: `${goodHelper}\nconst x = headerValue(req, "x-forwarded-for");` }, "x-forwarded-for"],
  ];
  for (const [name, fixture, fragment] of cases) {
    if (!checkRateLimitKeying(fixture).some((f) => f.includes(fragment))) {
      problems.push(`planted regression "${name}" NOT caught — assertion ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — good fixture passes; ${cases.length} planted regressions caught`);
}

function main() {
  const index = readFileSync(join(ROOT, INDEX), "utf8");
  let helper = null;
  try { helper = readFileSync(join(ROOT, HELPER), "utf8"); } catch { helper = null; }
  const failures = checkRateLimitKeying({ index, helper });
  if (failures.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — rate limits bucket by CF-Connecting-IP; trustProxy scoped to Cloudflare ranges.`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
