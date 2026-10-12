#!/usr/bin/env node
// B-LEDGER-1 (ROUND 206) -- fuel.fuel_transactions.gross_cost/discount_amount/fee_amount were applied
// directly to prod on 2026-09-28 with no committed .sql (migration 202614550000 retroactively
// documents it). This guard asserts the relationship that migration's backfill established still
// holds: every row with a known total_cost has gross_cost = total_cost when discount_amount and
// fee_amount are both zero (the genesis baseline for historical rows), so an undocumented change to
// these columns that breaks that relationship is caught instead of silently drifting again.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
const LABEL = "verify-fuel-transactions-genesis-anchor-documented";
export const REQUIRES_LIVE_DB =
  "live-data integrity guard (fuel.fuel_transactions genesis-anchor columns); fails closed via requireLiveDbOrExit with no DATABASE_URL";

const ANCHOR_COLUMNS = ["gross_cost", "discount_amount", "fee_amount"];
const BAD_ROWS_SQL = `
        SELECT count(*) AS n
        FROM fuel.fuel_transactions
        WHERE gross_cost IS NOT NULL
          AND total_cost IS NOT NULL
          AND discount_amount = 0
          AND fee_amount = 0
          AND round(gross_cost, 2) != round(total_cost, 2)
      `;

/** Row-level mirror of BAD_ROWS_SQL: a row that breaks the genesis anchor (gross = total when discount = fee = 0). */
export function breaksGenesisAnchor(r) {
  if (r.gross_cost == null || r.total_cost == null) return false;
  if (Number(r.discount_amount) !== 0 || Number(r.fee_amount) !== 0) return false;
  return Math.round(Number(r.gross_cost) * 100) !== Math.round(Number(r.total_cost) * 100);
}

/** Pure verdict over what main() measures: the anchor columns present, and the count of rows breaking the anchor. */
export function judgeGenesis(presentColumns, badCount) {
  const failures = [];
  const missing = ANCHOR_COLUMNS.filter((c) => !presentColumns.includes(c));
  if (missing.length) {
    failures.push(`expected gross_cost, discount_amount, fee_amount all present on fuel.fuel_transactions; found ${presentColumns.join(", ") || "none"}`);
  } else if (badCount > 0) {
    failures.push(
      `${badCount} row(s) have discount_amount=0 AND fee_amount=0 but gross_cost != total_cost -- the genesis-anchor baseline relationship (202614550000) no longer holds`
    );
  }
  return failures;
}

function selftest() {
  const failures = [];
  const ok = { gross_cost: "100.00", total_cost: "100.00", discount_amount: "0", fee_amount: "0" };
  const rows = [
    ["gross drifted from total with no discount/fee", { ...ok, gross_cost: "100.50" }, true],
    ["a one-cent drift", { ...ok, total_cost: "100.01" }, true],
    ["discounted row (out of scope)", { ...ok, gross_cost: "110.00", discount_amount: "10" }, false],
    ["fee row (out of scope)", { ...ok, total_cost: "102.00", fee_amount: "2" }, false],
    ["anchored row", ok, false],
    ["no total yet (out of scope)", { ...ok, total_cost: null }, false],
  ];
  for (const [name, r, bad] of rows) if (breaksGenesisAnchor(r) !== bad) failures.push(`row case wrong: ${name}`);
  if (!/discount_amount = 0[\s\S]*fee_amount = 0[\s\S]*round\(gross_cost, 2\) != round\(total_cost, 2\)/.test(BAD_ROWS_SQL)) {
    failures.push("BAD_ROWS_SQL no longer encodes the genesis anchor");
  }
  const plants = [
    ["a column dropped", judgeGenesis(["gross_cost", "discount_amount"], 0)],
    ["one row breaks the anchor", judgeGenesis(ANCHOR_COLUMNS, 1)],
  ];
  let caught = 0;
  for (const [name, f] of plants) {
    if (f.length) caught += 1;
    else failures.push(`planted violation escaped: ${name}`);
  }
  if (judgeGenesis(ANCHOR_COLUMNS, 0).length) failures.push("clean measurement rejected");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted violations caught (${rows.length} row cases)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  const failures = [];
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'fuel' AND table_name = 'fuel_transactions'
         AND column_name IN ('gross_cost', 'discount_amount', 'fee_amount')`
    );
    const present = cols.rows.map((r) => r.column_name);
    const badCount = present.length === ANCHOR_COLUMNS.length ? Number((await client.query(BAD_ROWS_SQL)).rows[0].n) : 0;
    failures.push(...judgeGenesis(present, badCount));

    await client.query("ROLLBACK");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — gross_cost/discount_amount/fee_amount present and the genesis-anchor baseline (gross_cost = total_cost when discount=fee=0) holds for every row.`);
}

main();
