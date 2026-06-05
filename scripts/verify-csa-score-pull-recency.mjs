#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/compliance/csa.routes.ts");
const PULL_FILE = path.join(ROOT, "apps/backend/src/compliance/csa-basic-pull.ts");
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0381_csa_basic_scores.sql");

function fail(message) {
  console.error(`verify:csa-score-pull-recency FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`verify:csa-score-pull-recency PASS${message ? ` (${message})` : ""}`);
}

for (const target of [ROUTES_FILE, PULL_FILE, MIGRATION_FILE]) {
  if (!fs.existsSync(target)) {
    fail(`missing required file ${path.relative(ROOT, target)}`);
  }
}

const routesSource = fs.readFileSync(ROUTES_FILE, "utf8");
const pullSource = fs.readFileSync(PULL_FILE, "utf8");
const migrationSource = fs.readFileSync(MIGRATION_FILE, "utf8");

if (!routesSource.includes("pull_age_days")) fail("csa current endpoint must return pull_age_days");
if (!routesSource.includes("is_stale")) fail("csa current endpoint must return is_stale");
if (!routesSource.includes("pullAgeDays > 7")) fail("csa current endpoint must enforce stale threshold > 7 days");
if (!pullSource.includes("initializeCsaBasicPullCron")) fail("csa-basic-pull.ts must export initializeCsaBasicPullCron");
if (!pullSource.includes("compliance.csa_basic_pull_cron")) fail("csa-basic-pull.ts must register compliance.csa_basic_pull_cron");
if (!migrationSource.includes("compliance.csa_basic_scores")) fail("migration must create compliance.csa_basic_scores");

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  pass("static guard validated; DATABASE_URL not set, db recency check skipped");
  process.exit(0);
}

try {
  const pg = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const result = await client.query(`SELECT MAX(pulled_at) AS latest_pulled_at FROM compliance.csa_basic_scores`);
  await client.end();
  const latest = result.rows[0]?.latest_pulled_at;
  if (!latest) {
    pass("static guard validated; no CSA pulls recorded yet");
    process.exit(0);
  }
  const ageDays = Math.floor((Date.now() - Date.parse(String(latest))) / 86_400_000);
  if (!Number.isFinite(ageDays)) {
    fail("unable to parse latest pulled_at timestamp");
  }
  if (ageDays > 7) {
    fail(`latest CSA pull is stale (${ageDays} days old; threshold is 7)`);
  }
  pass(`latest pull age ${ageDays} days`);
} catch (error) {
  fail(`db recency query failed: ${(error).message ?? String(error)}`);
}
