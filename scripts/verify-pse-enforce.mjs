#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0266_acct11_pse_enforce.sql");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/accounting/pse-mirror.routes.ts");
const SERVICE_FILE = path.join(ROOT, "apps/backend/src/accounting/pse-mirror.service.ts");
const MIDDLEWARE_FILE = path.join(ROOT, "apps/backend/src/accounting/pse-enforce.middleware.ts");
const POSTING_ROUTES_FILE = path.join(ROOT, "apps/backend/src/accounting/posting-engine.routes.ts");

function fail(message) {
  console.error(`verify:pse-enforce — FAILED\n- ${message}`);
  process.exit(1);
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) fail(message);
}

for (const file of [MIGRATION_FILE, ROUTES_FILE, SERVICE_FILE, MIDDLEWARE_FILE, POSTING_ROUTES_FILE]) {
  if (!fs.existsSync(file)) fail(`missing required file ${path.relative(ROOT, file)}`);
}

const migration = fs.readFileSync(MIGRATION_FILE, "utf8");
const routes = fs.readFileSync(ROUTES_FILE, "utf8");
const service = fs.readFileSync(SERVICE_FILE, "utf8");
const middleware = fs.readFileSync(MIDDLEWARE_FILE, "utf8");
const postingRoutes = fs.readFileSync(POSTING_ROUTES_FILE, "utf8");

requirePattern(migration, /CREATE TABLE IF NOT EXISTS accounting\.vendor_subtype_pse_map/i, "migration must create vendor_subtype_pse_map");
requirePattern(migration, /CREATE TABLE IF NOT EXISTS accounting\.pse_posting_policy/i, "migration must create pse_posting_policy");
requirePattern(migration, /ps_category_qbo_id/i, "migration must add ps_category_qbo_id columns");
requirePattern(migration, /ps_item_qbo_id/i, "migration must add ps_item_qbo_id columns");

requirePattern(routes, /\/api\/v1\/accounting\/pse-mirror\/enforce/, "missing pse enforce endpoint");
requirePattern(routes, /\/api\/v1\/accounting\/pse-mirror\/suggestions\/vendor-subtype/, "missing vendor subtype suggestion endpoint");
requirePattern(routes, /enforcePsePostingSelection\(/, "routes must call enforcePsePostingSelection");
requirePattern(routes, /suggestPseSelectionByVendorSubtype\(/, "routes must call suggestPseSelectionByVendorSubtype");
requirePattern(routes, /pse_item_category_mismatch/, "routes must map category/item mismatch error");

requirePattern(service, /export async function enforcePseSelection/, "service must export enforcePseSelection");
requirePattern(service, /export async function suggestPseSelectionByVendorSubtype/, "service must export suggestPseSelectionByVendorSubtype");
requirePattern(service, /FROM accounting\.ps_category/, "service must read accounting.ps_category");
requirePattern(service, /FROM accounting\.ps_item/, "service must read accounting.ps_item");
requirePattern(service, /FROM accounting\.coa_account/, "service must validate coa account");
requirePattern(service, /vendor_subtype_pse_map/, "service must use vendor subtype map");

requirePattern(middleware, /export async function enforcePsePostingOnBillPost/, "middleware must export bill posting guard");
requirePattern(middleware, /assertBillPsePostingEnforced/, "middleware must call assertBillPsePostingEnforced");

requirePattern(postingRoutes, /enforcePsePostingOnBillPost/, "posting routes must wire PSE posting middleware");

console.log("verify:pse-enforce — OK");
