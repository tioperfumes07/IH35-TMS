#!/usr/bin/env node
/**
 * GAP-67 CI guard — Accounting Home role view (read-only display).
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const service = read("apps/backend/src/accounting/role-home/accounting-home.service.ts");
contains("apps/backend/src/accounting/role-home/accounting-home.service.ts", service, [
  { pattern: /export async function getAccountingHomeData/, label: "getAccountingHomeData export" },
  { pattern: /getArAgingReport/, label: "delegates to AR aging read service" },
  { pattern: /getApAgingReport/, label: "delegates to AP aging read service" },
  { pattern: /withCompanyScope/, label: "RLS company scope" },
]);

const routes = read("apps/backend/src/accounting/role-home/routes.ts");
contains("apps/backend/src/accounting/role-home/routes.ts", routes, [
  { pattern: /\/api\/v1\/accounting\/role-home/, label: "role-home route" },
  { pattern: /registerAccountingRoleHomeRoutes/, label: "routes register export" },
  { pattern: /Accountant/, label: "Accountant RBAC" },
  { pattern: /forbidden/, label: "forbidden response" },
]);

read("apps/backend/src/accounting/role-home/__tests__/accounting-home.test.ts");

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerAccountingRoleHomeRoutes/, label: "index registers accounting role-home routes" },
]);

const accountingHome = read("apps/frontend/src/pages/home/roles/AccountingHome.tsx");
contains("apps/frontend/src/pages/home/roles/AccountingHome.tsx", accountingHome, [
  { pattern: /AccountingKpiBar/, label: "KPI bar mounted" },
  { pattern: /AccountingPendingApprovalsPanel/, label: "pending approvals panel mounted" },
  { pattern: /fetchAccountingRoleHome/, label: "role-home API fetch" },
  { pattern: /Accounts Receivable Aging/, label: "AR aging buckets" },
  { pattern: /Accounts Payable Aging/, label: "AP aging buckets" },
]);

read("apps/frontend/src/components/home/AccountingKpiBar.tsx");
read("apps/frontend/src/components/home/AccountingPendingApprovalsPanel.tsx");

const homePage = read("apps/frontend/src/pages/home/HomePage.tsx");
contains("apps/frontend/src/pages/home/HomePage.tsx", homePage, [
  { pattern: /case "Accountant"/, label: "Accountant role branch" },
  { pattern: /AccountingHome/, label: "AccountingHome wired" },
]);

const api = read("apps/frontend/src/api/accountingHome.ts");
contains("apps/frontend/src/api/accountingHome.ts", api, [
  { pattern: /\/api\/v1\/accounting\/role-home/, label: "frontend API path" },
]);

const docs = read("docs/specs/gap-67-accounting-home-view.md");
contains("docs/specs/gap-67-accounting-home-view.md", docs, [
  { pattern: /GAP-67/, label: "GAP-67 identifier" },
  { pattern: /read-only/i, label: "read-only documented" },
]);

const manifest = read(".block-ready/GAP-67-ACCOUNTING-HOME.json");
contains(".block-ready/GAP-67-ACCOUNTING-HOME.json", manifest, [
  { pattern: /GAP-67-ACCOUNTING-HOME/, label: "GAP-67 block id in manifest" },
]);

if (failures.length > 0) {
  console.error("verify:accounting-home — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:accounting-home — OK");
