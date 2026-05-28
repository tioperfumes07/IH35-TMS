#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/banking/categorization.routes.ts");
const SERVICE_FILE = path.join(ROOT, "apps/backend/src/banking/bulk-transactions.ts");

function fail(message) {
  console.error(`verify:bank-bulk — FAILED\n- ${message}`);
  process.exit(1);
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) fail(message);
}

if (!fs.existsSync(ROUTES_FILE)) fail("missing categorization routes");
if (!fs.existsSync(SERVICE_FILE)) fail("missing bulk-transactions service");

const routes = fs.readFileSync(ROUTES_FILE, "utf8");
const service = fs.readFileSync(SERVICE_FILE, "utf8");

requirePattern(routes, /\/api\/v1\/banking\/transactions\/bulk-categorize/, "missing bulk-categorize route");
requirePattern(routes, /\/api\/v1\/banking\/transactions\/bulk-post-as-bills/, "missing bulk-post-as-bills route");
requirePattern(routes, /operating_company_id/, "bulk routes must require operating_company_id scope");
requirePattern(service, /BULK_TXN_MAX\s*=\s*500/, "bulk service must cap at 500 transactions");
requirePattern(service, /bulk_txn_cross_tenant_or_missing/, "bulk service must reject cross-tenant ids");
requirePattern(service, /await client\.query\("BEGIN"\)/, "bulk service must use transactional BEGIN");
requirePattern(service, /await client\.query\("ROLLBACK"\)/, "bulk service must rollback on failure");

console.log("verify:bank-bulk — OK");
