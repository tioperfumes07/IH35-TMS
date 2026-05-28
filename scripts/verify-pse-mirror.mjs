#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0265_ps_mirror.sql");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/accounting/pse-mirror.routes.ts");
const SERVICE_FILE = path.join(ROOT, "apps/backend/src/accounting/pse-mirror.service.ts");

function fail(message) {
  console.error(`verify:pse-mirror — FAILED\n- ${message}`);
  process.exit(1);
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) fail(message);
}

if (!fs.existsSync(MIGRATION_FILE)) fail("missing migration db/migrations/0265_ps_mirror.sql");
if (!fs.existsSync(ROUTES_FILE)) fail("missing routes file apps/backend/src/accounting/pse-mirror.routes.ts");
if (!fs.existsSync(SERVICE_FILE)) fail("missing service file apps/backend/src/accounting/pse-mirror.service.ts");

const migration = fs.readFileSync(MIGRATION_FILE, "utf8");
const routes = fs.readFileSync(ROUTES_FILE, "utf8");
const service = fs.readFileSync(SERVICE_FILE, "utf8");

requirePattern(migration, /CREATE TABLE IF NOT EXISTS accounting\.ps_category/i, "migration must create accounting.ps_category");
requirePattern(migration, /CREATE TABLE IF NOT EXISTS accounting\.ps_item/i, "migration must create accounting.ps_item");
requirePattern(migration, /CREATE TABLE IF NOT EXISTS accounting\.coa_account/i, "migration must create accounting.coa_account");
requirePattern(service, /INSERT INTO accounting\.ps_category/i, "service must upsert ps categories");
requirePattern(service, /INSERT INTO accounting\.ps_item/i, "service must upsert ps items");
requirePattern(service, /INSERT INTO accounting\.coa_account/i, "service must upsert coa accounts");
requirePattern(routes, /\/api\/v1\/ps-categories/, "missing GET /api/v1/ps-categories endpoint");
requirePattern(routes, /\/api\/v1\/ps-items/, "missing GET /api/v1/ps-items endpoint");
requirePattern(routes, /\/api\/v1\/coa-accounts/, "missing GET /api/v1/coa-accounts endpoint");
requirePattern(routes, /\/api\/v1\/accounting\/pse-mirror\/sync-now/, "missing manual sync-now endpoint");

console.log("verify:pse-mirror — OK");
