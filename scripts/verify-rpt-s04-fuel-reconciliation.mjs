#!/usr/bin/env node
/**
 * RPT-S04 — Fuel Reconciliation report must tie to fuel.fuel_transactions (FuelReconciliationPage · VFUEL).
 *
 * FE: company context → operating_company_id; query gated on companyId; getFuelReconciliation.
 * BE: companyQuerySchema + withCompanyScope + SQL FROM fuel.fuel_transactions (not bank heuristics).
 * Route: /reports/fuel-reconciliation → FuelReconciliationPage.
 *
 * NO verify-steps/NNNN / CLAIMED edit — standalone guard (reports module scoreboard).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const PAGE = "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx";
const API = "apps/frontend/src/api/reports.ts";
const ROUTES = "apps/backend/src/reports/fuel-reconciliation.routes.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const LABEL = "verify-rpt-s04-fuel-reconciliation";

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
  if (!/getFuelReconciliation\s*\(/.test(page)) {
    failures.push(`${PAGE}: must call getFuelReconciliation`);
  }
  if (!/operating_company_id:\s*companyId/.test(page)) {
    failures.push(`${PAGE}: must pass operating_company_id: companyId into getFuelReconciliation`);
  }
  if (!/enabled:\s*Boolean\(companyId\)/.test(page)) {
    failures.push(`${PAGE}: query must be enabled only when companyId is set`);
  }
  if (!/Select an operating company/.test(page)) {
    failures.push(`${PAGE}: must prompt when no operating company is selected`);
  }

  // FE API client
  if (!/export async function getFuelReconciliation/.test(api)) {
    failures.push(`${API}: must export getFuelReconciliation`);
  }
  if (!/withCompany\(\s*`\/api\/v1\/reports\/fuel-reconciliation\?\$\{q\.toString\(\)\}`\s*,\s*params\.operating_company_id\)/.test(api)) {
    failures.push(`${API}: getFuelReconciliation must call withCompany(/api/v1/reports/fuel-reconciliation, operating_company_id)`);
  }

  // BE — schema + scope + canonical fuel table
  if (!/companyQuerySchema/.test(routes)) {
    failures.push(`${ROUTES}: must use companyQuerySchema (requires operating_company_id)`);
  }
  if (!/withCompanyScope\s*\(/.test(routes)) {
    failures.push(`${ROUTES}: must run queries inside withCompanyScope`);
  }
  if (!/FROM\s+fuel\.fuel_transactions\s+ft\b/.test(routes)) {
    failures.push(`${ROUTES}: card side must read FROM fuel.fuel_transactions ft`);
  }
  if (!/ft\.operating_company_id\s*=\s*\$1/.test(routes)) {
    failures.push(`${ROUTES}: fuel queries must filter ft.operating_company_id = $1`);
  }
  if (!/ft\.archived_at\s+IS\s+NULL/.test(routes)) {
    failures.push(`${ROUTES}: must exclude archived fuel.fuel_transactions (archived_at IS NULL)`);
  }
  if (!/ROUND\(\s*ft\.total_cost::numeric\s*\*\s*100\s*\)/.test(routes)) {
    failures.push(`${ROUTES}: must convert fuel.total_cost dollars → cents via ROUND(ft.total_cost::numeric * 100)`);
  }
  if (/FROM\s+banking\.bank_transactions/.test(routes)) {
    failures.push(`${ROUTES}: must NOT use banking.bank_transactions as the fuel card source (RPT-S04)`);
  }
  if (!/registerFuelReconciliationRoutes/.test(routes)) {
    failures.push(`${ROUTES}: must export registerFuelReconciliationRoutes`);
  }
  if (!/\/api\/v1\/reports\/fuel-reconciliation/.test(routes)) {
    failures.push(`${ROUTES}: must mount GET /api/v1/reports/fuel-reconciliation`);
  }

  // FE route mount
  if (!/path=["']\/reports\/fuel-reconciliation["']/.test(manifest)) {
    failures.push(`${MANIFEST}: must mount /reports/fuel-reconciliation`);
  }
  if (!/FuelReconciliationPage/.test(manifest)) {
    failures.push(`${MANIFEST}: must render FuelReconciliationPage on the fuel-reconciliation route`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realPath = path.join(ROOT, ROUTES);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      fs.writeFileSync(
        realPath,
        backup.replace(/FROM\s+fuel\.fuel_transactions\s+ft/g, "FROM banking.bank_transactions bt"),
        "utf8",
      );
      const planted = run();
      if (planted.length === 0) {
        console.error(`[${LABEL}] SELFTEST FAIL: planted bank_transactions swap did not fail`);
        process.exit(1);
      }
      console.log(`[${LABEL}] SELFTEST PASS (${planted.length} planted failures detected)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const failures = run();
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Fuel Reconciliation ties fuel.fuel_transactions + entity scope`);
}

main();
