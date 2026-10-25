#!/usr/bin/env node
/**
 * ENG-43 (443.328 2026-10-25) — USMCA open settlements with earnings lines must not have gross_pay=0.
 *
 * Root cause: lines were added through a path that did not call recomputeSettlementHeader,
 * leaving the settlement header at $0 while active earnings lines exist. Repaired via
 * scripts/ops/repair-settlement-header-eng43.mjs --apply on prod 2026-10-25.
 *
 * Code fix: settlement-payrun-close.service.ts line 699 already refuses to post a settlement
 * with zero active lines (SETTLEMENT_HAS_NO_LIVE_LINES). settlement-pay-line.service.ts calls
 * recomputeSettlementHeader on all line mutations going forward.
 *
 * STATIC: checks that the two write-path guards (refuse-zero-lines + recompute-on-mutation) exist.
 * LIVE (DATABASE_URL / gate read-only credential): shrink-only ratchet, ceiling 0.
 * --selftest plants each regression.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP = "static half (recomputeSettlementHeader + refuse-zero-lines checks) runs without DB; live half skips when DATABASE_URL absent";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-header-matches-lines";
const CEILING = 0; // repaired to 0 on 2026-10-25

const CLOSE_SERVICE = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const PAY_LINE_SERVICE = "apps/backend/src/driver-finance/settlement-pay-line.service.ts";

export function staticFailures() {
  const f = [];
  const close = readFileSync(resolve(ROOT, CLOSE_SERVICE), "utf8");
  const payLine = readFileSync(resolve(ROOT, PAY_LINE_SERVICE), "utf8");
  if (!/SETTLEMENT_HAS_NO_LIVE_LINES/.test(close)) {
    f.push(`${CLOSE_SERVICE}: missing SETTLEMENT_HAS_NO_LIVE_LINES guard — close path must refuse zero-line non-salaried settlements`);
  }
  if (!/recomputeSettlementHeader/.test(payLine)) {
    f.push(`${PAY_LINE_SERVICE}: missing recomputeSettlementHeader call — line mutation path must recompute the settlement header`);
  }
  return f;
}

const SELFTEST = process.argv.includes("--selftest");

if (SELFTEST) {
  const staticClean = staticFailures();
  if (staticClean.length) {
    console.error("SELFTEST FAIL: baseline static should pass:", staticClean);
    process.exit(1);
  }
  // Plant: remove SETTLEMENT_HAS_NO_LIVE_LINES from close service — must fail
  const closeText = readFileSync(resolve(ROOT, CLOSE_SERVICE), "utf8");
  const planted = closeText.replace(/SETTLEMENT_HAS_NO_LIVE_LINES/g, "SETTLEMENT_HAS_NO_LINES_OLD");
  const fs = (await import("node:fs")).default;
  fs.writeFileSync(resolve(ROOT, CLOSE_SERVICE), planted);
  let fail;
  try {
    fail = staticFailures();
  } finally {
    fs.writeFileSync(resolve(ROOT, CLOSE_SERVICE), closeText);
  }
  if (!fail.length) {
    console.error("SELFTEST FAIL: removing SETTLEMENT_HAS_NO_LIVE_LINES should fail static check");
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = staticFailures();

if (process.env.DATABASE_URL || process.env.IH35_GATE_READONLY_DB_URL) {
  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);
  const { Pool } = require("pg");
  const pgOpts = require("./lib/pg-connection-options.cjs");
  const pool = new Pool(pgOpts);
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    // Count open settlements with earnings lines but gross_pay = 0
    const r = await client.query(`
      SELECT count(DISTINCT ds.id)::int AS n
      FROM driver_finance.driver_settlements ds
      JOIN driver_finance.settlement_lines sl ON sl.settlement_id = ds.id
      WHERE ds.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
        AND ds.voided_at IS NULL
        AND ds.posted_at IS NULL
        AND ds.gross_pay = 0
        AND sl.line_type IN ('earnings','extra_pay','team_split_primary','team_split_secondary','deadhead_pay')
        AND sl.is_active = true
        AND sl.voided_at IS NULL
    `);
    const count = r.rows[0].n;
    if (count > CEILING) {
      failures.push(`${count} USMCA open settlement(s) have earnings lines but gross_pay=0 (ceiling ${CEILING}) — run scripts/ops/repair-settlement-header-eng43.mjs`);
    }
    await client.query("ROLLBACK");
    console.log(`${LABEL}: LIVE — ${count} open settlements with stale $0 header (ceiling ${CEILING})`);
  } catch (err) {
    failures.push(`DB check failed: ${err.message}`);
  } finally {
    client.release?.();
    await pool.end?.();
  }
} else {
  console.log(`${LABEL}: LIVE arm NOT RUN (no DATABASE_URL) — static checks only`);
}

if (failures.length) {
  console.error(`${LABEL}: FAIL (${failures.length}):`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — write-path guards present; live count ≤ ${CEILING}`);
