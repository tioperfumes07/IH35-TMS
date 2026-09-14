#!/usr/bin/env node
// P1 (owner 2026-09-14, 09-14-2026-Claude-Coder-3-SHORT-MILES-NEVER-CAPTURED.md): "77 loads pay the
// driver off a mileage that was never captured." Root cause: BookLoadModalV4.tsx's own hard-block
// on miles_shortest only fires at INITIAL booking when a driver is already assigned — most loads
// are booked OPEN and get a driver seated LATER (quick-assign), where the gate never ran.
// book-load.service.ts's createDriverBillArtifacts now REFUSES to mint/update a driver_bills row
// for a fresh attempt when miles_shortest is NULL (P1-SHORT-MILES audit class), closing the hole
// going forward.
//
// THE FLOOR: this is the permanent, live-DB assertion that the fix holds — no ACTIVE load may
// carry a non-void driver_finance.driver_bills row while its own miles_shortest is NULL. A `0` is
// the eventual target; today's real number is a HISTORICAL BACKLOG (loads booked before this gate
// existed, several settled against signed AlwaysTrack documents — do NOT backfill them, per the
// ticket's own explicit instruction). BASELINE_COUNT is a shrink-only ratchet, exactly like
// docs/audit/VERIFY-STATIC-BASELINE.json's own convention: this guard fails if the live count ever
// EXCEEDS the baseline (a NEW load slipping through), and printed instructions tell whoever fixes
// backlog rows to lower the constant — never raise it.
//
// Database-required: exits 2 (UNVERIFIED) if DATABASE_URL/DATABASE_DIRECT_URL is unset — never
// treat "couldn't check" as "passed" (repo's SKIP-capability convention). bypass_rls required:
// mdata.loads/driver_finance.driver_bills are FORCED-RLS.
//
//   node scripts/verify-load-shortest-miles-before-pay.mjs
//   node scripts/verify-load-shortest-miles-before-pay.mjs --selftest   (pure logic check, no DB)
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
const LABEL = "verify-load-shortest-miles-before-pay";

// Measured live on prod (tiny-field-89581227, all entities) 2026-09-14, BEFORE any backfill —
// the historical count this session's own fix must never let grow. Lower this number as the
// backlog is legitimately resolved (a real shortest-miles value entered per load through the app);
// never raise it to paper over a new leak.
const BASELINE_COUNT = 66;

/** Pure predicate so --selftest can exercise it with no database. */
export function countViolations(rows) {
  return rows.filter((r) => r.miles_shortest == null).length;
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
        `SELECT DISTINCT l.id::text AS load_id, l.load_number, l.miles_shortest
           FROM mdata.loads l
           JOIN driver_finance.driver_bills db ON db.load_id = l.id
          WHERE l.soft_deleted_at IS NULL
            AND db.voided_at IS NULL`
      );
      await client.query("ROLLBACK");

      const count = countViolations(res.rows);
      if (count > BASELINE_COUNT) {
        const over = res.rows.filter((r) => r.miles_shortest == null).slice(0, 10);
        console.error(
          `${LABEL} FAILED — ${count} active loads carry a non-void driver bill with NULL miles_shortest, ` +
            `exceeding the baseline of ${BASELINE_COUNT} (a NEW load slipped through the P1 gate). Sample: ` +
            over.map((r) => r.load_number).join(", ")
        );
        process.exit(1);
        return;
      }
      if (count < BASELINE_COUNT) {
        console.log(
          `${LABEL} OK — ${count} active loads with a driver bill and NULL miles_shortest (below baseline ${BASELINE_COUNT} — ` +
            `lower BASELINE_COUNT in this file to ${count} so the ratchet tightens)`
        );
        process.exit(0);
        return;
      }
      console.log(`${LABEL} OK — ${count} active loads with a driver bill and NULL miles_shortest (== baseline, frozen, no NET-NEW)`);
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
    { load_id: "1", load_number: "13001", miles_shortest: "1200.5" },
    { load_id: "2", load_number: "13002", miles_shortest: null },
  ];
  if (countViolations(clean) !== 1) {
    console.error(`${LABEL}: SELFTEST FAIL — expected 1 violation, got ${countViolations(clean)}`);
    process.exit(1);
  }
  const allNull = [
    { load_id: "1", load_number: "13001", miles_shortest: null },
    { load_id: "2", load_number: "13002", miles_shortest: null },
    { load_id: "3", load_number: "13003", miles_shortest: null },
  ];
  if (countViolations(allNull) !== 3) {
    console.error(`${LABEL}: SELFTEST FAIL — expected 3 violations, got ${countViolations(allNull)}`);
    process.exit(1);
  }
  const none = [{ load_id: "1", load_number: "13001", miles_shortest: "500" }];
  if (countViolations(none) !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — expected 0 violations, got ${countViolations(none)}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS — clean/all-null/none fixtures all counted correctly`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();
else main();
