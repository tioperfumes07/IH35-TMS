#!/usr/bin/env node
/**
 * verify-fuel-loves-prices-daily-table-and-report-guard.mjs
 *
 * LV-REPORTS-FUEL-PRICE-VARIANCE-PHANTOM-BENCHMARK-TABLE — /reports/run/fuel-price-variance
 * unconditionally queried fuel.loves_prices_daily, but no migration ever created that table
 * (prod to_regclass('fuel.loves_prices_daily') was NULL). Two writers (loves-upload.routes.ts,
 * loves-card-import.ts) already defensively guarded with to_regclass and degraded to an honest
 * "unavailable" response; only the report route and the table itself were missing.
 *
 * Fixed by migration 202612760000_fuel_loves_prices_daily.sql (column-for-column verified
 * against both live writers before being written; rehearsed on a disposable Neon branch —
 * table create, RLS company-isolation (as ih35_app), unique-key upsert collision, DELETE denial,
 * and the report's own benchmark CTE all independently proven there before this guard shipped).
 *
 * Guards:
 *  1. The migration creates fuel.loves_prices_daily with every column both writers reference,
 *     FORCE ROW LEVEL SECURITY, and an explicit REVOKE DELETE (not just an omission from GRANT —
 *     GRANT is additive-only and cannot prove absence of a schema-default-granted privilege; see
 *     scripts/verify-safety-evidence-no-delete-grant.mjs for the exact prior mistake this mirrors).
 *  2. When a database is reachable (verify:local-ci / prod), the LIVE ACL is asserted directly from
 *     information_schema.role_table_grants — text-only checks would have missed the safety-schema
 *     incident this guard is modeled on, where "GRANT SELECT, INSERT, UPDATE" shipped DELETE-able on
 *     prod because a throwaway local DB's default privileges didn't match prod's.
 *  3. The report route no longer queries the table unconditionally — it must check
 *     to_regclass('fuel.loves_prices_daily') first and return the same named
 *     loves_prices_daily_unavailable contract the writers already use, instead of an opaque 500,
 *     for the window before this migration is deployed.
 */
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";

const failures = [];

const migrationsDir = "db/migrations";
const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
const tableMigrations = migrationFiles.filter((f) => {
  const src = readFileSync(`${migrationsDir}/${f}`, "utf8");
  return /CREATE TABLE IF NOT EXISTS fuel\.loves_prices_daily/.test(src);
});

if (tableMigrations.length === 0) {
  failures.push("no migration creates fuel.loves_prices_daily — re-check this guard");
} else {
  const latest = tableMigrations.sort().at(-1);
  const src = readFileSync(`${migrationsDir}/${latest}`, "utf8");

  // Scope the column check to the actual CREATE TABLE column-list block, not the whole file —
  // the header comment prose also names every column, so a whole-file regex would silently pass
  // even if a column were dropped from the real DDL as long as the comment still mentioned it.
  const createTableMatch = src.match(/CREATE TABLE IF NOT EXISTS fuel\.loves_prices_daily\s*\(([\s\S]*?)\n\);/);
  const columnBlock = createTableMatch ? createTableMatch[1] : "";
  if (!createTableMatch) {
    failures.push(`${latest}: could not isolate the CREATE TABLE fuel.loves_prices_daily (...) column-list block — re-check this guard`);
  }

  const REQUIRED_COLUMNS = [
    "operating_company_id",
    "effective_date",
    "station_uuid",
    "station_name",
    "station_address",
    "city",
    "state",
    "price_per_gallon",
    "source_file_name",
    "uploaded_by_user_id",
    "updated_at",
  ];
  for (const col of REQUIRED_COLUMNS) {
    if (!new RegExp(`\\b${col}\\b`).test(columnBlock)) {
      failures.push(`${latest}: fuel.loves_prices_daily is missing column "${col}" (referenced by loves-upload.routes.ts / loves-card-import.ts)`);
    }
  }

  if (!/ALTER TABLE fuel\.loves_prices_daily FORCE ROW LEVEL SECURITY/.test(src)) {
    failures.push(`${latest}: fuel.loves_prices_daily is not FORCE ROW LEVEL SECURITY`);
  }
  if (!/CREATE POLICY[\s\S]{0,200}?ON fuel\.loves_prices_daily/.test(src)) {
    failures.push(`${latest}: fuel.loves_prices_daily has no RLS policy`);
  }
  if (!/CREATE UNIQUE INDEX[\s\S]{0,120}?ON fuel\.loves_prices_daily\s*\(\s*operating_company_id,\s*effective_date,\s*station_name,\s*station_address\s*\)/.test(src)) {
    failures.push(`${latest}: fuel.loves_prices_daily is missing the unique index matching both writers' upsert key (operating_company_id, effective_date, station_name, station_address)`);
  }
  const grantMatch = src.match(/GRANT\s+([A-Z, ]+)\s+ON fuel\.loves_prices_daily TO ih35_app/);
  if (!grantMatch) {
    failures.push(`${latest}: no runtime GRANT to ih35_app found for fuel.loves_prices_daily`);
  } else if (/\bDELETE\b/.test(grantMatch[1]) || /\bALL\b/.test(grantMatch[1])) {
    failures.push(`${latest}: GRANT to ih35_app must not include DELETE or ALL/ALL PRIVILEGES on fuel.loves_prices_daily (void-not-delete floor, matches sibling fuel.fuel_transactions)`);
  }
  // GRANT is additive-only — it cannot prove DELETE is absent if a schema default privilege already
  // granted it (the exact safety-schema incident this guard is modeled on). Require the explicit
  // REVOKE as textual evidence too, on top of the live-ACL check below.
  if (!/REVOKE DELETE ON fuel\.loves_prices_daily FROM ih35_app/.test(src)) {
    failures.push(`${latest}: missing explicit "REVOKE DELETE ON fuel.loves_prices_daily FROM ih35_app" — omitting DELETE from GRANT does not prove ih35_app lacks it if a schema default privilege already granted it`);
  }
}

