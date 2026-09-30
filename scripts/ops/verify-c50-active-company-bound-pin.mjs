#!/usr/bin/env node
/**
 * C-50 — customers/vendors With-transactions must not silent-empty via GUC pin.
 * Asserts: bound-param active_company_only pin, /counts routes, FE uses get*RosterCounts.
 * Self-test: node scripts/ops/verify-c50-active-company-bound-pin.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(sources) {
  const f = [];
  for (const [label, src] of [
    ["customers.routes", sources.customersRoutes],
    ["vendors.routes", sources.vendorsRoutes],
  ]) {
    if (!/if\s*\(\s*active_company_only\s*\)\s*\{[\s\S]*?companyScopeIdx/.test(src)) {
      f.push(`${label}: active_company_only must pin via companyScopeIdx bound param`);
    }
    if (/if\s*\(\s*active_company_only\s*\)\s*\{[^}]*current_setting\(\s*['"]app\.operating_company_id['"]/s.test(src)) {
      f.push(`${label}: forbidden GUC-only pin inside active_company_only`);
    }
    if (!/\/api\/v1\/mdata\/(?:customers|vendors)\/counts/.test(src)) {
      f.push(`${label}: missing mdata /counts route`);
    }
  }
  if (!/getCustomerRosterCounts/.test(sources.customersPage)) f.push("Customers.tsx must call getCustomerRosterCounts");
  if (!/getVendorRosterCounts/.test(sources.vendorsPage)) f.push("Vendors.tsx must call getVendorRosterCounts");
  if (!/export function getCustomerRosterCounts/.test(sources.mdataApi)) f.push("mdata.ts missing getCustomerRosterCounts");
  if (!/export function getVendorRosterCounts/.test(sources.mdataApi)) f.push("mdata.ts missing getVendorRosterCounts");
  return f;
}

const sources = {
  customersRoutes: read("apps/backend/src/mdata/customers.routes.ts"),
  vendorsRoutes: read("apps/backend/src/mdata/vendors.routes.ts"),
  customersPage: read("apps/frontend/src/pages/Customers.tsx"),
  vendorsPage: read("apps/frontend/src/pages/Vendors.tsx"),
  mdataApi: read("apps/frontend/src/api/mdata.ts"),
};

if (process.argv.includes("--selftest")) {
  const good = {
    customersRoutes: `if (active_company_only) { filters.push(\`operating_company_id = $\${companyScopeIdx}::uuid\`); }\napp.get("/api/v1/mdata/customers/counts"`,
    vendorsRoutes: `if (active_company_only) { filters.push(\`operating_company_id = $\${companyScopeIdx}::uuid\`); }\napp.get("/api/v1/mdata/vendors/counts"`,
    customersPage: "getCustomerRosterCounts(companyId)",
    vendorsPage: "getVendorRosterCounts(companyId)",
    mdataApi: "export function getCustomerRosterCounts\nexport function getVendorRosterCounts",
  };
  const bad = { ...good, customersRoutes: `if (active_company_only) { filters.push(\`operating_company_id = current_setting('app.operating_company_id', true)::uuid\`); }` };
  const checks = [
    ["good passes", check(good).length === 0],
    ["GUC pin fails", check(bad).some((m) => /forbidden GUC/.test(m))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-c50 --selftest FAIL");
    for (const [n] of failed) console.error("  ✗", n);
    process.exit(1);
  }
  console.log(`verify-c50-active-company-bound-pin --selftest PASS (${checks.length})`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error("verify-c50-active-company-bound-pin FAILED");
  for (const x of failures) console.error("  ✗", x);
  process.exit(1);
}
console.log("verify-c50-active-company-bound-pin OK (bound pin + counts + FE wired)");
