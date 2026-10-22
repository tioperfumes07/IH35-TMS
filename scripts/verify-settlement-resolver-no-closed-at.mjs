#!/usr/bin/env node
/**
 * P0 guard — settlement-resolution.sql.ts must use `trip_closed_at`, not `closed_at`.
 *
 * driver_finance.driver_settlements has `trip_closed_at` (added in migration 0143). There is no
 * `closed_at` column on that table. PR #27101 (resolveLoadSettlementSql D5 fix) introduced
 * `ORDER BY ds1.closed_at` at line 82 of settlement-resolution.sql.ts — a column that does not
 * exist, causing a 500 on every load that triggers the resolver (Load Costs, tour readout, etc.).
 *
 * STATIC: grep settlement-resolution.sql.ts — must contain trip_closed_at, must NOT contain
 * a bare .closed_at reference (which would be the wrong column name).
 * LIVE (REQUIRES_LIVE_DB): query information_schema.columns — confirm trip_closed_at exists and
 * closed_at does NOT exist on driver_finance.driver_settlements.
 *
 * Self-test: node scripts/verify-settlement-resolver-no-closed-at.mjs --selftest
 */
export const REQUIRES_LIVE_DB =
  "schema correctness — the wrong column name produces a 500 on every load resolver call (P0)";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlement-resolver-no-closed-at";
const RESOLVER_PATH = "apps/backend/src/driver-finance/settlement-resolution.sql.ts";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Static check — no DATABASE_URL required. */
export function checkStatic(src) {
  const errors = [];
  // Must use the correct column name
  if (!/ds\w*\.trip_closed_at/.test(src)) {
    errors.push(`${RESOLVER_PATH}: must contain alias.trip_closed_at in the ORDER BY clause`);
  }
  // Must NOT use the non-existent closed_at column on driver_settlements
  // (accounting.company_settlements HAS closed_at, but driver_finance.driver_settlements does NOT)
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // ds\d? alias refers to driver_settlements in this file
    if (/\bds\d?\.closed_at\b/.test(line)) {
      errors.push(`${RESOLVER_PATH}:${i + 1}: ds alias references .closed_at — column does not exist on driver_finance.driver_settlements; use .trip_closed_at`);
    }
  }
  return errors;
}

async function runLive() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const res = await client.query(`
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = 'driver_finance'
         AND table_name   = 'driver_settlements'
         AND column_name IN ('closed_at', 'trip_closed_at')
       ORDER BY column_name
    `);
    const found = res.rows.map((r) => r.column_name);
    const errors = [];
    if (!found.includes("trip_closed_at")) {
      errors.push("driver_finance.driver_settlements: column trip_closed_at is missing (migration 0143 may not have run)");
    }
    if (found.includes("closed_at")) {
      errors.push("driver_finance.driver_settlements: column closed_at exists but should not — the resolver must use trip_closed_at");
    }
    return errors;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const isSelftest = process.argv.includes("--selftest");
  const errors = [];

  if (isSelftest) {
    // Plant the bad column name and verify static check catches it
    const goodSrc = readFile(RESOLVER_PATH);
    const badSrc = goodSrc.replace(/ds1\.trip_closed_at/g, "ds1.closed_at");
    const staticErrs = checkStatic(badSrc);
    if (staticErrs.length === 0) {
      console.error(`SELFTEST FAIL: static check did not catch ds1.closed_at`);
      process.exit(1);
    }
    const goodErrs = checkStatic(goodSrc);
    if (goodErrs.length > 0) {
      console.error(`SELFTEST FAIL: static check fires on correct source:\n${goodErrs.join("\n")}`);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest PASS (static planted-text check works)`);
    process.exit(0);
  }

  // Static
  const src = readFile(RESOLVER_PATH);
  errors.push(...checkStatic(src));

  // Live
  const liveErrors = await runLive();
  errors.push(...liveErrors);

  if (errors.length > 0) {
    console.error(`${LABEL} FAIL\n${errors.map((e) => `  FAIL: ${e}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — trip_closed_at correct in source and verified on prod DB`);
}

main().catch((err) => {
  console.error(`${LABEL} ERROR: ${err.message}`);
  process.exit(1);
});
