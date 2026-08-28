#!/usr/bin/env node
/**
 * verify-customer-pnl-trailing-window-company-business-date.mjs (CUST-MONEY-F6964)
 *
 * CustomerDetail.tsx's Per-Customer P&L trailing-12-month default window was computed with
 * `Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())` -- UTC's calendar date, not
 * the company's business day. After ~19:00 Central the window's own "today" endpoint had already
 * rolled to tomorrow by UTC's clock, shifting the whole revenue/cost window several hours ahead of
 * the company day it claims to report as of.
 *
 * The fix derives `end` from the canonical companyToday() (lib/businessDate.ts), then steps the
 * YEAR back by one on that already-company-local calendar date.
 *
 * This guard asserts, against the REAL file, that trailing12mRange():
 *   1. calls companyToday() for its end date (not a raw `new Date()`/`.getUTCFullYear()` call).
 *   2. does not construct its `end` value via `Date.UTC(now.getUTCFullYear()` (the old UTC-`now`
 *      pattern) -- the only UTC.Date call allowed is the year-1 normalization step, which must take
 *      its year/month/day from parsed company-local parts, not from `now.getUTC*()`.
 *
 * FAIL if either regresses to the raw-UTC-now shape.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-pnl-trailing-window-company-business-date";
const TARGET_FILE = "apps/frontend/src/pages/CustomerDetail.tsx";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Injectable core: pass `src` to exercise this exact function against synthetic content; omit it
 * to check the real repo file.
 */
export function check(src) {
  const failures = [];
  const source = src != null ? src : (() => { try { return readReal(TARGET_FILE); } catch { return null; } })();
  if (source == null) return [`${TARGET_FILE} not found`];

  const fnStart = source.indexOf("function trailing12mRange(");
  if (fnStart < 0) {
    failures.push(`${TARGET_FILE}: trailing12mRange not found -- extractor may be stale`);
    return failures;
  }
  const fnEnd = source.indexOf("\n}", fnStart);
  const fnBody = fnEnd > fnStart ? source.slice(fnStart, fnEnd) : source.slice(fnStart, fnStart + 800);

  if (!/companyToday\s*\(\s*\)/.test(fnBody)) {
    failures.push(
      `${TARGET_FILE}: trailing12mRange no longer calls companyToday() -- it may have regressed to ` +
        `raw UTC "now" for its end date`
    );
  }

  if (/now\.getUTCFullYear\(\)/.test(fnBody)) {
    failures.push(
      `${TARGET_FILE}: trailing12mRange still reads now.getUTCFullYear() -- the UTC-"now" pattern ` +
        `this fix removed appears to have been reintroduced`
    );
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const good = `
function trailing12mRange() {
  const end = companyToday();
  const [y, m, d] = end.split("-").map(Number);
  const start = new Date(Date.UTC(y - 1, m - 1, d)).toISOString().slice(0, 10);
  return { start, end };
}
  `;
  const regressedNoCompanyToday = `
function trailing12mRange() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return { start: end.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
  `;
  const regressedUtcNow = `
function trailing12mRange() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
  `;

  const checks = [
    ["fully-fixed shape produces zero failures", check(good).length === 0],
    ["missing companyToday() is caught", check(regressedNoCompanyToday).some((f) => f.includes("no longer calls companyToday()"))],
    ["reintroduced now.getUTCFullYear() is caught", check(regressedUtcNow).some((f) => f.includes("UTC-\"now\" pattern"))],
    ["real repo file currently satisfies this guard (no args = real file)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — Per-Customer P&L trailing-12-month window uses the company business date, not raw UTC`);
}
