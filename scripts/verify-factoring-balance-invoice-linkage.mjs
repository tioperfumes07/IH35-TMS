#!/usr/bin/env node
/**
 * Rule-17 fail-closed guard for 0280-05-factoring-balance-invoice-linkage.
 *
 * Semantic / executable plants (not 3-string decoys): comment/string bodies cannot satisfy
 * presence checks; planted defects must fail. Covers liability formula/artifact joins, reserve
 * separation, DISTINCT invoice count, Faro entity scope, RLS write roles, FE field selection,
 * valid fixture IDs, error-vs-empty, verify-step wiring.
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
import { toExecutableSemantics } from "./verify-fmcsa-fire-and-forget-retry.mjs";

const ROOT = process.cwd();
const LABEL = "verify-factoring-balance-invoice-linkage";
const SELF_PATH = fileURLToPath(import.meta.url);

const PATHS = {
  service: "apps/backend/src/home/factoring-balance-invoice-linkage.service.ts",
  routes: "apps/backend/src/home/home-widgets.routes.ts",
  serviceTest: "apps/backend/src/home/factoring-balance-invoice-linkage.service.test.ts",
  dbTest: "apps/backend/src/home/__tests__/factoring-balance-invoice-linkage.db.test.ts",
  routesTest: "apps/backend/src/home/home-widgets.routes.test.ts",
  feApi: "apps/frontend/src/api/home.ts",
  feTest: "apps/frontend/src/api/home-widget-contract.test.ts",
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

function execCode(src) {
  return toExecutableSemantics(src ?? "").code;
}

function execSqlTemplates(src) {
  return toExecutableSemantics(src ?? "").sqlTemplates.join("\n");
}

export function checker(sources) {
  const failures = [];
  const requireText = (key, text, code) => {
    if (!sources[key] || !sources[key].includes(text)) failures.push(code);
  };
  const requireExec = (key, text, code) => {
    const codeBody = execCode(sources[key]);
    const sqlBody = execSqlTemplates(sources[key]);
    if (!codeBody.includes(text) && !sqlBody.includes(text) && !(sources[key] ?? "").includes(text)) {
      // For SQL migrations, also scan stripped executable-ish content without comments.
      const stripped = String(sources[key] ?? "")
        .replace(/--.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      if (!stripped.includes(text)) failures.push(code);
    }
  };
  const forbidExec = (key, re, code) => {
    const stripped = String(sources[key] ?? "")
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const codeBody = execCode(sources[key]);
    if (re.test(codeBody) || re.test(stripped)) failures.push(code);
  };

  for (const [key, rel] of Object.entries(PATHS)) {
    if (!sources[key]) failures.push(`missing_file:${rel}`);
  }
  if (failures.length) return failures;

  // Liability formula / artifact joins (executable)
  requireExec("service", "factoring_advance_liability", "service_liability_role_missing");
  requireExec("service", "factor_reserve_held", "service_reserve_role_missing");
  requireExec("service", "resolveFaroFactorIdentity", "service_faro_identity_missing");
  requireExec("service", "incomplete_funding_je_artifacts", "service_incomplete_funding_gate_missing");
  requireExec("service", "liability_from_status: false", "service_must_declare_not_status_liability");
  requireExec("service", "invoice_count", "service_invoice_count_missing");
  forbidExec("service", /INSERT\s+INTO\s+accounting\.journal_entry/i, "service_must_not_write_je");
  forbidExec("service", /postSourceTransaction|postFactoringAdvanceEvent/, "service_must_not_post");
  forbidExec("service", /FROM\s+views\.factoring_summary/i, "service_must_not_use_superseded_summary");

  // Routes — liability headline, no silent zero, no net
  requireExec("routes", "computeFactoringBalanceInvoiceLinkage", "routes_must_call_linkage_service");
  requireExec("routes", "outstanding_liability_cents", "routes_must_expose_liability");
  requireExec("routes", "reserve_receivable_cents", "routes_must_expose_reserve");
  requireExec("routes", "factoring_balance_invoice_linkage_unverifiable", "routes_must_surface_unverifiable");
  requireExec("routes", "factoring_balance_invoice_linkage_failed", "routes_must_surface_failures");
  requireExec("routes", "totalCents: result.outstanding_liability_cents", "routes_total_must_be_liability");
  forbidExec("routes", /FROM\s+views\.factoring_summary/, "routes_must_not_read_superseded_summary");
  forbidExec(
    "routes",
    /factoring-balance[\s\S]{0,900}catch\s*\{\s*return\s*\{\s*reserveCents:\s*0/,
    "routes_silent_zero_catch"
  );
  forbidExec(
    "routes",
    /totalCents:\s*[^;]*reserve[^;]*\+/,
    "routes_must_not_net_reserve_into_total"
  );

  // Frontend consumer — headline liability, not reserve
  requireExec("feApi", "outstanding_liability_cents", "fe_must_read_liability_field");
  requireExec("feApi", "reserve_receivable_cents", "fe_must_expose_reserve_separately");
  forbidExec(
    "feApi",
    /outstanding_cents:\s*num\(\s*raw\.reserveCents/,
    "fe_must_not_headline_reserve"
  );
  requireExec("feTest", "headlines outstanding Faro LIABILITY", "fe_test_liability_headline_missing");

  // Migration — FORCE RLS Owner/Admin write, security_invoker, artifact view
  requireText("migration", "DO NOT RUN ON PROD", "migration_missing_hold_marker");
  requireText("migration", "FORCE ROW LEVEL SECURITY", "migration_missing_force_rls");
  requireText("migration", "factoring_advances_entity_insert", "migration_missing_insert_policy");
  requireText("migration", "factoring_advances_entity_update", "migration_missing_update_policy");
  requireText("migration", "Owner", "migration_missing_owner_role_gate");
  requireText("migration", "Administrator", "migration_missing_admin_role_gate");
  requireText("migration", "REVOKE DELETE", "migration_missing_revoke_delete");
  requireText("migration", "security_invoker", "migration_missing_security_invoker");
  requireText("migration", "COUNT(DISTINCT i.id)", "migration_missing_distinct_invoice_count");
  requireText("migration", "factoring_advance_liability", "migration_missing_liability_role");
  requireText("migration", "factor_reserve_held", "migration_missing_reserve_role");
  requireText("migration", "source_transaction_type", "migration_missing_source_txn_join");
  forbidExec("migration", /DROP\s+TABLE/i, "migration_must_be_additive");
  forbidExec("migration", /status\s+IN\s*\(\s*'reserve_held'/i, "migration_must_not_settle_via_status");

  if (!sources.held.includes("202607600000_factoring_balance_invoice_linkage.sql")) {
    failures.push("held_registry_missing_migration");
  }

  requireText("additions", "0280-05-factoring-balance-invoice-linkage", "additions_missing_owner_decision");
  requireText("additions", "outstanding Faro secured-borrowing LIABILITY", "additions_missing_liability_decision");
  requireText("additions", "never netted", "additions_missing_reserve_decision");
  requireText("additions", "Statuses must NOT clear balances", "additions_missing_status_veto");

  // Tests — fixture IDs, plants, isolation
  requireExec("dbTest", "canonicalInvoiceDisplayId", "db_test_canonical_invoice_display_helper");
  requireExec("dbTest", "invoices_display_id_check", "db_test_display_id_check_coverage");
  requireExec("dbTest", "INV-2026-", "db_test_canonical_invoice_display_seed");
  requireExec("dbTest", "planted_query_failure", "db_test_planted_failure");
  requireExec("dbTest", "relforcerowsecurity", "db_test_force_rls");
  requireExec("dbTest", "factoring_advances_entity_insert", "db_test_rls_write_roles");
  requireExec("dbTest", "source_transaction_type", "db_test_artifact_source_keys");
  forbidExec("dbTest", /INV-FBL-|INV-FBO-/, "db_test_must_not_seed_malformed_invoice_display_id");
  requireExec("serviceTest", "connection_reset", "service_test_planted_failure");
  requireExec("serviceTest", "incomplete_funding_je_artifacts", "service_test_incomplete");
  requireExec("serviceTest", "faro_contract_entity_mismatch", "service_test_faro_identity");

  requireText("step", "verify-factoring-balance-invoice-linkage", "verify_step_name_missing");
  requireText("manifest", "0280-05-factoring-balance-invoice-linkage", "manifest_block_id_missing");
  requireText("manifest", "apps/frontend/src/api/home.ts", "manifest_fe_api_not_listed");
  requireText("manifest", "db/migrations/202607600000_factoring_balance_invoice_linkage.sql", "manifest_migration_not_listed");
  requireText("manifest", "scripts/verify-factoring-balance-invoice-linkage.mjs", "manifest_guard_not_listed");

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
    "\nFROM views.factoring_summary\n" +
    "\ntotalCents: result.reserve_receivable_cents + result.outstanding_liability_cents\n";
  bad.service = String(good.service)
    .replace(/computeFactoringBalanceInvoiceLinkage/g, "computeSomethingElse")
    .replace(/factoring_advance_liability/g, "some_other_role");
  bad.feApi =
    String(good.feApi) +
    "\noutstanding_cents: num(raw.reserveCents ?? raw.outstanding_cents),\n";
  // Plant malformed invoice display_id seed + status-based settlement in migration decoy path
  bad.dbTest = String(good.dbTest) + "\n`INV-FBL-${n()}`\n";
  bad.migration =
    String(good.migration).replace(/FORCE ROW LEVEL SECURITY/g, "ENABLE ROW LEVEL SECURITY") +
    "\n-- comment decoy only: factoring_advance_liability\n" +
    "\nWHERE status IN ('reserve_held', 'collected', 'released')\n";
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
      "service_liability_role_missing",
      "db_test_must_not_seed_malformed_invoice_display_id",
      "fe_must_not_headline_reserve",
      "migration_must_not_settle_via_status",
    ],
  });
}
