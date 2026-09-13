#!/usr/bin/env node
// ROUND 23.4 B7 (owner, 2026-09-13): "cutover-flag fixes" for 7 named USMCA loads
// (13497/13498/13503/13504/13506/13509/13579) — real, signed-document-verified economic history
// that was seeded with is_sample_data=true (13579 additionally carried the illegal
// is_sample_data=true + status='invoiced' combo). Fixed by scripts/run-fix-b7-usmca-cutover-
// flags-once.mts, penny-verified against data/alwaystrack/settlements-truth-2026-09-13.json.
//
// This is the permanent floor: fails if ANY of the 7 loads still carries is_sample_data=true, if
// 13579's rate_total_cents / driver-bill gross / invoice is_sample_data drift back off their
// ground-truth-verified values, or if 13509's driver-bill gross drifts off its corrected value.
// No test/sample/demo rows in USMCA for any reason — this guard is what keeps that permanent for
// these 7 specifically, the same way verify-usmca-load-cutover-floor.mjs is the floor for pickup
// dates.
//
// Database-required: exits 2 (UNVERIFIED) if DATABASE_URL/DATABASE_DIRECT_URL is unset — never
// treat "couldn't check" as "passed" (repo's SKIP-capability convention). bypass_rls required:
// mdata.loads/accounting.invoices/driver_finance.driver_bills are FORCED-RLS.
//
//   node scripts/verify-usmca-settlement-cutover.mjs
//   node scripts/verify-usmca-settlement-cutover.mjs --selftest   (pure logic check, no DB)
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
const LABEL = "verify-usmca-settlement-cutover";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

const LOAD_NUMBERS = ["13497", "13498", "13503", "13504", "13506", "13509", "13579"];
const EXPECTED_RATE_TOTAL_CENTS = { "13579": 490000 };
const EXPECTED_DRIVER_BILL_GROSS_CENTS = { "13509": 96035, "13579": 94510 };
const TOUR_SETTLEMENT_DISPLAY_IDS = ["S-2026-0019", "S-2026-0025"]; // 13569/13577, 13579

