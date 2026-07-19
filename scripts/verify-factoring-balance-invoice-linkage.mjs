#!/usr/bin/env node
/**
 * Rule-17 fail-closed guard for 0280-05-factoring-balance-invoice-linkage.
 *
 * Pins Factoring Balance to the invoice-grain secured-borrowing read model:
 *   - outstanding Faro LIABILITY (funded − settled − recourse), never reserve
 *   - separate reserve receivable (never netted)
 *   - COUNT(DISTINCT invoice.id); no JOIN fanout on money
 *   - typed unverifiable + failed errors; no silent $0 catch
 *   - HOLD FORCE-RLS migration + security_invoker view
 *   - no new GL math / posting / QBO write-back
 *
 * Usage:
 *   node scripts/verify-factoring-balance-invoice-linkage.mjs
 *   node scripts/verify-factoring-balance-invoice-linkage.mjs --selftest
 *
 * Rule 17: do NOT edit package.json / locked-guards.yml / ci.yml.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExecutableGuard } from "./guard-executable-contract.mjs";

const ROOT = process.cwd();
const LABEL = "verify-factoring-balance-invoice-linkage";
const SELF_PATH = fileURLToPath(import.meta.url);

const PATHS = {
  service: "apps/backend/src/home/factoring-balance-invoice-linkage.service.ts",
  routes: "apps/backend/src/home/home-widgets.routes.ts",
  serviceTest: "apps/backend/src/home/factoring-balance-invoice-linkage.service.test.ts",
  dbTest: "apps/backend/src/home/__tests__/factoring-balance-invoice-linkage.db.test.ts",
  routesTest: "apps/backend/src/home/home-widgets.routes.test.ts",
  migration: "db/migrations/202607600000_factoring_balance_invoice_linkage.sql",
  held: "db/migrations/.held-migrations.json",
  additions: "docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md",
  step: "scripts/verify-steps/929-verify-factoring-balance-invoice-linkage.mjs",
  manifest: ".block-ready/0280-05-factoring-balance-invoice-linkage.json",
};

function readRel(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

export function checker(sources) {
  const failures = [];
  const require = (key, text, code) => {
    if (!sources[key] || !sources[key].includes(text)) failures.push(code);
  };
  const forbid = (key, re, code) => {
    if (sources[key] && re.test(sources[key])) failures.push(code);
  };

  for (const [key, rel] of Object.entries(PATHS)) {
    if (!sources[key]) failures.push(`missing_file:${rel}`);
  }
  if (failures.length) return failures;

  require("service", "computeFactoringBalanceInvoiceLinkage", "service_export_missing");
  require("service", "outstanding_liability_cents", "liability_field_missing");
  require("service", "reserve_receivable_cents", "reserve_field_missing");
  require("service", "invoice_count", "invoice_count_missing");
  require("service", "unverifiable", "unverifiable_status_missing");
  require("service", "never_net_reserve_into_liability", "never_net_meta_missing");
  require("service", "views.factoring_balance_invoice_linkage", "view_source_missing");
  require("service", "accounting.factoring_advances", "advances_source_missing");
  require("service", "accounting.invoices", "invoices_source_missing");
  require("service", "computeOutstandingLiabilityCents", "formula_helper_missing");
  require("service", "wouldFanoutMultiply", "fanout_helper_missing");
  forbid("service", /INSERT\s+INTO\s+accounting\.journal_entry/i, "service_must_not_write_je");
  forbid("service", /postSourceTransaction/, "service_must_not_post");
  forbid("service", /FROM\s+views\.factoring_summary/i, "service_must_not_use_superseded_summary");
  forbid("service", /factoring\.company_balances/, "service_must_not_use_dead_company_balances");
  forbid("service", /SELECT[\s\S]{0,200}current_reserve_balance/i, "service_must_not_read_never_written_column");

  require("routes", "computeFactoringBalanceInvoiceLinkage", "routes_must_call_linkage_service");
  require("routes", "factoring_balance_invoice_linkage_unverifiable", "routes_must_surface_unverifiable");
  require("routes", "factoring_balance_invoice_linkage_failed", "routes_must_surface_failures");
  require("routes", "outstanding_liability_cents", "routes_must_expose_liability");
  require("routes", "reserve_receivable_cents", "routes_must_expose_reserve");
  require("routes", "invoice_count", "routes_must_expose_invoice_count");
  forbid("routes", /FROM\s+views\.factoring_summary/, "routes_must_not_read_superseded_summary");
  forbid(
    "routes",
    /factoring-balance[\s\S]{0,900}catch\s*\{\s*return\s*\{\s*reserveCents:\s*0/,
    "routes_silent_zero_catch"
  );
  forbid(
    "routes",
    /totalCents:\s*reserveCents\s*\+\s*advancedCents|totalCents:\s*.*reserve.*\+.*advanced/,
    "routes_must_not_net_reserve_into_total"
  );

  require("migration", "DO NOT RUN ON PROD", "migration_missing_hold_marker");
  require("migration", "FORCE ROW LEVEL SECURITY", "migration_missing_force_rls");
  require("migration", "identity.is_lucia_bypass()", "migration_missing_lucia_bypass");
  require("migration", "views.factoring_balance_invoice_linkage", "migration_missing_view");
  require("migration", "security_invoker", "migration_missing_security_invoker");
  require("migration", "COUNT(DISTINCT i.id)", "migration_missing_distinct_invoice_count");
  require("migration", "recourse_returned", "migration_missing_recourse");
  require("migration", "reserve_held", "migration_missing_settled_status");
  forbid("migration", /DROP\s+TABLE/i, "migration_must_be_additive");
  forbid("migration", /CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]{0,200}post/i, "migration_no_new_gl_math");

  if (!sources.held.includes("202607600000_factoring_balance_invoice_linkage.sql")) {
    failures.push("held_registry_missing_migration");
  }

  require("additions", "0280-05-factoring-balance-invoice-linkage", "additions_missing_owner_decision");
  require("additions", "outstanding Faro secured-borrowing LIABILITY", "additions_missing_liability_decision");
  require("additions", "never netted", "additions_missing_reserve_decision");

  require("serviceTest", "connection_reset", "service_test_planted_failure");
  require("serviceTest", "fanout", "service_test_fanout");
  require("serviceTest", "unverifiable", "service_test_unverifiable");
  require("serviceTest", "empty", "service_test_empty");
  require("dbTest", "multi-invoice", "db_test_multi_invoice");
  require("dbTest", "cross-company", "db_test_cross_company");
  require("dbTest", "planted_query_failure", "db_test_planted_failure");
  require("dbTest", "relforcerowsecurity", "db_test_force_rls");
  require("routesTest", "computeFactoringBalanceInvoiceLinkage", "routes_test_service_call");
  require("routesTest", "factoring_balance_invoice_linkage_failed", "routes_test_failed_error");

  require("step", "verify-factoring-balance-invoice-linkage", "verify_step_name_missing");
  require("manifest", "0280-05-factoring-balance-invoice-linkage", "manifest_block_id_missing");
  require("manifest", "apps/backend/src/home/factoring-balance-invoice-linkage.service.ts", "manifest_service_not_listed");
  require("manifest", "db/migrations/202607600000_factoring_balance_invoice_linkage.sql", "manifest_migration_not_listed");
  require("manifest", "scripts/verify-factoring-balance-invoice-linkage.mjs", "manifest_guard_not_listed");

  return failures;
}

function loadRepositoryFixture() {
  const sources = {};
  for (const [key, rel] of Object.entries(PATHS)) {
    sources[key] = readRel(rel);
  }
  return sources;
}

function createBadFixture(good) {
  const bad = { ...good };
  bad.routes =
    String(good.routes) +
    "\napp.get('/api/v1/home/factoring-balance', async () => { try {} catch { return { reserveCents: 0, advancedCents: 0, totalCents: 0 }; } });\n" +
    "\nFROM views.factoring_summary\n";
  bad.service = String(good.service).replace(
    /computeFactoringBalanceInvoiceLinkage/g,
    "computeSomethingElse"
  );
  return bad;
}

const goodFixture = loadRepositoryFixture();
const badFixture = createBadFixture(goodFixture);

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF_PATH);

if (isDirectRun) {
  runExecutableGuard({
    label: LABEL,
    checker,
    loadRepositoryFixture,
    goodFixture,
    badFixture,
    expectedBadViolationSubstrings: [
      "routes_silent_zero_catch",
      "routes_must_not_read_superseded_summary",
      "service_export_missing",
    ],
  });
}
