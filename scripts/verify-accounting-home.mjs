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
  { pattern: /uncleared_cents/, label: "363-CUR-A uncleared cents on home aging" },
  { pattern: /cleared_open_cents/, label: "363-CUR-A cleared open cents on home aging" },
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

function leftoverRefuse(src, bucket) {
  if (src.includes("text-[11px]")) bucket.push("apps/frontend/src/pages/home/roles/AccountingHome.tsx: leftover text-[11px]");
  if (src.includes("#8A92AB") || src.includes("#334155")) {
    bucket.push("apps/frontend/src/pages/home/roles/AccountingHome.tsx: leftover off-scale muted");
  }
  if (src.includes("text-slate-") || src.includes("border-slate-") || src.includes("bg-slate-") || src.includes("divide-slate-")) {
    bucket.push("apps/frontend/src/pages/home/roles/AccountingHome.tsx: leftover slate class");
  }
}

function selftest() {
  const good = read("apps/frontend/src/pages/home/roles/AccountingHome.tsx");
  const leftoverGood = [];
  leftoverRefuse(good, leftoverGood);
  if (leftoverGood.length) {
    console.error("verify:accounting-home SELFTEST FAIL — live leftover tokens present");
    for (const e of leftoverGood) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  const leftoverPlant = `${good}\n<div className="text-[11px] text-slate-600 border-slate-300 bg-slate-50 divide-slate-100 text-[#8A92AB]" style={{ color: "#334155" }}>plant</div>`;
  const leftoverBad = [];
  leftoverRefuse(leftoverPlant, leftoverBad);
  if (
    !leftoverBad.some((e) => e.includes("leftover text-[11px]")) ||
    !leftoverBad.some((e) => e.includes("leftover off-scale muted")) ||
    !leftoverBad.some((e) => e.includes("leftover slate class"))
  ) {
    console.error("verify:accounting-home SELFTEST FAIL leftover plant escaped", leftoverBad);
    process.exit(1);
  }
  console.log("verify:accounting-home SELFTEST PASS — leftover plant rejected");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const accountingHome = read("apps/frontend/src/pages/home/roles/AccountingHome.tsx");
leftoverRefuse(accountingHome, failures);
contains("apps/frontend/src/pages/home/roles/AccountingHome.tsx", accountingHome, [
  { pattern: /AccountingKpiBar/, label: "KPI bar mounted" },
  { pattern: /AccountingPendingApprovalsPanel/, label: "pending approvals panel mounted" },
  { pattern: /fetchAccountingRoleHome/, label: "role-home API fetch" },
  { pattern: /Accounts Receivable Aging/, label: "AR aging buckets" },
  { pattern: /Accounts Payable Aging/, label: "AP aging buckets" },
  { pattern: /UnclearedDocumentsNote/, label: "363-CUR-A uncleared documents named" },
  { pattern: /bg-\[#F7F8FA\]/, label: "363-CUR-A uncleared notice uses house page fill not amber" },
  { pattern: /not cleared/, label: "363-CUR-A not-cleared copy" },
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
  { pattern: /uncleared_cents/, label: "363-CUR-A uncleared cents on FE home type" },
  { pattern: /cleared_open_cents/, label: "363-CUR-A cleared open cents on FE home type" },
]);

const kpiBar = read("apps/frontend/src/components/home/AccountingKpiBar.tsx");
contains("apps/frontend/src/components/home/AccountingKpiBar.tsx", kpiBar, [
  { pattern: /cleared_open_cents/, label: "KPI bar declares cleared" },
  { pattern: /Cleared/, label: "KPI bar Cleared hint" },
]);

const qboHome = read("apps/frontend/src/pages/home/QboStyleHomePage.tsx");
contains("apps/frontend/src/pages/home/QboStyleHomePage.tsx", qboHome, [
  { pattern: /UnclearedDocumentsNote/, label: "QBO home names uncleared documents" },
  { pattern: /bg-slate-100/, label: "QBO home uncleared notice uses slate not amber" },
  { pattern: /not cleared/, label: "QBO home not-cleared copy" },
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
