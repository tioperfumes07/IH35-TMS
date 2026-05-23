#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = process.cwd();
const TRANSP_COMPANY_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const INGEST_SCRIPT = path.join(ROOT, "scripts", "ingest-samsara-to-mdata-units.mjs");

function fail(message) {
  console.error(`verify:no-test-units-in-prod — FAILED\n- ${message}`);
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(INGEST_SCRIPT)) {
    fail("scripts/ingest-samsara-to-mdata-units.mjs not found");
  }
  const ingestScriptText = fs.readFileSync(INGEST_SCRIPT, "utf8");
  if (!ingestScriptText.includes("unit_number LIKE 'TEST-TRUCK-%'") || !ingestScriptText.includes("vin LIKE 'TESTTRUCKVIN%'")) {
    fail("ingestion script must keep strict TEST row delete predicate");
  }
  if (!ingestScriptText.includes("WHERE unit_number LIKE 'TEST-%'") || !ingestScriptText.includes("OR vin LIKE 'TEST%'")) {
    fail("ingestion script must keep post-check for any TEST-prefixed units");
  }

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    console.log(
      "verify:no-test-units-in-prod — OK (static checks passed; live DB check skipped, set ENABLE_LIVE_DB_UNIT_TEST_GUARD=true to enforce)"
    );
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [TRANSP_COMPANY_ID]);

    const res = await client.query(
      `
        SELECT id::text AS id, unit_number, vin
        FROM mdata.units
        WHERE unit_number LIKE 'TEST-%'
           OR vin LIKE 'TEST%'
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      `
    );

    if (res.rows.length > 0) {
      const ids = res.rows.map((row) => row.id).join(", ");
      fail(`test units present in mdata.units (row ids: ${ids})`);
    }
  } finally {
    await client.end();
  }

  console.log("verify:no-test-units-in-prod — OK");
}

main().catch((error) => fail(String(error?.message ?? error)));
