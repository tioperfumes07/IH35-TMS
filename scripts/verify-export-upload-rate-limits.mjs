#!/usr/bin/env node
/**
 * Guard: heavy financial exports, audit-report generation, and binary file
 * uploads (H4-5) MUST declare a `config.rateLimit` on their route registration.
 *
 * These routes render PDFs/XLSX, run heavy audit aggregations, or buffer whole
 * uploaded files in memory — all CPU/memory/DB-expensive. Rate-limiting in this
 * codebase is opt-in (`global:false`), so an unthrottled export/upload route is a
 * denial-of-service / resource-exhaustion exposure. This static check fails CI if
 * any listed route loses its rateLimit config, so the fix cannot silently regress.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");

const REQUIRED = [
  {
    file: "apps/backend/src/accounting/statement-export.routes.ts",
    finding: "H4-5",
    routes: [
      "/api/v1/accounting/trial-balance/export/pdf",
      "/api/v1/accounting/trial-balance/export/xlsx",
      "/api/v1/accounting/profit-loss/export/pdf",
      "/api/v1/accounting/profit-loss/export/xlsx",
      "/api/v1/accounting/balance-sheet/export/pdf",
      "/api/v1/accounting/balance-sheet/export/xlsx",
      "/api/v1/accounting/cash-flow/export/pdf",
      "/api/v1/accounting/cash-flow/export/xlsx",
      "/api/v1/accounting/ar-aging/export/pdf",
      "/api/v1/accounting/ar-aging/export/xlsx",
      "/api/v1/accounting/ap-aging/export/pdf",
      "/api/v1/accounting/ap-aging/export/xlsx",
    ],
  },
  {
    file: "apps/backend/src/audit/audit-reports.routes.ts",
    finding: "H4-5",
    routes: [
      "/api/v1/audit/reports/activity-by-user",
      "/api/v1/audit/reports/activity-by-module",
      "/api/v1/audit/reports/financial-change-log",
      "/api/v1/audit/reports/maintenance-decision-log",
      "/api/v1/audit/reports/deduction-trail",
      "/api/v1/audit/reports/void-reversal",
      "/api/v1/audit/reports/period-close-history",
    ],
  },
  {
    file: "apps/backend/src/mdata/equipment-pdf-export.routes.ts",
    finding: "H4-5",
    routes: ["/api/v1/mdata/equipment/:id/export.pdf"],
  },
  {
    file: "apps/backend/src/mdata/unit-pdf-export.routes.ts",
    finding: "H4-5",
    routes: ["/api/v1/mdata/units/:id/export.pdf"],
  },
  {
    file: "apps/backend/src/mdata/driver-pdf-export.routes.ts",
    finding: "H4-5",
    routes: ["/api/v1/mdata/drivers/:id/export.pdf"],
  },
  {
    file: "apps/backend/src/fuel/loves-upload.routes.ts",
    finding: "H4-5",
    routes: ["/api/v1/fuel/loves-prices/upload"],
  },
  {
    file: "apps/backend/src/driver/fuel-receipt.routes.ts",
    finding: "H4-5",
    routes: ["/api/v1/driver/fuel/upload-receipt"],
  },
  {
    file: "apps/backend/src/mdata/drivers-import.routes.ts",
    finding: "H4-5",
    routes: ["/api/v1/mdata/drivers/import"],
  },
  {
    file: "apps/backend/src/banking/reconciliation.routes.ts",
    finding: "H4-5",
    routes: ["/api/v1/banking/upload-statement"],
  },
];

// Match `app.<verb>("<route>", { ... rateLimit ... }, handler)` where the options
// object (containing rateLimit) sits between the path and the handler.
function routeHasRateLimit(source, route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\.(post|get|put|patch|delete)\\s*(?:<[^>]*>)?\\s*\\(\\s*["'\`]${escaped}["'\`]\\s*,\\s*\\{[^;]*?rateLimit`,
    "s"
  );
  return re.test(source);
}

const failures = [];
let checked = 0;

for (const entry of REQUIRED) {
  const abs = path.resolve(ROOT, entry.file);
  if (!fs.existsSync(abs)) {
    failures.push(`[${entry.finding}] missing file: ${entry.file}`);
    continue;
  }
  const source = fs.readFileSync(abs, "utf8");
  for (const route of entry.routes) {
    checked += 1;
    if (!routeHasRateLimit(source, route)) {
      failures.push(
        `[${entry.finding}] ${entry.file}: route "${route}" has no config.rateLimit on its registration`
      );
    }
  }
}

if (failures.length > 0) {
  console.error("verify-export-upload-rate-limits FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    `\n${failures.length} export/upload route(s) missing a rateLimit config. Add ` +
      `{ config: { rateLimit: { max, timeWindow: "1 minute" } } } to the route registration.`
  );
  process.exit(1);
}

console.log(`OK: all ${checked} heavy export/audit-report/upload routes declare a config.rateLimit.`);
