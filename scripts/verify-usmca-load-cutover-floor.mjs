#!/usr/bin/env node
// USMCA ENTITY CUTOVER FLOOR (owner ruling 2026-09-05, docs/bus/USMCA-SEED-CONTAMINATION-AND-
// CORRECTED-SCOPE-2026-09-05.md v2): "USMCA operational 2026-08-07 ... Therefore entity is decided
// by the WORK DATE, not by which Faro/QBO account factored/booked it. A load picked up on/after
// 08/07 is USMCA ... Never seed a load worked before 08/07."
//
// 21 pre-08/07 loads were quarantined (soft-void, WORM — never delete) after the seed scripts
// mixed true-Transportation loads into USMCA. This guard is the permanent floor so that
// contamination cannot silently return: it fails if ANY active (soft_deleted_at IS NULL) USMCA
// load has an earliest pickup stop date before 2026-08-07. A void/quarantined load (soft_deleted_at
// set) is explicitly excluded — quarantine, not deletion, is the correct state for the 21 already
// caught, and this guard must not re-flag work already done.
//
// Database-required: exits 2 (UNVERIFIED) if DATABASE_URL/DATABASE_DIRECT_URL is unset, matching
// this repo's SKIP-capability convention (verify-live-load-number-not-self-referential.mjs,
// verify-zero-count-completeness-discriminator) — never treat "couldn't check" as "passed".
// bypass_rls is required: mdata.load_stops/mdata.loads are FORCED-RLS and a bare read as a
// non-bypass role would silently return 0 rows regardless of the real data (§0 RLS 0-count
// landmine) — this guard reads inside a lucia-bypass transaction so a 0 is an actual verdict, not
// a policy artifact.
//
//   node scripts/verify-usmca-load-cutover-floor.mjs
//   node scripts/verify-usmca-load-cutover-floor.mjs --selftest   (pure logic check, no DB)
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
const LABEL = "verify-usmca-load-cutover-floor";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CUTOVER_DATE = "2026-08-07";

/** Pure predicate so --selftest can exercise it with no database. */
export function findViolations(rows) {
  return rows.filter((r) => r.earliest_pickup_date != null && r.earliest_pickup_date < CUTOVER_DATE);
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
        `SELECT l.load_number,
                l.id::text AS load_id,
                sp.scheduled_arrival_at::date::text AS earliest_pickup_date
           FROM mdata.loads l
           LEFT JOIN LATERAL (
             SELECT scheduled_arrival_at
               FROM mdata.load_stops
              WHERE load_id = l.id
                AND stop_type = 'pickup'
                AND soft_deleted_at IS NULL
              ORDER BY sequence_number ASC
              LIMIT 1
           ) sp ON true
          WHERE l.operating_company_id = $1::uuid
            AND l.soft_deleted_at IS NULL
          ORDER BY l.load_number`,
        [USMCA_COMPANY_ID]
      );
      await client.query("ROLLBACK");

      const violations = findViolations(res.rows);
      if (violations.length > 0) {
        console.error(`${LABEL} FAILED — ${violations.length} active USMCA load(s) pickup before ${CUTOVER_DATE}:`);
        for (const v of violations) {
          console.error(`  load ${v.load_number} (${v.load_id}) earliest pickup ${v.earliest_pickup_date}`);
        }
        process.exit(1);
        return;
      }
      console.log(`${LABEL} OK — 0 active USMCA loads with pickup before ${CUTOVER_DATE} (${res.rows.length} active USMCA loads checked)`);
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
  const clean = [
    { load_number: "13508", earliest_pickup_date: "2026-08-07" },
    { load_number: "13510", earliest_pickup_date: "2026-08-20" },
    { load_number: "13999", earliest_pickup_date: null }, // no pickup stop yet (draft) — never a violation
  ];
  if (findViolations(clean).length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — clean rows incorrectly flagged`);
    process.exit(1);
  }
  const contaminated = [
    ...clean,
    { load_number: "13471", earliest_pickup_date: "2026-07-03" }, // the exact 13497-class defect
  ];
  const found = findViolations(contaminated);
  if (found.length !== 1 || found[0].load_number !== "13471") {
    console.error(`${LABEL}: SELFTEST FAIL — planted pre-cutover pickup not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS — clean rows pass, planted pre-cutover pickup caught`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();
else main();
