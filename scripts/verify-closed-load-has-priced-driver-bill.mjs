#!/usr/bin/env node
// ROUND 24.7 RULING (owner 2026-09-15, "YOU WERE RIGHT TO STOP. MY BOX WAS WRONG."): the owner's
// original box asked for a hard refusal on MINTING a driver bill for any driver with no active pay
// rate — that would have silently overturned the 2026-09-11 owner ruling (ACCT-F63/WIRE-02) that a
// load with no priceable inputs yet still books and mints an open $0 tracking bill so operators can
// seed miles/rate later. The ruling REJECTED that box: the $0-tracking-bill workflow at booking time
// is untouched. What is rejected instead: a load reaching `closed` while STILL carrying that $0
// placeholder, unpriced, unnoticed.
//
// THE FLOOR: no closed load (mdata.loads.status = 'closed') may carry a non-void driver_bills row
// that is still `open` and still `$0` — book-load.service.ts's assertClosedLoadHasPricedDriverBill
// now refuses that transition, loud, on screen, at every write path that can reach `closed`
// (apps/backend/src/mdata/loads.routes.ts's PATCH /status, load-billing-lifecycle.service.ts's
// automatic invoice/factoring walk, and loads-bulk.routes.ts's bulk set_status). This is the
// permanent, live-DB assertion that the refusal holds. BASELINE_COUNT is a shrink-only ratchet:
// the owner's own box said "two are known (13582, 13588)" and explicitly warned "measure the true
// number, do not assume it is two" — measured live 2026-09-15, the true starting count is THREE
// (13582, 13583, 13588), so the baseline is 3, not 2.
//
// Database-required: exits 2 (UNVERIFIED) if DATABASE_URL/DATABASE_DIRECT_URL is unset — never
// treat "couldn't check" as "passed". bypass_rls required: mdata.loads / driver_finance.driver_bills
// are FORCED-RLS.
//
//   node scripts/verify-closed-load-has-priced-driver-bill.mjs
//   node scripts/verify-closed-load-has-priced-driver-bill.mjs --selftest   (pure logic check, no DB)
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
const LABEL = "verify-closed-load-has-priced-driver-bill";

// Measured live on prod (tiny-field-89581227, all entities) 2026-09-15: 13582, 13583, 13588 — all
// closed, all carrying a non-void, open, $0 driver bill. Lower this number as each is legitimately
// resolved (miles and/or rate seeded, bill remints to a real gross); never raise it.
const BASELINE_COUNT = 3;

/** Pure predicate so --selftest can exercise it with no database. */
export function countViolations(rows) {
  return rows.filter((r) => r.load_status === "closed" && r.bill_status === "open" && Number(r.gross_amount_cents ?? 0) === 0).length;
}

async function main() {
  if (!url) {
    console.error(`${LABEL}: UNVERIFIED — DATABASE_URL not set, cannot check live`);
    process.exit(2);
    return;
  }
  const pool = new pg.Pool({ connectionString: url });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET TRANSACTION READ ONLY");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

      const res = await client.query(
        `SELECT l.load_number, l.status AS load_status, db.status AS bill_status, db.gross_amount_cents
           FROM mdata.loads l
           JOIN driver_finance.driver_bills db ON db.load_id = l.id
          WHERE l.soft_deleted_at IS NULL
            AND l.status = 'closed'
            AND db.voided_at IS NULL
            AND db.status <> 'void'`
      );
      await client.query("ROLLBACK");

      const count = countViolations(res.rows);
      if (count > BASELINE_COUNT) {
        const over = res.rows
          .filter((r) => r.load_status === "closed" && r.bill_status === "open" && Number(r.gross_amount_cents ?? 0) === 0)
          .slice(0, 10);
        console.error(
          `${LABEL} FAILED — ${count} closed loads carry a non-void, open, $0 driver bill, exceeding ` +
            `the baseline of ${BASELINE_COUNT} (a load closed with an unpriced bill despite the refusal gate). ` +
            `Sample: ` + over.map((r) => r.load_number).join(", ")
        );
        process.exit(1);
        return;
      }
      if (count < BASELINE_COUNT) {
        console.log(
          `${LABEL} OK — ${count} such loads (below baseline ${BASELINE_COUNT} — lower BASELINE_COUNT ` +
            `in this file to ${count} so the ratchet tightens)`
        );
        process.exit(0);
        return;
      }
      console.log(`${LABEL} OK — ${count} such loads (== baseline, frozen, no NET-NEW)`);
      process.exit(0);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`${LABEL}: UNVERIFIED — could not query live: ${err.message}`);
    process.exit(2);
  } finally {
    await pool.end();
  }
}

function selftest() {
  const closedUnpriced = { load_status: "closed", bill_status: "open", gross_amount_cents: 0 };
  const closedPriced = { load_status: "closed", bill_status: "open", gross_amount_cents: 150000 };
  const openLoadUnpriced = { load_status: "dispatched", bill_status: "open", gross_amount_cents: 0 };
  const clean = [closedUnpriced, closedPriced];
  if (countViolations(clean) !== 1) {
    console.error(`${LABEL}: SELFTEST FAIL — expected 1 violation, got ${countViolations(clean)}`);
    process.exit(1);
  }
  const allViolate = [closedUnpriced, { ...closedUnpriced }, { ...closedUnpriced }];
  if (countViolations(allViolate) !== 3) {
    console.error(`${LABEL}: SELFTEST FAIL — expected 3 violations, got ${countViolations(allViolate)}`);
    process.exit(1);
  }
  const none = [closedPriced, openLoadUnpriced];
  if (countViolations(none) !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — expected 0 violations, got ${countViolations(none)}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS — closed-unpriced/closed-priced/open-load fixtures all counted correctly`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();
else main();
