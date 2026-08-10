#!/usr/bin/env node
/**
 * RPT-S03 — Settlement Summary report must be entity-scoped (SettlementSummaryPage · VSETTLE).
 *
 * FE: company context → operating_company_id on API call; query gated on companyId.
 * BE: companyQuerySchema + withCompanyScope + SQL WHERE operating_company_id = $1.
 * Route: /reports/settlement-summary mounted to SettlementSummaryPage.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const PAGE = "apps/frontend/src/pages/reports/SettlementSummaryPage.tsx";
const API = "apps/frontend/src/api/reports.ts";
const ROUTES = "apps/backend/src/reports/settlement-summary.routes.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function run() {
  const failures = [];
  for (const f of [PAGE, API, ROUTES, MANIFEST]) {
    if (!exists(f)) failures.push(`MISSING: ${f}`);
  }
  if (failures.length) return failures;

  const page = read(PAGE);
  const api = read(API);
  const routes = read(ROUTES);
  const manifest = read(MANIFEST);

  // FE page — company context + scoped fetch
  if (!/useCompanyContext/.test(page)) {
    failures.push(`${PAGE}: must read company via useCompanyContext`);
  }
  if (!/selectedCompanyId/.test(page)) {
    failures.push(`${PAGE}: must use selectedCompanyId as operating company`);
  }
  if (!/getSettlementSummary\s*\(/.test(page)) {
    failures.push(`${PAGE}: must call getSettlementSummary`);
  }
  if (!/operating_company_id:\s*companyId/.test(page)) {
    failures.push(`${PAGE}: must pass operating_company_id: companyId into getSettlementSummary`);
  }
  if (!/enabled:\s*Boolean\(companyId\)/.test(page)) {
    failures.push(`${PAGE}: query must be enabled only when companyId is set`);
  }
  if (!/Select an operating company/.test(page)) {
    failures.push(`${PAGE}: must prompt when no operating company is selected`);
  }

  // FE API client — withCompany on settlement-summary path
  if (!/export async function getSettlementSummary/.test(api)) {
    failures.push(`${API}: must export getSettlementSummary`);
  }
  if (!/withCompany\(\s*`?\/api\/v1\/reports\/settlement-summary/.test(api) &&
      !/withCompany\(\s*`\/api\/v1\/reports\/settlement-summary\?/.test(api) &&
      !/withCompany\(`\/api\/v1\/reports\/settlement-summary\?\$\{q\.toString\(\)\}`,\s*params\.operating_company_id\)/.test(api)) {
    failures.push(`${API}: getSettlementSummary must call withCompany(/api/v1/reports/settlement-summary, operating_company_id)`);
  }

  // BE — schema + scope + SQL predicate
  if (!/companyQuerySchema/.test(routes)) {
    failures.push(`${ROUTES}: must use companyQuerySchema (requires operating_company_id)`);
  }
  if (!/withCompanyScope\s*\(/.test(routes)) {
    failures.push(`${ROUTES}: must run queries inside withCompanyScope`);
  }
  if (!/WHERE\s+s\.operating_company_id\s*=\s*\$1/.test(routes)) {
    failures.push(`${ROUTES}: settlements query must filter s.operating_company_id = $1`);
  }
  if (!/d\.operating_company_id\s*=\s*\$1/.test(routes)) {
    failures.push(`${ROUTES}: drivers join must filter d.operating_company_id = $1`);
  }
  if (!/FROM\s+driver_finance\.driver_settlements/.test(routes)) {
    failures.push(`${ROUTES}: must read canonical driver_finance.driver_settlements`);
  }
  if (!/registerSettlementSummaryRoutes/.test(routes)) {
    failures.push(`${ROUTES}: must export registerSettlementSummaryRoutes`);
  }
  if (!/\/api\/v1\/reports\/settlement-summary/.test(routes)) {
    failures.push(`${ROUTES}: must mount GET /api/v1/reports/settlement-summary`);
  }

  // FE route mount
  if (!/path=["']\/reports\/settlement-summary["']/.test(manifest)) {
    failures.push(`${MANIFEST}: must mount /reports/settlement-summary`);
  }
  if (!/SettlementSummaryPage/.test(manifest)) {
    failures.push(`${MANIFEST}: must render SettlementSummaryPage on the settlement-summary route`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realPath = path.join(ROOT, PAGE);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      fs.writeFileSync(realPath, backup.replace(/useCompanyContext/g, "useBrokenCompany"), "utf8");
      const planted = run();
      if (planted.length === 0) {
        console.error("[verify-rpt-s03-settlement-summary] SELFTEST FAIL: planted company-context break did not fail");
        process.exit(1);
      }
      console.log(`[verify-rpt-s03-settlement-summary] SELFTEST PASS (${planted.length} planted failures detected)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const failures = run();
  if (failures.length > 0) {
    console.error("\n[verify-rpt-s03-settlement-summary] FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }
  console.log("[verify-rpt-s03-settlement-summary] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
