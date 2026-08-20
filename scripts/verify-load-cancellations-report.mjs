#!/usr/bin/env node
/**
 * GAP-10 — Load cancellations analytics report — retargeted 2026-08-21 (CC-3).
 *
 * This guard previously checked for a spec that was never built (`getLoadCancellationsAnalytics`
 * with a `group_by` query-param enum, a dedicated `LoadCancellationsReportPage.tsx` under
 * `pages/dispatch/`, and a `phase6ReportLinks.ts` href) — logged as board finding
 * `LOAD-CANCELLATIONS-REPORT-NEVER-BUILT`. That exact spec is genuinely dead, but the underlying
 * need — a real, live cancellations analytics report — was already built under a different,
 * superseding shape (tagged GAP-10 in the route file itself) that this guard never checked:
 *   - `apps/backend/src/dispatch/cancellations-report.routes.ts` registers
 *     `GET /api/v1/dispatch/cancellations-report`, a single read-only, per-entity-scoped
 *     (withCompanyScope) endpoint that returns ALL FOUR groupings (by_reason / by_driver /
 *     by_customer / by_date) in one response, rather than one grouping selected via a query-param
 *     enum — a strictly more complete design than the original spec asked for.
 *   - `apps/backend/src/index.ts` actually registers the route (`registerCancellationsReportRoutes`).
 *   - `apps/frontend/src/pages/reports/CancellationsReportPage.tsx` (real ParityTable +
 *     PageHeader + ReportsSubNav) calls `getCancellationsReport()`, which hits that exact route.
 *   - `apps/frontend/src/pages/reports/ReportsSubNav.tsx` carries a real
 *     `{ label: "Cancellations", href: "/reports/cancellations" }` nav entry.
 *   - `apps/frontend/src/routes/manifest.tsx` mounts `CancellationsReportPage` at
 *     `/reports/cancellations`.
 *
 * Retargeted to assert the REAL, live shape instead of the abandoned one, so this guard finally
 * protects a feature that actually exists (previously it could only ever fail, since nobody was
 * building toward its old spec). `report.cancellations` / `subnav.cancellations` in
 * `reports.required.json` are the module-matrix leaves this satisfies (qbo_chrome side already
 * covered separately by verify-reports-qbo-chrome-leaves.mjs's report.* class).
 *
 * Self-test: node scripts/verify-load-cancellations-report.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-cancellations-report";

const CHECKS = [
  {
    name: "backend route: real GET /api/v1/dispatch/cancellations-report, per-entity scoped, real group-by-reason/driver/customer/date aggregation",
    file: "apps/backend/src/dispatch/cancellations-report.routes.ts",
    pattern: /"\/api\/v1\/dispatch\/cancellations-report"[\s\S]*withCompanyScope[\s\S]*by_reason:[\s\S]*by_driver:[\s\S]*by_customer:[\s\S]*by_date:/,
  },
  {
    name: "backend wiring: index.ts actually registers the cancellations-report route",
    file: "apps/backend/src/index.ts",
    pattern: /registerCancellationsReportRoutes[\s\S]*registerCancellationsReportRoutes\(app\)/,
  },
  {
    name: "frontend page: CancellationsReportPage real PageHeader + ReportsSubNav + ParityTable",
    file: "apps/frontend/src/pages/reports/CancellationsReportPage.tsx",
    pattern: /(?=[\s\S]*getCancellationsReport)(?=[\s\S]*<PageHeader)(?=[\s\S]*<ReportsSubNav)(?=[\s\S]*<ParityTable)/,
  },
  {
    name: "frontend API client: getCancellationsReport hits the real backend route",
    file: "apps/frontend/src/api/reports.ts",
    pattern: /export async function getCancellationsReport[\s\S]{0,400}\/api\/v1\/dispatch\/cancellations-report/,
  },
  {
    name: "frontend subnav: real Cancellations nav entry",
    file: "apps/frontend/src/pages/reports/ReportsSubNav.tsx",
    pattern: /\{ label: "Cancellations", href: "\/reports\/cancellations" \}/,
  },
  {
    name: "route manifest: real /reports/cancellations mount",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/reports\/cancellations"/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".load-cancellations-report-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — GAP-10 load cancellations analytics report is real, live, and wired end-to-end`);
