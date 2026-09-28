#!/usr/bin/env node
// ROUND 166 JOB 3 (owner ruling): load 90007 did not exist -- a fabricated load number invented
// to carry a real Faro-purchased invoice (ITS Logistics LLC, PO 68747, $350.00) that had no real
// load in the Faro reconciliation. "Someone invented a load to hold it." This guard is the
// permanent gate: any live USMCA load whose load_number is outside the sanctioned numbering
// series (four consecutive digits starting with 13, e.g. 13503, 13639) fails, so the next
// "invent a load to hold an orphan invoice" shortcut is caught immediately instead of live-only
// discovered months later.
import pg from "pg";

const LABEL = "verify-no-fabricated-load-numbers";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SANCTIONED_PATTERN = /^13\d{3}$/;

export function isSanctionedLoadNumber(loadNumber) {
  return SANCTIONED_PATTERN.test(String(loadNumber ?? ""));
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  t("a real load number in the sanctioned series passes", isSanctionedLoadNumber("13503") === true);
  t("a real load number at the edge of the series passes", isSanctionedLoadNumber("13999") === true);
  t("the fabricated 90007 fails", isSanctionedLoadNumber("90007") === false);
  t("a 5-digit number outside 13xxx fails", isSanctionedLoadNumber("14000") === false);
  t("a non-numeric value fails", isSanctionedLoadNumber("ABC123") === false);
  t("empty/null fails", isSanctionedLoadNumber(null) === false);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 6 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (live-data invariant by design).`);
    process.exit(0);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE neondb_owner`);
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const res = await client.query(
      `SELECT load_number, status FROM mdata.loads
        WHERE operating_company_id = $1::uuid AND soft_deleted_at IS NULL AND status <> 'cancelled'`,
      [USMCA]
    );
    await client.query("ROLLBACK");

    const fabricated = res.rows.filter((r) => !isSanctionedLoadNumber(r.load_number));
    if (fabricated.length > 0) {
      console.error(`${LABEL}: FAIL — ${fabricated.length} load(s) outside the sanctioned 13xxx series and not cancelled:`);
      for (const f of fabricated) console.error(`  ✗ ${f.load_number} (status=${f.status})`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — ${res.rows.length} active load(s) checked, 0 outside the sanctioned series.`);
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
