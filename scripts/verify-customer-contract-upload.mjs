#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const pass = (msg) => console.log(`[verify-customer-contract-upload] PASS: ${msg}`);
const fail = (msg) => { console.error(`[verify-customer-contract-upload] FAIL: ${msg}`); process.exit(1); };

// ── helpers ──────────────────────────────────────────────────────────────────
function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}
function check(rel, pattern, label) {
  const src = read(rel);
  if (!src) fail(`file missing: ${rel}`);
  if (!(pattern instanceof RegExp ? pattern.test(src) : src.includes(pattern)))
    fail(`${label} — not found in ${rel}`);
  pass(label);
}

// ── 1. migration ─────────────────────────────────────────────────────────────
const MIGRATION = "db/migrations/202606120300_c3_customer_contract.sql";
const migSrc = read(MIGRATION);
if (!migSrc) fail(`migration file missing: ${MIGRATION}`);
pass("migration file exists");

if (!migSrc.includes("CREATE TABLE IF NOT EXISTS customer.contract")) fail("customer.contract table missing");
pass("customer.contract table defined");

if (!migSrc.includes("customer_contract")) fail("file_categories seed for customer_contract missing");
pass("file_categories seed: customer_contract");

if (!migSrc.includes("ENABLE ROW LEVEL SECURITY")) fail("RLS not enabled on customer.contract");
pass("RLS enabled");

if (!migSrc.includes("NULLIF")) fail("NULLIF RLS pattern missing");
pass("NULLIF RLS pattern present");

if (!migSrc.includes("supersedes_id")) fail("supersedes_id column missing — append-only chain required");
pass("supersedes_id column present");

if (!migSrc.includes("identity.users")) fail("uploaded_by_user_id references identity.users");
pass("identity.users FK reference correct");

if (!migSrc.includes("customer.set_updated_at")) fail("customer.set_updated_at() trigger function missing");
pass("updated_at trigger function defined");

// ── 2. backend routes ────────────────────────────────────────────────────────
const ROUTES = "apps/backend/src/customer-contracts/customer-contract.routes.ts";
check(ROUTES, "/api/v1/customer-contracts", "POST create endpoint");
check(ROUTES, "app.get(\"/api/v1/customer-contracts\"", "GET list endpoint");
check(ROUTES, "app.get(\"/api/v1/customer-contracts/:id\"", "GET single endpoint");
check(ROUTES, "/api/v1/customer-contracts/:id/supersede", "POST supersede endpoint");
check(ROUTES, "appendCrudAudit", "spine emit in routes");
check(ROUTES, "customer.contract.uploaded", "spine event type: uploaded");
check(ROUTES, "customer.contract.superseded", "spine event type: superseded");

// ── 3. backend registered ────────────────────────────────────────────────────
check(
  "apps/backend/src/index.ts",
  "registerCustomerContractRoutes",
  "routes registered in index.ts"
);

// ── 4. frontend API ───────────────────────────────────────────────────────────
check(
  "apps/frontend/src/api/customer-contracts.ts",
  "listCustomerContracts",
  "listCustomerContracts API helper"
);
check(
  "apps/frontend/src/api/customer-contracts.ts",
  "createCustomerContract",
  "createCustomerContract API helper"
);
check(
  "apps/frontend/src/api/customer-contracts.ts",
  "supersedeCustomerContract",
  "supersedeCustomerContract API helper"
);

// ── 5. frontend component ─────────────────────────────────────────────────────
const COMP = "apps/frontend/src/components/customers/CustomerContractsTab.tsx";
check(COMP, "CustomerContractsTab", "CustomerContractsTab component defined");
check(COMP, "Supersede", "supersede action present in UI");
check(COMP, "UploadModal", "UploadModal used for file upload");
check(COMP, "contract_type", "contract_type field present");

// ── 6. wired in CustomerDetail.tsx ───────────────────────────────────────────
check(
  "apps/frontend/src/pages/CustomerDetail.tsx",
  "CustomerContractsTab",
  "CustomerContractsTab wired in CustomerDetail"
);

// ── 7. reuse-of-existing-storage check ───────────────────────────────────────
const routesSrc = read(ROUTES);
if (!routesSrc.includes("docs.files")) fail("routes must reuse existing docs.files storage, not invent new storage");
pass("existing docs.files storage reused");

// ── 8. no financial fields ────────────────────────────────────────────────────
if (migSrc.includes("amount_cents") || migSrc.includes("payment") || migSrc.includes("invoice")) {
  fail("migration must not contain financial write fields (amount_cents / payment / invoice)");
}
pass("no financial write fields in migration");

console.log("\n[verify-customer-contract-upload] ALL CHECKS PASSED");