const reportRoutePath = "apps/backend/src/reports/fuel-price-variance.routes.ts";
const reportSrc = readFileSync(reportRoutePath, "utf8");
if (!/to_regclass\('fuel\.loves_prices_daily'\)/.test(reportSrc)) {
  failures.push(`${reportRoutePath}: no longer guards with to_regclass('fuel.loves_prices_daily') before querying — will 500 (not the honest unavailable contract) if the table is ever absent again`);
}
if (!/loves_prices_daily_unavailable/.test(reportSrc)) {
  failures.push(`${reportRoutePath}: no longer returns the named "loves_prices_daily_unavailable" error contract (same contract both writers already use)`);
}
if (!/reply\.code\(501\)/.test(reportSrc)) {
  failures.push(`${reportRoutePath}: unavailable branch no longer replies 501`);
}

if (failures.length > 0) {
  console.error("verify-fuel-loves-prices-daily-table-and-report-guard: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

// LIVE ACL check — text assertions above cannot see a schema-default-granted privilege the migration
// text never mentions. Mirrors scripts/verify-safety-evidence-no-delete-grant.mjs exactly: skip
// cleanly with no DB (verify:static's dead-port sentinel), assert for real whenever one is reachable
// (verify:local-ci, and against prod when pointed at it).
async function checkLiveAcl() {
  const LABEL = "verify-fuel-loves-prices-daily-table-and-report-guard";
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
    console.log(`${LABEL} (live-ACL) CAPABILITY SKIP — no DATABASE_URL/DATABASE_DIRECT_URL. CI equivalent: verify:local-ci.`);
    return;
  }

  const { Client } = pg;
  const client = new Client(buildPgClientConfig(connectionString, { connectionTimeoutMillis: 15000 }));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} (live-ACL) CAPABILITY SKIP — database unreachable (${error.code ?? error.message}). CI equivalent: verify:local-ci.`);
    return;
  }

  try {
    const { rows } = await client.query(
      `SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) AS grants
         FROM information_schema.role_table_grants
        WHERE table_schema = 'fuel' AND table_name = 'loves_prices_daily' AND grantee = 'ih35_app'`
    );
    const grants = rows[0]?.grants;
    if (grants === null || grants === undefined) {
      console.log(`${LABEL} (live-ACL) note — fuel.loves_prices_daily not present in this database, skipped.`);
      return;
    }
    if (grants.split(",").includes("DELETE")) {
      console.error(`${LABEL} FAILED (live-ACL) — fuel.loves_prices_daily: ih35_app holds DELETE on the LIVE ACL (grants: ${grants}), regardless of migration text.`);
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL} (live-ACL) OK — fuel.loves_prices_daily verified against the LIVE ACL: no DELETE for ih35_app (grants: ${grants}).`);
  } finally {
    await client.end().catch(() => {});
  }
}

await checkLiveAcl();
if (process.exitCode === 1) process.exit(1);

console.log(
  "verify-fuel-loves-prices-daily-table-and-report-guard: OK — table creation matches both live writers' column/upsert-key shape, FORCE RLS, explicit no-DELETE (static + live ACL where reachable); report route degrades honestly instead of 500"
);
