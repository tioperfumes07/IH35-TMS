#!/usr/bin/env node
/** FAC-10: detect active, unflagged TEST/CODEX vendors in USMCA. Read-only. */
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const suspicious = (row) => /codex|test/i.test(String(row.vendor_name ?? ""));
const violates = (row) => suspicious(row) && row.deactivated_at == null && row.is_sample_data !== true;

function selftest() {
  const cases = [
    [{ vendor_name: "CODEX TEST Go0034", deactivated_at: null, is_sample_data: false }, true],
    [{ vendor_name: "CODEX TEST archived", deactivated_at: "2026-09-06", is_sample_data: false }, false],
    [{ vendor_name: "TEST quarantined", deactivated_at: null, is_sample_data: true }, false],
    [{ vendor_name: "Tire Service", deactivated_at: null, is_sample_data: false }, false],
  ];
  const failures = cases.filter(([row, expected]) => violates(row) !== expected);
  if (failures.length) {
    console.error(`verify-usmca-no-active-test-vendors --selftest FAIL — ${failures.length} classification(s) escaped`);
    process.exit(1);
  }
  console.log(`verify-usmca-no-active-test-vendors --selftest PASS — ${cases.length}/${cases.length} active/quarantined mutations classified`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    console.log("verify-usmca-no-active-test-vendors PASS (static) — live read requires DATABASE_URL + ENABLE_LIVE_DB_UNIT_TEST_GUARD=true");
  } else {
    const pg = require("pg");
    const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
    const client = new pg.Client(buildPgClientConfig(connectionString));
    await client.connect();
    try {
      const result = await client.query(
        `WITH bypass AS (SELECT set_config('app.bypass_rls','lucia',false))
         SELECT v.id::text, v.vendor_name, v.created_at::text, v.created_by::text,
                is_sample_data, deactivated_at::text
           FROM bypass, mdata.vendors v
          WHERE v.operating_company_id = $1::uuid
            AND v.vendor_name ~* '(codex|test)'
          ORDER BY v.created_at, v.id`,
        [USMCA]
      );
      const rows = result.rows ?? [];
      const active = rows.filter(violates);
      console.log(JSON.stringify({ matching_rows: rows.length, active_unflagged: active }, null, 2));
      if (active.length) {
        console.error(`verify-usmca-no-active-test-vendors FAIL — ${active.length} active unflagged TEST/CODEX vendor(s); owner quarantine decision required, no data changed`);
        process.exitCode = 1;
      } else {
        console.log(`verify-usmca-no-active-test-vendors PASS — ${rows.length} matching vendor(s), 0 active unflagged`);
      }
    } finally {
      await client.end();
    }
  }
}
