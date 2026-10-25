#!/usr/bin/env node
/**
 * ENG-42 (443.328): shrink-only guard on active duplicate settlement-line groups.
 *
 * At 2026-10-25 the live USMCA data had 15 groups where the same
 * (settlement_id, load_id, line_type) triple had more than one is_active=true row
 * (the original 89 count has been reduced by prior engine fixes). This guard locks
 * the ceiling at DUPLICATE_CEILING and fails if the count regresses above it.
 *
 * It is a SHRINK-ONLY guard: the ceiling may only decrease (or be removed) once
 * a clean-up script voids the remaining groups; it must never be raised.
 *
 * Live run requires DATABASE_URL (fail-closed via requireLiveDbOrExit — never silent skip).
 * Selftest exercises the threshold logic without a DB.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

// Live-only guard: no DATABASE_URL → skip is intentional (requires Neon neondb_owner role).
export const ALLOW_OFFLINE_SKIP = "shrink-only ceiling on USMCA duplicate settlement lines; live Neon required";

// ALLOW_OFFLINE_SKIP: selftest exercises the threshold logic without a DB;
// the live run requires DATABASE_URL to query USMCA settlement_lines.
export const ALLOW_OFFLINE_SKIP = "selftest covers threshold logic; live query skipped offline";

const LABEL = "verify-no-duplicate-settlement-lines";

// shrink-only ceiling — lower this after a clean-up script voids the remaining groups
const DUPLICATE_CEILING = 15;

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function selftest() {
  const cases = [
    { count: 0, ceiling: 15, expectFail: false },
    { count: 15, ceiling: 15, expectFail: false },
    { count: 16, ceiling: 15, expectFail: true },
    { count: 89, ceiling: 15, expectFail: true },
    { count: 0, ceiling: 0, expectFail: false },
    { count: 1, ceiling: 0, expectFail: true },
  ];
  for (const { count, ceiling, expectFail } of cases) {
    const fails = count > ceiling;
    if (fails !== expectFail) {
      console.error(
        `${LABEL} SELFTEST FAIL: count=${count} ceiling=${ceiling} expected_fail=${expectFail} got_fail=${fails}`
      );
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST OK (${cases.length}/${cases.length} cases)`);
}

async function liveRun() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const res = await client.query(
      `
      SELECT COUNT(*)::int AS dupe_groups
      FROM (
        SELECT sl.settlement_id, sl.load_id, sl.line_type
        FROM driver_finance.settlement_lines sl
        JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
        WHERE ds.operating_company_id = $1::uuid
          AND sl.is_active = true
          AND sl.voided_at IS NULL
        GROUP BY sl.settlement_id, sl.load_id, sl.line_type
        HAVING COUNT(*) > 1
      ) g
      `,
      [USMCA_COMPANY_ID],
    );
    const count = res.rows[0]?.dupe_groups ?? NaN;
    if (Number.isNaN(count)) {
      console.error(`${LABEL} ERROR: could not parse DB result`);
      process.exit(1);
    }
    if (count > DUPLICATE_CEILING) {
      console.error(
        `${LABEL} FAIL: ${count} active duplicate settlement-line groups found on USMCA (ceiling=${DUPLICATE_CEILING}). ` +
          `ENG-42 fix required — run a void/dedup script and lower DUPLICATE_CEILING.`,
      );
      process.exit(1);
    }
    console.log(`${LABEL} OK — ${count} duplicate groups (ceiling=${DUPLICATE_CEILING})`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await liveRun();
}
