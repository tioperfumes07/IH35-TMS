#!/usr/bin/env node
// ROUND 166 JOB 2: three driver bills minted with $0.00 gross in three DIFFERENT failure shapes,
// which is exactly why one narrow check missed them:
//   13618/13621 (already fixed, AUTH-097) -- real miles+rate existed, bill was stale/orphaned.
//   13544 -- HAS a rate (45c/mi), miles_basis snapshotted as 0.0 (zero, not null).
//   13595 -- minted COMPLETELY EMPTY: miles_basis NULL, rate_per_mile_cents NULL, miles_basis_type
//            NULL. TWO of these three are already inside settled/closing settlements, carrying
//            $0.00 driver pay into a settlement document as though it were correct pay, not a gap.
// This guard is the permanent, comprehensive gate: a non-void driver bill with gross_amount_cents
// = 0, OR null/zero miles_basis, OR null/zero rate_per_mile_cents, fails -- covering all three
// shapes with one check, not one guard per shape.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const ALLOW_OFFLINE_SKIP = "live-money invariant by design, no static-only path";

const LABEL = "verify-driver-bill-has-miles-and-rate";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = path.join(ROOT, "scripts/verify-driver-bill-has-miles-and-rate.baseline.json");

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

export function findDefect(bill) {
  const gross = Number(bill.gross_amount_cents ?? 0);
  const reasons = [];
  if (gross === 0) reasons.push("gross_amount_cents = 0");

  // A per_load_pay (flat) bill legitimately snapshots no miles_basis_type at all -- only a bill
  // that DID snapshot one (meaning it was priced per-mile) is held to the miles+rate requirement.
  if (bill.miles_basis_type) {
    const miles = bill.miles_basis === null || bill.miles_basis === undefined ? null : Number(bill.miles_basis);
    const rate = bill.rate_per_mile_cents === null || bill.rate_per_mile_cents === undefined ? null : Number(bill.rate_per_mile_cents);
    if (miles === null) reasons.push("miles_basis is NULL");
    else if (miles === 0) reasons.push("miles_basis = 0");
    if (rate === null) reasons.push("rate_per_mile_cents is NULL");
    else if (rate === 0) reasons.push("rate_per_mile_cents = 0");
  }

  return reasons.length > 0 ? reasons : null;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  t("a real, priced bill passes", findDefect({ gross_amount_cents: 64704, miles_basis: 1348.0, rate_per_mile_cents: 48, miles_basis_type: "short" }) === null);
  t("13544 shape (rate present, miles zero) is caught", (() => {
    const r = findDefect({ gross_amount_cents: 0, miles_basis: 0, rate_per_mile_cents: 45, miles_basis_type: "practical" });
    return r !== null && r.some((x) => x.includes("miles_basis = 0"));
  })());
  t("13595 shape (everything null) is caught", (() => {
    const r = findDefect({ gross_amount_cents: 0, miles_basis: null, rate_per_mile_cents: null, miles_basis_type: null });
    return r !== null && r.length >= 1; // gross=0 alone is already a defect even with no basis_type
  })());
  t("zero rate with real miles is caught (the third named shape)", (() => {
    const r = findDefect({ gross_amount_cents: 0, miles_basis: 500, rate_per_mile_cents: 0, miles_basis_type: "practical" });
    return r !== null && r.some((x) => x.includes("rate_per_mile_cents = 0"));
  })());
  t("a team-split bill with real gross but no per-mile snapshot (flat pay) is not falsely flagged on rate alone when gross is real", (() => {
    const r = findDefect({ gross_amount_cents: 50000, miles_basis: null, rate_per_mile_cents: null });
    // flat/per_load_pay bills legitimately carry no miles_basis/rate_per_mile_cents -- gross > 0 is
    // real money and must NOT be treated as a defect just because the per-mile snapshot is absent.
    return r === null;
  })());

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 5 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (live-money invariant by design).`);
    process.exit(0);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE neondb_owner`);
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const res = await client.query(`
      SELECT id::text, load_number, gross_amount_cents, miles_basis::text, rate_per_mile_cents::text, miles_basis_type, settled_in_settlement_id::text
        FROM driver_finance.driver_bills
       WHERE status <> 'void'
    `);
    await client.query("ROLLBACK");

    const violations = [];
    for (const bill of res.rows) {
      const reasons = findDefect(bill);
      if (reasons) violations.push({ ...bill, reasons });
    }

    const baseline = loadBaseline();
    const baselineIds = new Set(baseline?.known_defective_bill_ids ?? []);
    const newRot = violations.filter((v) => !baselineIds.has(v.id));

    if (newRot.length > 0) {
      console.error(`${LABEL}: FAIL — ${newRot.length} NEW driver bill(s) with a real defect (not in baseline):`);
      for (const v of newRot) {
        const settledNote = v.settled_in_settlement_id ? ` [INSIDE SETTLEMENT ${v.settled_in_settlement_id}]` : "";
        console.error(`  ✗ load ${v.load_number} (bill ${v.id}): ${v.reasons.join(", ")}${settledNote}`);
      }
      process.exit(1);
    }
    const nowClean = [...baselineIds].filter((id) => !violations.some((v) => v.id === id));
    console.log(
      `${LABEL}: PASS — ${res.rows.length} live driver bill(s) checked, ${violations.length}/${baselineIds.size} known baselined defect(s)` +
        (nowClean.length ? `; ${nowClean.length} now fixed — shrink the baseline: ${nowClean.join(", ")}` : "")
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