/** Pure predicate so --selftest can exercise it with no database. */
export function findViolations({ loads, invoices, driverBills, tourSettlements }) {
  const violations = [];
  for (const l of loads) {
    if (l.is_sample_data === true) {
      violations.push(`load ${l.load_number}: is_sample_data still true`);
    }
    const expectedRate = EXPECTED_RATE_TOTAL_CENTS[l.load_number];
    if (expectedRate != null && Number(l.rate_total_cents) !== expectedRate) {
      violations.push(`load ${l.load_number}: rate_total_cents=${l.rate_total_cents}, expected ${expectedRate}`);
    }
  }
  for (const inv of invoices) {
    if (inv.load_number === "13579" && inv.is_sample_data === true) {
      violations.push(`load 13579 invoice: is_sample_data still true`);
    }
  }
  for (const db of driverBills) {
    const expected = EXPECTED_DRIVER_BILL_GROSS_CENTS[db.load_number];
    if (expected != null && Number(db.gross_amount_cents) !== expected) {
      violations.push(`load ${db.load_number} driver bill: gross_amount_cents=${db.gross_amount_cents}, expected ${expected}`);
    }
  }
  for (const s of tourSettlements ?? []) {
    if (s.status === "cancelled") {
      violations.push(`tour settlement ${s.display_id}: status still cancelled (signed, closed document — must be closed, not stuck)`);
    }
    if (!s.trip_closed_at) {
      violations.push(`tour settlement ${s.display_id}: trip_closed_at not stamped`);
    }
  }
  return violations;
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

      const loads = await client.query(
        `SELECT load_number, is_sample_data, rate_total_cents::text AS rate_total_cents
           FROM mdata.loads
          WHERE load_number = ANY($1::text[]) AND operating_company_id = $2::uuid`,
        [LOAD_NUMBERS, USMCA_COMPANY_ID]
      );
      const invoices = await client.query(
        `SELECT l.load_number, inv.is_sample_data
           FROM accounting.invoices inv
           JOIN mdata.loads l ON l.id = inv.source_load_id
          WHERE l.load_number = ANY($1::text[]) AND l.operating_company_id = $2::uuid`,
        [LOAD_NUMBERS, USMCA_COMPANY_ID]
      );
      const driverBills = await client.query(
        `SELECT l.load_number, db.gross_amount_cents::text AS gross_amount_cents
           FROM driver_finance.driver_bills db
           JOIN mdata.loads l ON l.id = db.load_id
          WHERE l.load_number IN ('13509', '13579') AND l.operating_company_id = $1::uuid`,
        [USMCA_COMPANY_ID]
      );
      const tourSettlements = await client.query(
        `SELECT display_id, status, trip_closed_at
           FROM driver_finance.driver_settlements
          WHERE display_id = ANY($1::text[]) AND operating_company_id = $2::uuid`,
        [TOUR_SETTLEMENT_DISPLAY_IDS, USMCA_COMPANY_ID]
      );
      await client.query("ROLLBACK");

      if (loads.rows.length !== LOAD_NUMBERS.length) {
        console.error(`${LABEL} FAILED — expected ${LOAD_NUMBERS.length} loads under USMCA, found ${loads.rows.length}`);
        process.exit(1);
        return;
      }
      if (tourSettlements.rows.length !== TOUR_SETTLEMENT_DISPLAY_IDS.length) {
        console.error(`${LABEL} FAILED — expected ${TOUR_SETTLEMENT_DISPLAY_IDS.length} tour settlements, found ${tourSettlements.rows.length}`);
        process.exit(1);
        return;
      }

      const violations = findViolations({ loads: loads.rows, invoices: invoices.rows, driverBills: driverBills.rows, tourSettlements: tourSettlements.rows });
      if (violations.length > 0) {
        console.error(`${LABEL} FAILED — ${violations.length} cutover-flag violation(s):`);
        for (const v of violations) console.error(`  ${v}`);
        process.exit(1);
        return;
      }
      console.log(`${LABEL} OK — all 7 B7 loads is_sample_data=false, 13579 rate/invoice correct, 13509+13579 driver bills correct, both tour settlements closed`);
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
  const clean = {
    loads: [
      { load_number: "13497", is_sample_data: false, rate_total_cents: "720000" },
      { load_number: "13498", is_sample_data: false, rate_total_cents: "380000" },
      { load_number: "13503", is_sample_data: false, rate_total_cents: "490000" },
      { load_number: "13504", is_sample_data: false, rate_total_cents: "490000" },
      { load_number: "13506", is_sample_data: false, rate_total_cents: "390000" },
      { load_number: "13509", is_sample_data: false, rate_total_cents: "440000" },
      { load_number: "13579", is_sample_data: false, rate_total_cents: "490000" },
    ],
    invoices: [{ load_number: "13579", is_sample_data: false }],
    driverBills: [
      { load_number: "13509", gross_amount_cents: "96035" },
      { load_number: "13579", gross_amount_cents: "94510" },
    ],
    tourSettlements: [
      { display_id: "S-2026-0019", status: "closed", trip_closed_at: "2026-09-05T00:00:00.000Z" },
      { display_id: "S-2026-0025", status: "closed", trip_closed_at: "2026-09-11T00:00:00.000Z" },
    ],
  };
  if (findViolations(clean).length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — clean fixture incorrectly flagged`);
    process.exit(1);
  }

  const mutations = [
    { ...clean, loads: clean.loads.map((l) => (l.load_number === "13498" ? { ...l, is_sample_data: true } : l)) },
    { ...clean, loads: clean.loads.map((l) => (l.load_number === "13579" ? { ...l, rate_total_cents: "465000" } : l)) },
    { ...clean, invoices: [{ load_number: "13579", is_sample_data: true }] },
    { ...clean, driverBills: clean.driverBills.map((d) => (d.load_number === "13509" ? { ...d, gross_amount_cents: "101190" } : d)) },
    { ...clean, driverBills: clean.driverBills.map((d) => (d.load_number === "13579" ? { ...d, gross_amount_cents: "53851" } : d)) },
    { ...clean, tourSettlements: clean.tourSettlements.map((s) => (s.display_id === "S-2026-0019" ? { ...s, status: "cancelled" } : s)) },
    { ...clean, tourSettlements: clean.tourSettlements.map((s) => (s.display_id === "S-2026-0025" ? { ...s, trip_closed_at: null } : s)) },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (findViolations(mutated).length === 0) {
      console.error(`${LABEL}: SELFTEST FAIL — mutation ${i} not caught`);
      process.exit(1);
    }
  }

  console.log(`${LABEL}: SELFTEST PASS — clean fixture passes, all ${mutations.length} planted mutations caught`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();
else main();
