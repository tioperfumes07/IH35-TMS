#!/usr/bin/env node
/**
 * D-H2 — Loads Report surface wired end-to-end:
 * GET /api/v1/reports/loads, canonical loadCostRollupLateral money columns, FE /reports/loads.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-loads-report-surface";

const FILES = {
  service: "apps/backend/src/reports/loads-report.service.ts",
  routes: "apps/backend/src/reports/loads-report.routes.ts",
  index: "apps/backend/src/reports/index.ts",
  api: "apps/frontend/src/api/reports.ts",
  page: "apps/frontend/src/pages/reports/LoadsReportPage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  rollup: "apps/backend/src/accounting/load-cost-rollup.sql.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertLoadsReportSurface(srcs) {
  const fails = [];
  if (!/export async function getLoadsReport/.test(srcs.service)) {
    fails.push("loads-report.service.ts must export getLoadsReport");
  }
  for (const needle of ["loadCostRollupLateral", "LOAD_COST_ROLLUP_SELECT", "lc_margin_cents", "lc_revenue_cents"]) {
    if (!srcs.service.includes(needle)) fails.push(`service must use canonical rollup (${needle})`);
  }
  if (!/\/api\/v1\/reports\/loads/.test(srcs.routes)) {
    fails.push("loads-report.routes.ts must mount GET /api/v1/reports/loads");
  }
  if (!/registerLoadsReportRoutes/.test(srcs.index)) {
    fails.push("reports/index.ts must register registerLoadsReportRoutes");
  }
  if (!/export async function getLoadsReport/.test(srcs.api)) {
    fails.push("api/reports.ts must export getLoadsReport");
  }
  if (!/data-testid="loads-report-page"/.test(srcs.page)) {
    fails.push("LoadsReportPage must render loads-report-page");
  }
  if (!/ReferenceSelect/.test(srcs.page)) {
    fails.push("LoadsReportPage must use ReferenceSelect for entity filters");
  }
  if (!/footerCells/.test(srcs.page)) {
    fails.push("LoadsReportPage must render ParityTable footerCells totals row");
  }
  if (/fontSize:\s*11\b/.test(srcs.page)) {
    fails.push("LoadsReportPage leftover fontSize: 11 — use text-section-header");
  }
  // BANK-F91541 leftover refuse — filter/KPI leftover Tailwind slate-*
  if (srcs.page.includes("text-slate-") || srcs.page.includes("border-slate-") || srcs.page.includes("bg-slate-")) {
    fails.push("LoadsReportPage leftover slate class");
  }
  if (!/exportFilename="loads-report.csv"/.test(srcs.page)) {
    fails.push("LoadsReportPage must export CSV via ParityTable exportFilename");
  }
  // D-H2 — Settlement column drills to the settlement (EntityLink), not plain text.
  if (!/kind="settlement"/.test(srcs.page) || !/settlement_id/.test(srcs.page)) {
    fails.push("LoadsReportPage Settlement column must EntityLink via settlement_id");
  }
  if (!/lc_settlement_id/.test(srcs.rollup)) {
    fails.push("load-cost-rollup.sql.ts must expose lc_settlement_id");
  }
  if (!/settlement_id: row.lc_settlement_id/.test(srcs.service)) {
    fails.push("loads-report.service.ts must map lc_settlement_id");
  }
  if (!/\/reports\/loads/.test(srcs.manifest)) {
    fails.push("manifest must route /reports/loads");
  }
  if (!/margin_cents/.test(srcs.rollup)) {
    fails.push("load-cost-rollup.sql.ts must define margin_cents");
  }
  return fails;
}

async function selftest() {
  const srcs = Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, read(v)]));
  const fails = assertLoadsReportSurface(srcs);
  if (fails.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${fails.join("\n  - ")}`);
    process.exit(1);
  }
  const leftoverPlant = { ...srcs, page: `${srcs.page}\n<span style={{ fontSize: 11 }}>plant</span>` };
  if (!assertLoadsReportSurface(leftoverPlant).some((e) => e.includes("leftover fontSize: 11"))) {
    console.error(`${LABEL} SELFTEST FAILED: leftover fontSize: 11 plant escaped`);
    process.exit(1);
  }
  const leftoverSlatePlant = { ...srcs, page: `${srcs.page}\n<label className="text-xs text-slate-600">plant</label>` };
  if (!assertLoadsReportSurface(leftoverSlatePlant).some((e) => e.includes("leftover slate class"))) {
    console.error(`${LABEL} SELFTEST FAILED: leftover slate class plant escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    await selftest();
    return;
  }
  await selftest();
}

main().catch((err) => {
  console.error(`${LABEL} FAILED:`, err);
  process.exit(1);
});
