#!/usr/bin/env node
/**
 * ENG-13 (CC-2 Row 13) — trailer choice engine guard.
 *
 * Verifies that every active (non-cancelled, non-voided) USMCA load has a trailer recorded
 * via load_trailer_equipment_id (company equipment) OR non_owned_trailer_id (interchange/external).
 *
 * Measured 2026-11-13: 227 active loads, 0 missing trailer — ceiling 0.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-trailer-choice-engine";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const NO_TRAILER_CEILING = 0;

async function measure(client, companyId) {
  const r = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE load_trailer_equipment_id IS NULL AND non_owned_trailer_id IS NULL) no_trailer_count,
       COUNT(*) total_active_loads
     FROM mdata.loads
     WHERE operating_company_id = $1::uuid
       AND is_sample_data IS DISTINCT FROM true
       AND status NOT IN ('cancelled','voided')`,
    [companyId]
  );
  return {
    no_trailer_count: parseInt(r.rows[0]?.no_trailer_count ?? "0"),
    total_active_loads: parseInt(r.rows[0]?.total_active_loads ?? "0"),
  };
}

function check(data) {
  const fails = [];
  if (data.no_trailer_count > NO_TRAILER_CEILING) {
    fails.push(
      `${data.no_trailer_count} active load(s) missing trailer (ceiling ${NO_TRAILER_CEILING})` +
        ` out of ${data.total_active_loads} total active loads`
    );
  }
  return fails;
}

async function run() {
  const selftest = process.argv.includes("--selftest");

  if (selftest) {
    // Mutation 1: no_trailer_count > ceiling
    const fake1 = { no_trailer_count: 1, total_active_loads: 230 };
    const fails1 = check(fake1);
    if (fails1.length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation 1 (no_trailer_count > 0) not caught`);
      process.exit(1);
    }

    // Mutation 2: zero loads would still pass (guard is ceiling-based)
    const fake2 = { no_trailer_count: 0, total_active_loads: 230 };
    const fails2 = check(fake2);
    if (fails2.length !== 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation 2 (clean state should pass) unexpectedly failed`);
      process.exit(1);
    }

    console.log(`${LABEL} --selftest PASS 2/2 mutations caught`);
    process.exit(0);
  }

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");
    await client.query(`SET LOCAL app.operating_company_id = '${USMCA}'`);

    const data = await measure(client, USMCA);
    const fails = check(data);

    if (fails.length > 0) {
      console.error(`${LABEL} FAIL (${fails.length}):`);
      for (const f of fails) console.error(`  - ${f}`);
      process.exitCode = 1;
    } else {
      console.log(
        `${LABEL}: PASS — ${data.no_trailer_count} loads missing trailer` +
          ` (ceiling ${NO_TRAILER_CEILING}) | ${data.total_active_loads} active loads`
      );
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(`${LABEL} ERROR: ${err.message}`);
  process.exit(1);
});
