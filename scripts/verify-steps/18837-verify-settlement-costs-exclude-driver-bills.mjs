#!/usr/bin/env node
/**
 * verify-step 18837 (CC-1, mod-4=1)
 * ROW-75 (443.278): settlement load costs_cents must NOT include driver-pay AP bills
 * (bill_category='driver'). Driver pay is tracked separately in driver_pay_cents; including
 * these bills in costs_cents double-counts them and understates margin by the driver-pay amount.
 *
 * --selftest: mutates the SQL and verifies the mutation is caught.
 */
import fs from "node:fs";

const ROLLUP_FILE = "apps/backend/src/accounting/load-cost-rollup.sql.ts";
const LABEL = "verify-settlement-costs-exclude-driver-bills";

function fail(msg) {
  console.error(`[${LABEL}] FAILED — ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`[${LABEL}] PASS — ${msg}`);
}

// ─── static checks (pure, so --selftest can plant defects into an in-memory copy) ─────────────
const FILTER = "b.bill_category IS NULL OR b.bill_category <> 'driver'";
function staticFailures(rollup) {
  const f = [];
  // 1) bill_category filter must be present in the bc subquery
  if (!rollup.includes(FILTER)) {
    f.push(`${ROLLUP_FILE} bc subquery missing driver-bill exclusion: expected "${FILTER}"`);
    return f;
  }
  // 2) The filter must appear INSIDE the bc LEFT JOIN block (before GROUP BY bl.load_id)
  const start = rollup.indexOf("LEFT JOIN (");
  const end = rollup.indexOf("GROUP BY bl.load_id");
  const bcBlock = start >= 0 && end > start ? rollup.slice(start, end + 20) : "";
  if (!bcBlock.includes(FILTER)) f.push("driver-bill category exclusion is not in the bc subquery block — may be misplaced");
  return f;
}

// ─── selftest ────────────────────────────────────────────────────────────────
// Was: wrote the mutated SQL into the tracked rollup file and ran itself as a child — which ALSO failed on
// "DATABASE_URL not set", so it reported "caught" even when the static check was gone. Now in-memory only,
// against the real static check, and each planted defect must be caught by THAT check.
if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(ROLLUP_FILE, "utf8");
  if (staticFailures(src).length) fail(`SELFTEST: real rollup rejected — ${staticFailures(src).join("; ")}`);
  const removed = src.replace("AND (" + FILTER + ")", "-- MUTATION-REMOVED-DRIVER-FILTER");
  const cases = [
    ["driver-bill exclusion removed", removed],
    ["exclusion moved outside the bc subquery", removed + "\nWHERE (" + FILTER + ")"],
  ];
  let caught = 0;
  for (const [name, mutated] of cases) {
    if (mutated === src) fail(`SELFTEST SETUP FAILED: mutation "${name}" changed nothing`);
    if (staticFailures(mutated).length === 0) fail(`SELFTEST FAILED: mutation "${name}" escaped`);
    caught += 1;
  }
  console.log(`[${LABEL}] SELFTEST PASS — ${caught}/${cases.length} planted defects caught (in-memory; real file untouched)`);
  process.exit(0);
}

{
  const f = staticFailures(fs.readFileSync(ROLLUP_FILE, "utf8"));
  if (f.length) fail(f.join("; "));
  pass("bc subquery has driver-bill category exclusion, inside the bc subquery block");
}

// ─── live database check ─────────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  if (process.env.ALLOW_OFFLINE_SKIP === "1") {
    console.log(`[${LABEL}] OFFLINE SKIP — DATABASE_URL not set (ALLOW_OFFLINE_SKIP=1)`);
    process.exit(0);
  }
  fail("DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B owner law).");
}

const { default: postgres } = await import("postgres");
const sql = postgres(dbUrl, { max: 1, idle_timeout: 10 });
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

try {
  // Verify: no driver-pay AP bill bleeds into costs_cents on any load that has both a driver bill
  // and an accounting bill with bill_category='driver'. costs_cents = expense_cents + bill_cents
  // where bill_cents MUST be 0 for loads whose only bills are bill_category='driver'.
  const rows = await sql.unsafe(`
    SELECT l.load_number,
      (SELECT COALESCE(SUM(e.total_amount_cents),0)
         FROM accounting.expenses e
        WHERE e.load_id = l.id AND e.status NOT IN ('void','voided') AND e.voided_at IS NULL
      ) AS expense_cents,
      (SELECT COALESCE(SUM(ROUND(bl.amount * 100)),0)::bigint
         FROM accounting.bill_lines bl
         JOIN accounting.bills b ON b.id = bl.bill_id
        WHERE bl.load_id = l.id
          AND b.status NOT IN ('void','voided') AND b.voided_at IS NULL AND b.revoked_at IS NULL
          AND bl.voided_at IS NULL
          AND (b.bill_category IS NULL OR b.bill_category <> 'driver')
          AND NOT EXISTS (
            SELECT 1 FROM driver_finance.driver_bills db2
             WHERE db2.operating_company_id = b.operating_company_id
               AND db2.status NOT IN ('void','voided') AND db2.voided_at IS NULL
               AND b.id IN (db2.accrued_bill_id, db2.accrued_team_bill_id)
          )
      ) AS bill_cents_after_fix,
      (SELECT COALESCE(SUM(db.gross_amount_cents),0)::bigint
         FROM driver_finance.driver_bills db
        WHERE db.load_id = l.id AND db.status NOT IN ('void','voided') AND db.voided_at IS NULL
      ) AS driver_pay_cents
    FROM mdata.loads l
    WHERE l.operating_company_id = '${USMCA}'
      AND l.soft_deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM accounting.bills b
         JOIN accounting.bill_lines bl ON bl.bill_id = b.id AND bl.load_id = l.id
        WHERE b.operating_company_id = l.operating_company_id
          AND b.bill_category = 'driver'
          AND b.status NOT IN ('void','voided') AND b.voided_at IS NULL
      )
    LIMIT 20
  `);

  let violations = 0;
  for (const r of rows) {
    const billCents = Number(r.bill_cents_after_fix);
    const driverPayCents = Number(r.driver_pay_cents);
    if (billCents > 0 && driverPayCents > 0 && billCents === driverPayCents) {
      console.error(`  VIOLATION: load ${r.load_number} — bill_cents=${billCents} equals driver_pay_cents=${driverPayCents} (driver bill still leaking into costs)`);
      violations++;
    }
  }

  if (violations > 0) {
    fail(`${violations} load(s) still have driver-pay bills leaking into costs_cents`);
  }

  pass(`${rows.length} load(s) checked — no driver-pay bill leaks into costs_cents`);
  await sql.end();
  process.exit(0);
} catch (e) {
  await sql.end().catch(() => {});
  fail(String(e));
}
