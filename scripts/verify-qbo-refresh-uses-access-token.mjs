#!/usr/bin/env node
// verify-qbo-refresh-uses-access-token — root-cause regression guard.
//
// BUG: the hourly QBO token-refresh cron selected connections by `refresh_token_expires_at`
// (getConnectionsExpiringWithin). Refresh tokens last ~100 days, so a connection whose ~1h ACCESS
// token was already dead was NEVER selected, and the link silently went stale ~1h after each re-auth.
// FIX: the cron must select on `access_token_expires_at` (getConnectionsWithAccessTokenExpiringWithin),
// mirroring the on-demand getValidAccessToken freshness test.
//
// This guard FAILS CI if the cron refresh path regresses to the refresh-token column:
//   1) cron (qbo-token-refresh.ts) must call getConnectionsWithAccessTokenExpiringWithin and must NOT
//      call the refresh-token selector getConnectionsExpiringWithin;
//   2) the selector getConnectionsWithAccessTokenExpiringWithin (in qbo-oauth.service.ts) must key its
//      WHERE/SELECT on access_token_expires_at and must NOT filter on refresh_token_expires_at.
//
// Self-test: node scripts/verify-qbo-refresh-uses-access-token.mjs --selftest
// LINKAGE: N/A (enforcement infra). Additive only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CRON = "apps/backend/src/cron/qbo-token-refresh.ts";
const SVC = "apps/backend/src/integrations/qbo/qbo-oauth.service.ts";
const ACCESS_SELECTOR = "getConnectionsWithAccessTokenExpiringWithin";
const REFRESH_SELECTOR = "getConnectionsExpiringWithin";

/** Extract the body of an exported async function by name (brace-matched). Returns "" if not found. */
export function extractFnBody(src, fnName) {
  const sig = `function ${fnName}(`;
  const start = src.indexOf(sig);
  if (start === -1) return "";
  const braceStart = src.indexOf("{", start);
  if (braceStart === -1) return "";
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  return src.slice(braceStart);
}

export function checkCron(cronSrc) {
  const f = [];
  if (!cronSrc.includes(ACCESS_SELECTOR))
    f.push(`${CRON}: token-refresh cron must call ${ACCESS_SELECTOR}() (selects on access_token_expires_at)`);
  // The refresh-token selector name is a prefix of the access-token one, so match a call, not a substring.
  if (new RegExp(`\\b${REFRESH_SELECTOR}\\s*\\(`).test(cronSrc))
    f.push(`${CRON}: must NOT call ${REFRESH_SELECTOR}() — it selects on the ~100-day refresh_token_expires_at, so a dead access token is never refreshed`);
  return f;
}

export function checkSelector(svcSrc) {
  const f = [];
  const body = extractFnBody(svcSrc, ACCESS_SELECTOR);
  if (!body) {
    f.push(`${SVC}: selector ${ACCESS_SELECTOR}() not found`);
    return f;
  }
  if (!/access_token_expires_at/.test(body))
    f.push(`${SVC}: ${ACCESS_SELECTOR}() must key its query on access_token_expires_at`);
  if (/refresh_token_expires_at/.test(body))
    f.push(`${SVC}: ${ACCESS_SELECTOR}() must NOT filter/select on refresh_token_expires_at (wrong column — self-heal is impossible)`);
  return f;
}

export function run() {
  const readIf = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  const cronSrc = readIf(CRON);
  const svcSrc = readIf(SVC);
  const f = [];
  if (cronSrc == null) f.push(`${CRON} not found`);
  else f.push(...checkCron(cronSrc));
  if (svcSrc == null) f.push(`${SVC} not found`);
  else f.push(...checkSelector(svcSrc));
  return f;
}

if (process.argv.includes("--selftest")) {
  const goodCron = `const expiring = await getConnectionsWithAccessTokenExpiringWithin(12 * 3600);`;
  const badCron = `const expiring = await getConnectionsExpiringWithin(12 * 3600);`;
  const goodSvc = `export async function getConnectionsWithAccessTokenExpiringWithin(secondsAhead) {\n  const q = 'SELECT id FROM integrations.qbo_connections WHERE revoked_at IS NULL AND access_token_expires_at <= now()';\n  return q;\n}`;
  const badSvc = `export async function getConnectionsWithAccessTokenExpiringWithin(secondsAhead) {\n  const q = 'SELECT id FROM integrations.qbo_connections WHERE refresh_token_expires_at <= now()';\n  return q;\n}`;
  const checks = [
    ["good cron passes", checkCron(goodCron).length === 0],
    ["cron calling refresh selector is caught", checkCron(badCron).some((x) => /must NOT call/.test(x))],
    ["cron missing access selector is caught", checkCron(badCron).some((x) => /must call/.test(x))],
    ["good selector passes", checkSelector(goodSvc).length === 0],
    ["selector on refresh_token_expires_at is caught", checkSelector(badSvc).some((x) => /must NOT filter/.test(x))],
    ["brace matcher extracts body", extractFnBody(goodSvc, "getConnectionsWithAccessTokenExpiringWithin").includes("access_token_expires_at")],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:qbo-refresh-uses-access-token --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:qbo-refresh-uses-access-token --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:qbo-refresh-uses-access-token FAIL — token-refresh cron must select on access_token_expires_at:");
    for (const x of failures) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log("verify:qbo-refresh-uses-access-token PASS");
}
