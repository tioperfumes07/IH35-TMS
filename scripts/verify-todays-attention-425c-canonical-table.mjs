#!/usr/bin/env node
/**
 * Owner Home Today's Attention — 425C source must query compliance.form_425c_reports.
 *
 * Root cause: source425CDeadline queried legal.form_425c_filings (never migrated).
 * Canonical live table is compliance.form_425c_reports (DECISIONS-AND-THIRTEEN.md).
 *
 * Usage:
 *   node scripts/verify-todays-attention-425c-canonical-table.mjs
 *   node scripts/verify-todays-attention-425c-canonical-table.mjs --selftest
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-todays-attention-425c-canonical-table";
const AGGREGATOR = "apps/backend/src/owner/todays-attention/aggregator.service.ts";

function readAggregator() {
  const abs = path.join(process.cwd(), AGGREGATOR);
  if (!fs.existsSync(abs)) throw new Error(`${AGGREGATOR} missing`);
  return fs.readFileSync(abs, "utf8");
}

export function check425cTableUsage(src) {
  const offenders = [];
  if (/legal\.form_425c_filings/.test(src)) {
    offenders.push(`${AGGREGATOR}: must not query legal.form_425c_filings (phantom table)`);
  }
  if (!/compliance\.form_425c_reports/.test(src)) {
    offenders.push(`${AGGREGATOR}: must query compliance.form_425c_reports`);
  }
  if (!/warnSkipped\(/.test(src)) {
    offenders.push(`${AGGREGATOR}: must log warnSkipped when a source is skipped`);
  }
  return offenders;
}

function runSelftest() {
  const good = `
    FROM compliance.form_425c_reports
    warnSkipped(log, source, "table_missing", table);
  `;
  const bad = `
    FROM legal.form_425c_filings
  `;

  const goodOffenders = check425cTableUsage(good);
  const badOffenders = check425cTableUsage(bad);

  if (goodOffenders.length > 0) {
    console.error(`[${LABEL}] selftest FAIL: good fixture should pass`);
    process.exit(1);
  }
  if (badOffenders.length === 0) {
    console.error(`[${LABEL}] selftest FAIL: bad fixture should fail on legal.form_425c_filings`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }

  const src = readAggregator();
  const offenders = check425cTableUsage(src);
  if (offenders.length > 0) {
    for (const line of offenders) console.error(`  ✗ FAIL  ${line}`);
    console.error(`\n[${LABEL}] FAIL (${offenders.length})`);
    process.exit(1);
  }
  console.log(`  ✓ PASS  ${AGGREGATOR} uses compliance.form_425c_reports (not legal.form_425c_filings)`);
  console.log(`\n[${LABEL}] PASS`);
}

main();
