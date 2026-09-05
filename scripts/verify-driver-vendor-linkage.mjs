#!/usr/bin/env node
/**
 * SEED/DRIVERS-ARE-VENDORS — historical-backfill guard (owner task, 2026-09-05).
 *
 * Root cause (fixed, PR #20738): ensure-driver-vendor.shared.ts minted driver payees with
 * vendor_type='Other', invisible to any vendor_type='Driver' filter (settlement pay AP posting,
 * vendor Purchases YTD, statements). This guard proves the HISTORICAL gap measured on Neon
 * (USMCA, bypass_rls=lucia) is closed and stays closed:
 *   (a) 0 SETTLEMENT-ACTIVE drivers without a live vendor_type='Driver' row.
 *   (b) 0 driver-linked vendors still typed 'Other'.
 *
 * "Settlement-active" = has a driver_finance.driver_settlements row carrying real financial
 * substance (nonzero gross/net/deductions/reimbursements, a posted_at, or an accounting_bill_id)
 * — NOT merely an empty $0.00 open draft shell. Two USMCA drivers (HUGO GAYTAN 3445cf68,
 * GENARO GUERRERO CHAVEZ 6edcb351) surfaced during this backfill as duplicate driver records:
 * each has a $0.00 open/unposted settlement with no vendor, while a SIBLING driver_id for the
 * same person already carries the correctly-typed 'Driver' vendor. Minting a second vendor for
 * either would collide on mdata.vendors' name-uniqueness constraint (by design) and would fork a
 * second real-money payee for one physical person — worse than the original defect. This is a
 * SEPARATE, boarded defect (duplicate mdata.drivers rows from an unidentified 2026-09-05 write
 * path), not fixed by this guard/backfill. If either drafted settlement ever gets real money
 * (gross/net/deductions/reimbursements != 0, posted, or billed), this guard goes RED and that is
 * the correct signal to resolve the duplicate before it can post.
 *
 * Target: Neon project tiny-field-89581227, branch br-fancy-credit-akjnd07a (prod). Read-only.
 * Usage:
 *   node scripts/verify-driver-vendor-linkage.mjs --selftest
 *   DATABASE_URL=<prod> node scripts/verify-driver-vendor-linkage.mjs
 */
import fs from "node:fs";

const LABEL = "verify-driver-vendor-linkage";
const CREATE_PATH = "apps/backend/src/mdata/ensure-driver-vendor.shared.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function createPathMintsDriverType(source) {
  const insertMatch = source.match(/INSERT INTO mdata\.vendors[\s\S]*?VALUES \(([^)]*)\)/);
  if (!insertMatch) return false;
  return /'Driver'/.test(insertMatch[1]) && !/'Other'/.test(insertMatch[1]);
}

function selftest() {
  const good = fs.readFileSync(CREATE_PATH, "utf8");
  if (!createPathMintsDriverType(good)) {
    console.error(`${LABEL} SELFTEST FAIL — good source rejected`);
    process.exit(1);
  }
  const regressed = good.replace("VALUES ($1, $2, 'Driver',", "VALUES ($1, $2, 'Other',");
  if (createPathMintsDriverType(regressed)) {
    console.error(`${LABEL} SELFTEST FAIL — reverting to 'Other' was not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 1/1 plant rejected`);
}

if (process.argv.includes("--selftest")) selftest();

// Static half: the create path itself must keep minting 'Driver' (root cause, PR #20738).
if (!fs.existsSync(CREATE_PATH)) {
  console.error(`${LABEL}: FAIL — ${CREATE_PATH} not found`);
  process.exit(1);
}
const createSrc = fs.readFileSync(CREATE_PATH, "utf8");
if (!createPathMintsDriverType(createSrc)) {
  console.error(`${LABEL}: FAIL — ${CREATE_PATH} no longer mints vendor_type='Driver' on the driver-vendor create path`);
  process.exit(1);
}
console.log(`${LABEL}: static OK — driver-vendor create path mints vendor_type='Driver'`);

// Live half: only runs with a real DATABASE_URL (prod or a branch) — same convention as
// verify-acc13-no-test-accounts-in-usmca-coa.mjs; never part of the CI ephemeral-DB suite.
if (!process.env.DATABASE_URL) {
  console.log(`${LABEL}: DATABASE_URL not set — skipping the live re-count (static check above still ran).`);
  console.log(`${LABEL}: to re-run the live count: DATABASE_URL=<prod> node ${process.argv[1]}`);
  process.exit(0);
}

const { Client } = await import("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  // Positive control on the SAME table this guard reads — a 0 here means a masked/false-empty
  // read, not a verdict (the RLS 0-count landmine).
  const control = await client.query(
    `SELECT count(*)::int AS n FROM mdata.vendors WHERE operating_company_id = $1 AND driver_id IS NOT NULL`,
    [USMCA]
  );
  if (control.rows[0].n === 0) {
    console.error(`${LABEL}: FAIL — driver_vendor_control=0, this connection cannot see USMCA's driver-vendors (masked read, not a verdict)`);
    process.exit(1);
  }

  const stillOther = await client.query(
    `
      SELECT vendor_name FROM mdata.vendors
       WHERE operating_company_id = $1 AND driver_id IS NOT NULL AND vendor_type = 'Other' AND deactivated_at IS NULL
    `,
    [USMCA]
  );

  const settlementActiveNoVendor = await client.query(
    `
      SELECT d.id::text, d.first_name, d.last_name
        FROM mdata.drivers d
       WHERE d.operating_company_id = $1
         AND EXISTS (
           SELECT 1 FROM driver_finance.driver_settlements ds
            WHERE ds.driver_id = d.id
              AND (ds.gross_pay <> 0 OR ds.net_pay <> 0 OR ds.deductions_total <> 0
                   OR ds.reimbursements_total <> 0 OR ds.posted_at IS NOT NULL
                   OR ds.accounting_bill_id IS NOT NULL)
         )
         AND NOT EXISTS (
           SELECT 1 FROM mdata.vendors v
            WHERE v.driver_id = d.id AND v.deactivated_at IS NULL AND v.vendor_type = 'Driver'
         )
    `,
    [USMCA]
  );

  await client.query("ROLLBACK");

  const failures = [];
  if (stillOther.rows.length > 0) {
    failures.push(`${stillOther.rows.length} active driver-linked vendor(s) still typed 'Other': ${stillOther.rows.map((r) => r.vendor_name).join(", ")}`);
  }
  if (settlementActiveNoVendor.rows.length > 0) {
    failures.push(
      `${settlementActiveNoVendor.rows.length} settlement-active driver(s) without a live 'Driver' vendor: ${settlementActiveNoVendor.rows
        .map((r) => `${r.first_name} ${r.last_name} (${r.id})`)
        .join(", ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL}: FAIL (driver_vendor_control=${control.rows[0].n})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: PASS — 0 settlement-active drivers without a 'Driver' vendor, 0 active driver-vendors typed 'Other' (driver_vendor_control=${control.rows[0].n})`
  );
} finally {
  await client.end();
}
