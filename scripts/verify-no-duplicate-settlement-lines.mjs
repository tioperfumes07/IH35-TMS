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
 * Live run requires DATABASE_URL with the neondb_owner role (bypasses RLS) so
 * the query is unscoped. Selftest exercises the threshold logic without a DB.
 */
import { execSync } from "node:child_process";

// Live-only guard: no DATABASE_URL → skip is intentional (requires Neon neondb_owner role).
export const ALLOW_OFFLINE_SKIP = "shrink-only ceiling on USMCA duplicate settlement lines; live Neon required";

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
  const db = process.env.DATABASE_URL;
  if (!db) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (offline; CI runs this with Neon neondb_owner)`);
    process.exit(0);
  }

  const sql = `
    SELECT COUNT(*)::int AS dupe_groups
    FROM (
      SELECT sl.settlement_id, sl.load_id, sl.line_type
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
      WHERE ds.operating_company_id = '${USMCA_COMPANY_ID}'::uuid
        AND sl.is_active = true
        AND sl.voided_at IS NULL
      GROUP BY sl.settlement_id, sl.load_id, sl.line_type
      HAVING COUNT(*) > 1
    ) g
  `.trim();

  let count;
  try {
    const out = execSync(
      `psql "${db}" -t -A -c "${sql.replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    count = parseInt(out, 10);
  } catch (e) {
    console.error(`${LABEL} ERROR querying DB: ${e.message}`);
    process.exit(1);
  }

  if (isNaN(count)) {
    console.error(`${LABEL} ERROR: could not parse DB result`);
    process.exit(1);
  }

  if (count > DUPLICATE_CEILING) {
    console.error(
      `${LABEL} FAIL: ${count} active duplicate settlement-line groups found on USMCA (ceiling=${DUPLICATE_CEILING}). ` +
        `ENG-42 fix required — run a void/dedup script and lower DUPLICATE_CEILING.`
    );
    process.exit(1);
  }

  console.log(
    `${LABEL} OK — ${count} duplicate groups (ceiling=${DUPLICATE_CEILING})`
  );
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await liveRun();
}
