#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0264_bill_unit_allocation.sql");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/accounting/bills.routes.ts");
const ENGINE_FILE = path.join(ROOT, "apps/backend/src/accounting/allocation.ts");

function fail(message) {
  console.error(`verify:allocation-integrity — FAILED\n- ${message}`);
  process.exit(1);
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) fail(message);
}

if (!fs.existsSync(MIGRATION_FILE)) fail("missing migration db/migrations/0264_bill_unit_allocation.sql");
if (!fs.existsSync(ROUTES_FILE)) fail("missing routes file apps/backend/src/accounting/bills.routes.ts");
if (!fs.existsSync(ENGINE_FILE)) fail("missing allocation engine apps/backend/src/accounting/allocation.ts");

const migration = fs.readFileSync(MIGRATION_FILE, "utf8");
const routes = fs.readFileSync(ROUTES_FILE, "utf8");
const engine = fs.readFileSync(ENGINE_FILE, "utf8");

requirePattern(migration, /CREATE TABLE IF NOT EXISTS accounting\.bill_unit_allocation/i, "migration must create bill_unit_allocation table");
requirePattern(migration, /allocation_method IN \('equal', 'by_value', 'by_miles', 'manual_pct'\)/i, "allocation method enum/check missing required methods");
requirePattern(migration, /UNIQUE\s*\(\s*bill_id\s*,\s*asset_id\s*\)/i, "migration must prevent duplicate asset entries per bill");
requirePattern(routes, /app\.post\("\/api\/v1\/accounting\/bills\/:id\/allocate"/, "allocation route missing");
requirePattern(routes, /app\.get\("\/api\/v1\/assets\/:id\/allocated-costs"/, "allocated-costs route missing");
requirePattern(routes, /DELETE FROM accounting\.bill_unit_allocation/i, "allocation route must replace prior allocation rows");
requirePattern(routes, /SUM\(a\.allocated_amount_cents\)/i, "allocated-costs route must aggregate allocated cents");
requirePattern(engine, /allocation_manual_pct_sum_invalid/, "engine must reject invalid manual percentage sums");
requirePattern(engine, /rows\[0\]\.allocated_amount_cents \+= totalCents - allocated/, "engine must perform penny reconciliation");

console.log("verify:allocation-integrity — OK");
