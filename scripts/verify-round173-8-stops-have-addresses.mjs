#!/usr/bin/env node
// ROUND 173 JOB 2 guard: the 8 specific stops named in the Lead's order (loads 13625/13627/13628/
// 13631/13638) must never regress to a NULL address_line1. Pinned by stop_id, not by load number
// or city, so a future re-dispatch/renumbering of these loads can't silently defeat the guard.
import pg from "pg";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";

const LABEL = "verify-round173-8-stops-have-addresses";
const STOP_IDS = [
  "6de58e1c-2b89-4be3-b955-a82020c8fb16", // 13625 pickup
  "8b6132da-be36-45f5-b43f-be06df03a82c", // 13625 delivery
  "db0eac78-0ab3-4386-b1ed-59fc2b099daf", // 13627 pickup
  "27cb8fc2-9500-49e4-a54e-f0db02d44bee", // 13627 delivery
  "2727c89e-5cc9-4bc1-8589-0feda5b3e33e", // 13628 delivery
  "8930dd54-2e19-476e-818f-e26475bde6c9", // 13631 pickup
  "f82d965d-b340-401d-837e-13a96d5c8f8f", // 13638 pickup
  "14535624-dedc-4f9f-94ce-b5622798ec10", // 13638 delivery
];

function selftest() {
  if (STOP_IDS.length !== 8) {
    console.error(`${LABEL} SELFTEST FAILED: expected exactly the 8 stops named in the ROUND 173 order, got ${STOP_IDS.length}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 8 stop ids pinned`);
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
    // Prefer bypass_rls alone — SET ROLE neondb_owner fails on app-role DATABASE_URL credentials
    // NEONDB-OWNER-OK: the line above DESCRIBES why this guard does not SET ROLE; it opens no owner connection (Lead 2026-10-01, surfaced by verify-gate-live-reads-use-ci-readonly on any scripts/ diff)
    // (permission denied) and is unnecessary when lucia bypass is set.
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const res = await client.query(
      `SELECT id::text, address_line1 FROM mdata.load_stops WHERE id = ANY($1::uuid[])`,
      [STOP_IDS]
    );
    await client.query("ROLLBACK");

    const found = new Map(res.rows.map((r) => [r.id, r.address_line1]));
    const failures = [];
    for (const id of STOP_IDS) {
      const addr = found.get(id);
      if (!addr) failures.push(`${id}: address_line1 is NULL or the stop is gone`);
    }
    if (failures.length) {
      console.error(`${LABEL}: FAIL — ${failures.length} of ${STOP_IDS.length} pinned stops regressed:`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — all ${STOP_IDS.length} pinned stops still carry an address_line1.`);
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
