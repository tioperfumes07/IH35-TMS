#!/usr/bin/env node
/**
 * Rule-17 fail-closed guard for 0280-02-revenue-gl-linkage.
 *
 * Pins Home today/weekly revenue to the dual-basis read-only linkage service:
 * invoice basis + GL-posted revenue, explicit basis metadata, discrepancy fields,
 * no silent catch→fabricated $0, no new GL math/writes.
 *
 * Usage:
 *   node scripts/verify-revenue-gl-linkage.mjs
 *   node scripts/verify-revenue-gl-linkage.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LABEL = "verify-revenue-gl-linkage";

const PATHS = {
  service: "apps/backend/src/home/revenue-gl-linkage.service.ts",
  routes: "apps/backend/src/home/home-widgets.routes.ts",
  serviceTest: "apps/backend/src/home/revenue-gl-linkage.service.test.ts",
  dbTest: "apps/backend/src/home/__tests__/revenue-gl-linkage.db.test.ts",
  feApi: "apps/frontend/src/api/home.ts",
};

function readRel(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

export function collectFailures(sources) {
  const failures = [];
  const require = (key, text, code) => {
    if (!sources[key] || !sources[key].includes(text)) failures.push(code);
  };
  const forbid = (key, re, code) => {
    if (sources[key] && re.test(sources[key])) failures.push(code);
  };

  require("service", "computeRevenueGlLinkage", "service_export_missing");
  require("service", "invoice_basis", "invoice_basis_label_missing");
  require("service", "gl_posted", "gl_posted_label_missing");
  require("service", "unverifiable", "unverifiable_status_missing");
  require("service", "transaction_source_links", "source_links_not_used");
  require("service", "journal_entry_postings", "jep_not_used");
  require("service", "Income", "governed_income_accounts_missing");
  require("service", "discrepancy_count", "discrepancy_count_missing");
  require("service", "discrepancy_cents", "discrepancy_cents_missing");
  require("service", "mismatched_invoices", "invoice_drill_missing");
  require("service", "mismatched_journal_entries", "je_drill_missing");
  require("service", "COMPANY_TIME_ZONE", "company_tz_missing");
  require("service", "actual_departure_at", "delivery_recognition_missing");
  require("service", "load_stops", "delivery_stop_join_missing");
  forbid("service", /\.delivered_at\b/, "phantom_loads_delivered_at");
  forbid("service", /INSERT\s+INTO\s+accounting\.journal_entry/i, "service_must_not_write_je");
  forbid("service", /postSourceTransaction/, "service_must_not_post");

  require("routes", "computeRevenueGlLinkage", "routes_must_call_linkage_service");
  require("routes", "todayRevenueWindow", "routes_must_use_company_today_window");
  require("routes", "weeklyRevenueWindow", "routes_must_use_company_weekly_window");
  require("routes", "revenue_gl_linkage_unverifiable", "routes_must_surface_unverifiable");
  require("routes", "revenue_gl_linkage_failed", "routes_must_surface_failures");
  // Ban the pre-fix silent-swallow pattern on revenue endpoints (fabricated $0).
  forbid(
    "routes",
    /today-revenue[\s\S]{0,800}catch\s*\{\s*return\s*\{\s*revenue_cents:\s*0\s*\}/,
    "today_revenue_silent_zero_catch"
  );
  forbid(
    "routes",
    /weekly-revenue[\s\S]{0,1200}catch\s*\{\s*return\s*\{\s*days:\s*\[\s*\]/,
    "weekly_revenue_silent_empty_catch"
  );
  forbid("routes", /issue_date\s*=\s*CURRENT_DATE/, "today_revenue_utc_current_date");

  require("serviceTest", "missing_je", "service_test_missing_je");
  require("serviceTest", "wrong_account", "service_test_wrong_account");
  require("serviceTest", "voided_je", "service_test_voided_je");
  require("serviceTest", "unverifiable", "service_test_unverifiable");
  require("serviceTest", "connection_reset", "service_test_no_silent_swallow");
  require("dbTest", "cross-entity", "db_test_cross_entity");
  require("dbTest", "date boundary", "db_test_date_boundary");

  require("feApi", "invoice_basis_cents", "fe_invoice_basis_field");
  require("feApi", "gl_posted_revenue_cents", "fe_gl_posted_field");
  require("feApi", "revenueRaw === null", "fe_null_revenue_guard");
  require("feApi", "unverifiable", "fe_unverifiable_status_field");

  return failures;
}

function readSourcesFrom(root) {
  const out = {};
  for (const [key, rel] of Object.entries(PATHS)) {
    const abs = path.join(root, rel);
    out[key] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  }
  return out;
}

function runGuard(root = ROOT) {
  const sources = readSourcesFrom(root);
  for (const [key, rel] of Object.entries(PATHS)) {
    if (!sources[key]) {
      console.error(`${LABEL} FAILED: missing ${rel}`);
      process.exit(1);
    }
  }
  const failures = collectFailures(sources);
  if (failures.length) {
    console.error(`${LABEL} FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Home revenue dual-basis linkage pinned.`);
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "revgl-guard-"));
  const good = {
    service: `
      export async function computeRevenueGlLinkage() {}
      invoice_basis gl_posted unverifiable
      transaction_source_links journal_entry_postings Income
      discrepancy_count discrepancy_cents
      mismatched_invoices mismatched_journal_entries
      COMPANY_TIME_ZONE actual_departure_at load_stops
    `,
    routes: `
      computeRevenueGlLinkage todayRevenueWindow weeklyRevenueWindow
      revenue_gl_linkage_unverifiable revenue_gl_linkage_failed
      app.get("/api/v1/home/today-revenue"
      app.get("/api/v1/home/weekly-revenue"
    `,
    serviceTest: `missing_je wrong_account voided_je unverifiable connection_reset`,
    dbTest: `cross-entity date boundary`,
    feApi: `
      invoice_basis_cents gl_posted_revenue_cents
      const revenue_cents = revenueRaw === null || revenueRaw === undefined ? null : Number(revenueRaw);
      unverifiable
    `,
  };
  for (const [key, rel] of Object.entries(PATHS)) {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, good[key]);
  }
  const goodFails = collectFailures(readSourcesFrom(tmp));
  if (goodFails.length) {
    console.error(`${LABEL} --selftest FAILED: clean tree should pass`, goodFails);
    process.exit(1);
  }

  // Planted regression: silent catch fabricated zero on today-revenue.
  const badRoutes = path.join(tmp, PATHS.routes);
  fs.writeFileSync(
    badRoutes,
    `
      computeRevenueGlLinkage todayRevenueWindow weeklyRevenueWindow
      revenue_gl_linkage_unverifiable revenue_gl_linkage_failed
      app.get("/api/v1/home/today-revenue", async () => {
        try { return {}; } catch { return { revenue_cents: 0 }; }
      });
      app.get("/api/v1/home/weekly-revenue"
    `
  );
  const badFails = collectFailures(readSourcesFrom(tmp));
  if (!badFails.includes("today_revenue_silent_zero_catch")) {
    console.error(`${LABEL} --selftest FAILED: planted silent-zero catch not detected`, badFails);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGuard();
}

export default { name: LABEL, run: () => runGuard() };
