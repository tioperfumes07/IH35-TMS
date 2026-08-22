#!/usr/bin/env node
/**
 * CUSTOMER-FULL-EDIT-SAVE-SILENT-NOOP guard — mdata.customers.shipping_country must stay nullable.
 *
 * ROOT CAUSE (pinned via live instrumented reproduction 2026-08-22): shipping_country was the ONLY
 * one of mdata.customers' 6 shipping_* address columns left `NOT NULL` (migration 202607110240,
 * before the "Shipping same as billing" feature existed). The Customer Full Edit form's
 * `profileValuesToUpdatePayload()` deliberately sends `shipping_country: null` whenever
 * `shipping_same_as_billing` is true (which defaults to true) — every such Save threw a raw
 * Postgres 23502 not-null-violation, surfaced as an uncaught 500. Migration 202612990000 drops the
 * constraint. This guard keeps it dropped: a static check that the migration exists with the right
 * statement (so CI catches the fix landing without a DB), plus a live-ACL check (so CI/prod catch a
 * FUTURE migration that silently re-adds the constraint, which the static half can't see).
 *
 * Self-test: node scripts/verify-customer-shipping-country-nullable.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-shipping-country-nullable";
const MIGRATION = "db/migrations/202612990000_customer_shipping_country_drop_not_null.sql";

export function checkMigrationText(src) {
  const failures = [];
  if (!/ALTER TABLE mdata\.customers ALTER COLUMN shipping_country DROP NOT NULL/.test(src)) {
    failures.push(`${MIGRATION}: must ALTER TABLE mdata.customers ALTER COLUMN shipping_country DROP NOT NULL`);
  }
  return failures;
}

function staticCheck() {
  const abs = path.join(ROOT, MIGRATION);
  if (!fs.existsSync(abs)) return [`${MIGRATION}: file missing`];
  return checkMigrationText(fs.readFileSync(abs, "utf8"));
}

// LIVE ACL check — the static half proves the fix landed in the repo; it cannot see a FUTURE
// migration that re-adds the constraint on live/prod schema. Mirrors
// verify-fuel-loves-prices-daily-table-and-report-guard.mjs exactly: skip cleanly with no DB
// (verify:static's dead-port sentinel), assert for real whenever one is reachable (verify:local-ci,
// and against prod when pointed at it).
async function checkLive() {
  const require = createRequire(import.meta.url);
  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = (await import("pg")).default;
  try {
    (await import("dotenv")).default.config();
  } catch {
    // dotenv optional — env may already be present.
  }

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} (live) CAPABILITY SKIP — no DATABASE_URL/DATABASE_DIRECT_URL. CI equivalent: verify:local-ci.`);
    return [];
  }

  const { Client } = pg;
  const client = new Client(buildPgClientConfig(connectionString, { connectionTimeoutMillis: 15000 }));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} (live) CAPABILITY SKIP — database unreachable (${error.code ?? error.message}). CI equivalent: verify:local-ci.`);
    return [];
  }

  try {
    const { rows } = await client.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'mdata' AND table_name = 'customers' AND column_name = 'shipping_country'`
    );
    const isNullable = rows[0]?.is_nullable;
    if (isNullable === undefined) {
      console.log(`${LABEL} (live) note — mdata.customers.shipping_country not present in this database, skipped.`);
      return [];
    }
    if (isNullable !== "YES") {
      return [`(live) mdata.customers.shipping_country is NOT NULL on the connected database — the CUSTOMER-FULL-EDIT-SAVE-SILENT-NOOP 23502 regression is back regardless of migration text.`];
    }
    console.log(`${LABEL} (live) OK — mdata.customers.shipping_country verified nullable on the connected database.`);
    return [];
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv.includes("--selftest")) {
  const bad = checkMigrationText(
    "ALTER TABLE mdata.customers ALTER COLUMN shipping_country SET DEFAULT 'US'; -- no DROP NOT NULL"
  );
  if (bad.length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — missing DROP NOT NULL statement was not caught`);
    process.exit(1);
  }
  const good = checkMigrationText(
    "ALTER TABLE mdata.customers ALTER COLUMN shipping_country DROP NOT NULL;"
  );
  if (good.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL — real DROP NOT NULL statement was wrongly rejected`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — missing-statement mutation caught, real statement accepted`);
  process.exit(0);
}

const staticFailures = staticCheck();
const liveFailures = await checkLive();
const failures = [...staticFailures, ...liveFailures];
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — migration present and (where reachable) live schema confirms shipping_country is nullable`);
