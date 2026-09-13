#!/usr/bin/env node
/** REG-025: only the two owner-pending APD trailer identities may remain active in USMCA. */
/** @independent-input DATABASE_URL — live mdata.equipment read (gated ENABLE_LIVE_DB_UNIT_TEST_GUARD=true); the reconcile doc is only the static half of this check. */
import fs from "node:fs";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_PENDING = new Set(["USMCA-APD-25", "USMCA-APD-28"]);
const reconcilePath = "docs/reconcile/REG-034-APD-TRAILER-RELABEL-2026-09-10.md";

export function violations(rows, allowed = OWNER_PENDING) {
  return rows.filter((row) =>
    row.deactivated_at == null &&
    /^USMCA-APD-/i.test(String(row.equipment_number ?? "")) &&
    !allowed.has(String(row.equipment_number))
  );
}

function staticFailures(source = fs.readFileSync(reconcilePath, "utf8")) {
  const failures = [];
  for (const identity of OWNER_PENDING) {
    if (!source.includes(`**${identity}**`)) failures.push(`${identity} must remain explicitly owner-pending`);
  }
  if (!source.includes("no CSV mapping")) failures.push("owner-pending identities must be justified by the missing source mapping");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const plantedRows = [
    { equipment_number: "USMCA-APD-25", deactivated_at: null },
    { equipment_number: "USMCA-APD-28", deactivated_at: null },
    { equipment_number: "USMCA-APD-31", deactivated_at: null },
    { equipment_number: "USMCA-APD-16", deactivated_at: "2026-09-10T00:00:00Z" },
  ];
  const found = violations(plantedRows);
  if (found.length !== 1 || found[0].equipment_number !== "USMCA-APD-31") {
    console.error("verify-fleet-apd-trailer-identity --selftest FAIL — planted active placeholder escaped");
    process.exit(1);
  }
  const mutated = new Set([...OWNER_PENDING, "USMCA-APD-31"]);
  if (violations(plantedRows, mutated).length === 0) {
    console.log("verify-fleet-apd-trailer-identity --selftest PASS — 1/1 planted active placeholder detected");
    process.exit(0);
  }
  console.error("verify-fleet-apd-trailer-identity --selftest FAIL — classifier mutation was not observable");
  process.exit(1);
}

const staticErrors = staticFailures();
if (staticErrors.length) {
  console.error(`verify-fleet-apd-trailer-identity FAIL — ${staticErrors.join("; ")}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
  console.log("verify-fleet-apd-trailer-identity PASS (static) — live read requires DATABASE_URL + ENABLE_LIVE_DB_UNIT_TEST_GUARD=true");
  process.exit(0);
}

const pg = require("pg");
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const client = new pg.Client(buildPgClientConfig(connectionString));
await client.connect();
try {
  const result = await client.query(
    `WITH bypass AS (SELECT set_config('app.bypass_rls','lucia',false))
     SELECT e.id::text, e.equipment_number, e.status, e.deactivated_at::text
       FROM bypass, mdata.equipment e
      WHERE e.currently_leased_to_company_id = $1::uuid
        AND e.equipment_number ILIKE 'USMCA-APD-%'
        AND e.deactivated_at IS NULL
      ORDER BY e.equipment_number`,
    [USMCA]
  );
  const rows = result.rows ?? [];
  const unexpected = violations(rows);
  const names = new Set(rows.map((row) => row.equipment_number));
  const missing = [...OWNER_PENDING].filter((identity) => !names.has(identity));
  console.log(JSON.stringify({ active_apd_left: rows.length, rows, unexpected, missing_owner_pending: missing }, null, 2));
  if (unexpected.length || missing.length || rows.length !== OWNER_PENDING.size) {
    console.error(`verify-fleet-apd-trailer-identity FAIL — expected exactly APD-25/APD-28; active=${rows.length}, unexpected=${unexpected.length}, missing=${missing.length}`);
    process.exitCode = 1;
  } else {
    console.log("verify-fleet-apd-trailer-identity PASS — active_apd_left=2 (APD-25/APD-28 owner-pending only)");
  }
} finally {
  await client.end();
}
