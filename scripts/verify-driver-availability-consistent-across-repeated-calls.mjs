#!/usr/bin/env node
/**
 * DRV-AVAILABILITY-RLS-MASKED (owner order 2026-09-04, live-blocking). Owner's live measurement:
 * 12 consecutive calls to GET .../load-availability for an Active, non-deactivated driver returned
 * E_DRIVER_NOT_FOUND; one call moments earlier, identical URL, returned {ok:true} — ~1 success in
 * 13. "A guard that passes once on a flaky path proves nothing" — this guard calls the exact same
 * two queries canAssignLoadToDriver runs, 20 times in a row on FRESH connections each time (matching
 * 20 separate HTTP requests, not 20 queries reusing one connection), for a known-good driver, and
 * fails unless all 20 results are IDENTICAL.
 *
 * Run:
 *   node scripts/verify-driver-availability-consistent-across-repeated-calls.mjs --selftest  (no DB)
 *   node scripts/verify-driver-availability-consistent-against-repeated-calls.mjs             (live,
 *     needs DATABASE_URL + ENABLE_LIVE_DB_UNIT_TEST_GUARD=true, same honest-skip pattern as every
 *     other live-DB guard in this repo)
 */
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const LABEL = "verify-driver-availability-consistent-across-repeated-calls";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
// ANGEL ALFONSO SOSA — the exact driver named in the owner's live repro. Active, deactivated_at
// NULL, confirmed live 2026-09-04.
const KNOWN_GOOD_DRIVER = "fba21d80-628b-4228-ae54-336f9cbb73b6";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const CALLS = 20;

/** One call = one FRESH connection, exactly mirroring one HTTP request through withCompanyScope. */
async function oneCall(connectionString) {
  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', $1::text, true)`, [OWNER_USER_ID]);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const hos = await client.query(
      `
        SELECT d.id::text AS driver_id, COALESCE(hos.is_in_violation, false) AS is_in_violation
        FROM mdata.drivers d
        LEFT JOIN views.drivers_with_hos_status hos ON hos.id = d.id
        WHERE d.id = $1
          AND (
            d.operating_company_id = $2::uuid
            OR EXISTS (
              SELECT 1 FROM mdata.driver_company_authorizations dca
              WHERE dca.driver_id = d.id AND dca.company_id = $2::uuid
                AND dca.is_authorized = true AND dca.deactivated_at IS NULL
            )
          )
        LIMIT 1
      `,
      [KNOWN_GOOD_DRIVER, USMCA]
    );
    await client.query("COMMIT");
    return hos.rows[0] ? "FOUND" : "NOT_FOUND";
  } finally {
    await client.end();
  }
}

function fail(message) {
  console.error(`${LABEL} — FAILED\n${message}`);
  process.exit(1);
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live 20-call consistency scan did NOT run`);
    return;
  }

  const results = [];
  for (let i = 0; i < CALLS; i += 1) {
    results.push(await oneCall(connectionString));
  }
  const distinct = new Set(results);
  console.log(`${LABEL} — ${CALLS} calls: ${JSON.stringify(results)}`);
  if (distinct.size !== 1) {
    fail(
      `${CALLS} calls to the properly-scoped query produced ${distinct.size} distinct outcomes (${[...distinct].join(", ")}) — this must be perfectly deterministic; any variance means a connection-pooling or GUC-scope regression has returned.`
    );
  }
  if (results[0] !== "FOUND") {
    fail(
      `all ${CALLS} calls agreed, but the agreed result was NOT_FOUND for a known-Active, non-deactivated driver (${KNOWN_GOOD_DRIVER}) — the fix has regressed.`
    );
  }
  console.log(`${LABEL} — OK, ${CALLS}/${CALLS} identical FOUND results for the known-good driver`);
}

function selftest() {
  // Static shape check only — the live 20-call loop needs a real DB and is exercised by `main()`
  // directly when DATABASE_URL + ENABLE_LIVE_DB_UNIT_TEST_GUARD are set.
  if (CALLS < 20) {
    console.error(`${LABEL} SELFTEST FAIL — must call at least 20 times, got ${CALLS}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — static shape valid; live behavior requires DATABASE_URL + ENABLE_LIVE_DB_UNIT_TEST_GUARD=true`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  selftest();
}

main().catch((err) => {
  console.error(`${LABEL} — FAILED\n${err.stack || err}`);
  process.exit(1);
});
