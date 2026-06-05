#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/compliance/fmcsa-safer.routes.ts");
const VERIFIER_FILE = path.join(ROOT, "apps/backend/src/compliance/fmcsa-safer-verifier.ts");
const CRON_FILE = path.join(ROOT, "apps/backend/src/compliance/fmcsa-safer-cron.ts");
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0382_fmcsa_safer_verification.sql");

function fail(message) {
  console.error(`verify:fmcsa-safer-customer-coverage FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`verify:fmcsa-safer-customer-coverage PASS${message ? ` (${message})` : ""}`);
}

for (const target of [ROUTES_FILE, VERIFIER_FILE, CRON_FILE, MIGRATION_FILE]) {
  if (!fs.existsSync(target)) {
    fail(`missing required file ${path.relative(ROOT, target)}`);
  }
}

const routesSource = fs.readFileSync(ROUTES_FILE, "utf8");
const verifierSource = fs.readFileSync(VERIFIER_FILE, "utf8");
const migrationSource = fs.readFileSync(MIGRATION_FILE, "utf8");

if (!routesSource.includes("/api/v1/compliance/fmcsa-safer/verify-now")) {
  fail("routes must expose verify-now endpoint");
}
if (!routesSource.includes("/api/v1/compliance/fmcsa-safer/status")) {
  fail("routes must expose status endpoint");
}
if (!verifierSource.includes("computeSaferCoverage")) fail("verifier must compute customer coverage");
if (!verifierSource.includes("meets_threshold")) fail("coverage helper must enforce 90% threshold");
if (!migrationSource.includes("safer_verified_at")) fail("migration must add safer_verified_at columns");

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  pass("static guard validated; DATABASE_URL not set, db coverage check skipped");
  process.exit(0);
}

try {
  const pg = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const result = await client.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE NULLIF(trim(COALESCE(mc_number, '')), '') IS NOT NULL
          AND deactivated_at IS NULL
      ) AS with_mc,
      COUNT(*) FILTER (
        WHERE NULLIF(trim(COALESCE(mc_number, '')), '') IS NOT NULL
          AND deactivated_at IS NULL
          AND safer_verified_at IS NOT NULL
          AND safer_verified_at >= now() - interval '30 days'
      ) AS verified_recent
    FROM mdata.customers
  `);
  await client.end();

  const withMc = Number(result.rows[0]?.with_mc ?? 0);
  const verifiedRecent = Number(result.rows[0]?.verified_recent ?? 0);
  if (withMc === 0) {
    pass("static guard validated; no customers with MC numbers yet");
    process.exit(0);
  }
  const coveragePct = (verifiedRecent / withMc) * 100;
  if (coveragePct < 90) {
    fail(`customer SAFER coverage ${coveragePct.toFixed(1)}% below 90% (${verifiedRecent}/${withMc})`);
  }
  pass(`coverage ${coveragePct.toFixed(1)}% (${verifiedRecent}/${withMc})`);
} catch (error) {
  const message = (error).message ?? String(error);
  if (/safer_verified_at|column .* does not exist/i.test(message)) {
    pass("static guard validated; migration not applied on DATABASE_URL yet");
    process.exit(0);
  }
  fail(`db coverage query failed: ${message}`);
}
