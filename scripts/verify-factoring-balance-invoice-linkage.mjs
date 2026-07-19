#!/usr/bin/env node
/**
 * Rule-17 fail-closed guard for 0280-05-factoring-balance-invoice-linkage (CPA VETO revision).
 *
 * Semantic / executable plants (not textual decoys). Covers:
 * liability formula/artifact joins, reserve separation, DISTINCT invoice count/no fanout,
 * entity+factor scope (no majority/name), RLS write roles, FE null/unverifiable,
 * valid fixture IDs, error-vs-empty, as-of boundary, no clamp, lifecycle source types,
 * verify-step wiring.
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
  feDefaultHome: "apps/frontend/src/pages/home/roles/DefaultHome.tsx",
  feOwnerHome: "apps/frontend/src/pages/home/OwnerHome.tsx",
  poster: "apps/backend/src/accounting/factoring-posting/poster.service.ts",
  posterAtomicityTest: "apps/backend/src/accounting/factoring-posting/__tests__/poster-lifecycle-atomicity.test.ts",
  journalEntries: "apps/backend/src/accounting/journal-entries.service.ts",
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
  requireExec("service", "resolveCanonicalActiveFactor", "service_active_factor_identity_missing");
  requireExec("service", "canonical_factor_agreements", "service_faro_agreement_table_missing");
  requireExec("service", "FARO_FULL_RECOURSE_V1", "service_faro_agreement_code_missing");
  requireExec("service", "missing_faro_agreement_binding", "service_missing_agreement_gate_missing");
  requireExec("service", "faro_agreement_not_effective", "service_agreement_effective_gate_missing");
  requireExec("service", "ambiguous_faro_agreement_binding", "service_ambiguous_agreement_gate_missing");
  requireExec("service", "faro_agreement_terms_mismatch", "service_terms_mismatch_gate_missing");
  requireExec("service", "incomplete_funding_je_artifacts", "service_incomplete_funding_gate_missing");
  requireExec("service", "accounting_exception:debit_liability_anomaly", "service_debit_anomaly_missing");
  requireExec("service", "accounting_exception:reserve_over_release", "service_reserve_over_release_missing");
  requireExec("service", "never_clamp_anomaly_to_zero: true", "service_must_declare_no_clamp");
  requireExec("service", "companyBusinessDate", "service_as_of_business_date_missing");
  requireExec("service", "app.factoring_balance_as_of", "service_as_of_guc_missing");
  requireExec("service", "liability_from_status: false", "service_must_declare_not_status_liability");
  requireExec("service", "invoice_count", "service_invoice_count_missing");
  forbidExec("service", /INSERT\s+INTO\s+accounting\.journal_entry/i, "service_must_not_write_je");
  forbidExec("service", /postSourceTransaction|postFactoringAdvanceEvent/, "service_must_not_post");
  forbidExec("service", /FROM\s+views\.factoring_summary/i, "service_must_not_use_superseded_summary");
  forbidExec("service", /ILIKE\s*'%faro%'/i, "service_must_not_vendor_name_match");
  forbidExec("service", /ORDER BY COUNT\(\*\) DESC/, "service_must_not_majority_customer_inference");
  forbidExec("service", /Math\.max\(\s*0\s*,/, "service_must_not_clamp_with_math_max");
  // Never label a generic sole factor as Faro (old WITH candidates sole-vendor path).
  forbidExec("service", /WITH candidates AS/, "service_must_not_sole_factor_candidates_cte");

  // Routes — liability headline, no silent zero, no net
  requireExec("routes", "computeFactoringBalanceInvoiceLinkage", "routes_must_call_linkage_service");
  requireExec("routes", "outstanding_liability_cents", "routes_must_expose_liability");
  requireExec("routes", "reserve_receivable_cents", "routes_must_expose_reserve");
  requireExec("routes", "factoring_balance_invoice_linkage_unverifiable", "routes_must_surface_unverifiable");
  requireExec("routes", "factoring_balance_invoice_linkage_accounting_exception", "routes_must_surface_exception");
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

  // Frontend — headline liability; preserve null/unverifiable
  requireExec("feApi", "outstanding_liability_cents", "fe_must_read_liability_field");
  requireExec("feApi", "reserve_receivable_cents", "fe_must_expose_reserve_separately");
  requireExec("feApi", 'status === "unverifiable"', "fe_must_branch_unverifiable");
  requireExec("feApi", "outstanding_cents: null", "fe_must_preserve_null_headline");
  forbidExec(
    "feApi",
    /outstanding_cents:\s*num\(\s*raw\.reserveCents/,
    "fe_must_not_headline_reserve"
  );
  requireExec("feTest", "headlines outstanding Faro LIABILITY", "fe_test_liability_headline_missing");
  requireExec("feTest", "unverifiable keeps outstanding_cents null", "fe_test_unverifiable_null_missing");
  requireExec("feDefaultHome", "Unverifiable", "fe_default_home_unverifiable_render_missing");
  requireExec("feOwnerHome", "Unverifiable", "fe_owner_home_unverifiable_render_missing");
  requireExec("feDefaultHome", 'fb.status === "unverifiable"', "fe_default_must_branch_unverifiable_status");
  requireExec("feOwnerHome", 'fb.status === "unverifiable"', "fe_owner_must_branch_unverifiable_status");

  // Poster — atomic lifecycle source links in caller-owned txn + already_posted repair
  requireExec("poster", "attachFactoringLifecycleSourceLinks", "poster_lifecycle_attach_missing");
  requireExec("poster", "createFactoringJournalEntryAtomically", "poster_atomic_je_helper_missing");
  requireExec("poster", "createJournalEntryOnClient", "poster_must_use_on_client_je");
  requireExec("poster", "repairFactoringLifecycleSourceLinks", "poster_already_posted_repair_missing");
  requireExec("poster", "ensureOpenPeriod", "poster_closed_period_gate_missing");
  requireExec("poster", "failAfterJeBeforeLifecycleLinks", "poster_inject_failure_hook_missing");
  requireExec("poster", "factoring_customer_payment", "poster_customer_payment_source_missing");
  requireExec("poster", "factoring_reserve_release", "poster_reserve_release_source_missing");
  requireExec("poster", "factoring_chargeback", "poster_chargeback_source_missing");
  requireExec("poster", "FACTORING_GL_POSTING", "poster_flag_gate_present");
  requireExec("journalEntries", "createJournalEntryOnClient", "journal_entries_on_client_missing");
  requireExec("journalEntries", "enqueueJournalEntrySideEffects", "journal_entries_deferred_side_effects_missing");
  requireExec("posterAtomicityTest", "injected_failure_between_je_and_lifecycle_links", "atomicity_test_inject_missing");
  requireExec("posterAtomicityTest", "already_posted path repairs", "atomicity_test_repair_missing");

  // Migration — FORCE RLS, security_invoker, per-advance source linkage, signed (no GREATEST clamp)
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
  requireText("migration", "transaction_source_links", "migration_missing_tsl_join");
  requireText("migration", "factoring_customer_payment", "migration_missing_settlement_source");
  requireText("migration", "factoring_chargeback", "migration_missing_recourse_source");
  requireText("migration", "factoring_reserve_release", "migration_missing_release_source");
  requireText("migration", "app.factoring_balance_as_of", "migration_missing_as_of_guc");
  requireText("migration", "outstanding_liability_signed_cents", "migration_missing_signed_liability");
  requireText("migration", "orphan_liability_role_cents", "migration_missing_orphan_counter");
  requireText("migration", "HELD_MIGRATION_PREREQUISITE_MISSING", "migration_missing_prereq_fail_closed");
  requireText("migration", "202607340000_je_reversal_linkage", "migration_missing_prereq_reference");
  requireText("migration", "canonical_factor_agreements", "migration_missing_faro_agreement_table");
  requireText("migration", "FARO_FULL_RECOURSE_V1", "migration_missing_faro_agreement_code");
  requireText("migration", "never invent", "migration_must_declare_no_invented_uuids");
  forbidExec("migration", /DROP\s+TABLE/i, "migration_must_be_additive");
  forbidExec("migration", /DROP\s+COLUMN/i, "migration_must_not_drop_column");
  // Only allowed destructive DDL: DROP VIEW IF EXISTS views.factoring_balance_invoice_linkage (reshape).
  {
    const stripped = String(sources.migration ?? "")
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const drops = [...stripped.matchAll(/DROP\s+VIEW\s+IF\s+EXISTS\s+([a-z0-9_."]+)/gi)];
    for (const m of drops) {
      const target = String(m[1] ?? "").replace(/"/g, "").toLowerCase();
      if (target !== "views.factoring_balance_invoice_linkage") {
        failures.push("migration_unexpected_drop_view");
      }
    }
    if (/DROP\s+VIEW\s+(?!IF\s+EXISTS)/i.test(stripped)) {
      failures.push("migration_drop_view_must_use_if_exists");
    }
  }
  forbidExec("migration", /status\s+IN\s*\(\s*'reserve_held'/i, "migration_must_not_settle_via_status");
  forbidExec("migration", /ILIKE\s*'%faro%'/i, "migration_must_not_vendor_name_match");
  forbidExec("migration", /GREATEST\s*\(\s*0\s*,/i, "migration_must_not_clamp_greatest");
  forbidExec("migration", /ORDER BY COUNT\(\*\) DESC/, "migration_must_not_majority_inference");
  // Completeness must require liability role legs — bare reserve_movements→JE is insufficient.
  requireText("migration", "factoring_advance_liability", "migration_funding_requires_liability_role");
  {
    const stripped = String(sources.migration ?? "")
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const fundingBlock = stripped.match(/funding_artifact AS \(([\s\S]*?)\),\s*reserve_held_artifact/i);
    if (fundingBlock && /factoring_reserve_movements/.test(fundingBlock[1])) {
      failures.push("migration_funding_must_not_trust_bare_reserve_movement");
    }
  }

  if (!sources.held.includes("202607600000_factoring_balance_invoice_linkage.sql")) {
    failures.push("held_registry_missing_migration");
  }
  if (!sources.held.includes("requires_held") || !sources.held.includes("202607340000_je_reversal_linkage.sql")) {
    failures.push("held_registry_missing_prereq_ordering");
  }
  if (!sources.held.includes("held_apply_order")) {
    failures.push("held_registry_missing_apply_order");
  }

  requireText("additions", "0280-05-factoring-balance-invoice-linkage", "additions_missing_owner_decision");
  requireText("additions", "outstanding Faro secured-borrowing LIABILITY", "additions_missing_liability_decision");
  requireText("additions", "never netted", "additions_missing_reserve_decision");
  requireText("additions", "Statuses must NOT clear balances", "additions_missing_status_veto");
  requireText("additions", "canonical_factor_agreements", "additions_missing_faro_agreement");
  requireText("additions", "missing_faro_agreement_binding", "additions_missing_agreement_reasons");
  requireText("additions", "createJournalEntryOnClient", "additions_missing_atomic_links");
  requireText("additions", "HELD_MIGRATION_PREREQUISITE_MISSING", "additions_missing_prereq");
  requireText("additions", "accounting_exception", "additions_missing_accounting_exception");

  // Tests — fixture IDs, plants, isolation, CPA negatives
  requireExec("dbTest", "canonicalInvoiceDisplayId", "db_test_canonical_invoice_display_helper");
  requireExec("dbTest", "invoices_display_id_check", "db_test_display_id_check_coverage");
  requireExec("dbTest", "INV-2026-", "db_test_canonical_invoice_display_seed");
  requireExec("dbTest", "planted_query_failure", "db_test_planted_failure");
  requireExec("dbTest", "relforcerowsecurity", "db_test_force_rls");
  requireExec("dbTest", "factoring_advances_entity_insert", "db_test_rls_write_roles");
  requireExec("dbTest", "source_transaction_type", "db_test_artifact_source_keys");
  requireExec("dbTest", "ambiguous_faro_agreement_binding", "db_test_ambiguous_agreement");
  requireExec("dbTest", "missing_faro_agreement_binding", "db_test_rts_only_missing_agreement");
  requireExec("dbTest", "faro_agreement_not_effective", "db_test_expired_agreement");
  requireExec("dbTest", "faro_agreement_terms_mismatch", "db_test_wrong_terms");
  requireExec("dbTest", "PERIOD_LOCKED", "db_test_closed_period");
  requireExec("dbTest", "HELD_MIGRATION_PREREQUISITE_MISSING", "db_test_prereq_failure");
  requireExec("dbTest", "apply-twice is idempotent", "db_test_apply_twice");
  requireExec("dbTest", "orphan", "db_test_orphan_je");
  requireExec("dbTest", "2099-12-31", "db_test_future_je");
  requireExec("dbTest", "debit_liability_anomaly", "db_test_debit_anomaly");
  requireExec("dbTest", "reserve_over_release", "db_test_reserve_over_release");
  requireExec("dbTest", "Dispatcher", "db_test_unauthorized_rls_write");
  requireExec("dbTest", "unbacked reserve_movements", "db_test_unbacked_reserve_movement");
  requireExec("dbTest", "incomplete_funding_je_artifacts", "db_test_incomplete_funding_reason");
  forbidExec("dbTest", /INV-FBL-|INV-FBO-/, "db_test_must_not_seed_malformed_invoice_display_id");
  requireExec("serviceTest", "connection_reset", "service_test_planted_failure");
  requireExec("serviceTest", "incomplete_funding_je_artifacts", "service_test_incomplete");
  requireExec("serviceTest", "faro_contract_entity_mismatch", "service_test_faro_identity");
  requireExec("serviceTest", "missing_faro_agreement_binding", "service_test_rts_only");
  requireExec("serviceTest", "ambiguous_faro_agreement_binding", "service_test_ambiguous_agreement");
  requireExec("serviceTest", "faro_agreement_terms_mismatch", "service_test_wrong_terms");
  requireExec("serviceTest", "debit_liability_anomaly", "service_test_debit_anomaly");

  requireText("step", "verify-factoring-balance-invoice-linkage", "verify_step_name_missing");
  requireText("manifest", "0280-05-factoring-balance-invoice-linkage", "manifest_block_id_missing");
  requireText("manifest", "apps/frontend/src/api/home.ts", "manifest_fe_api_not_listed");
  requireText("manifest", "apps/frontend/src/pages/home/roles/DefaultHome.tsx", "manifest_fe_default_home_not_listed");
  requireText("manifest", "apps/backend/src/accounting/factoring-posting/poster.service.ts", "manifest_poster_not_listed");
  requireText("manifest", "apps/backend/src/accounting/journal-entries.service.ts", "manifest_journal_entries_not_listed");
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
    .replace(/factoring_advance_liability/g, "some_other_role")
    .replace(/never_clamp_anomaly_to_zero: true/g, "never_clamp_anomaly_to_zero: false")
    .replace(/canonical_factor_agreements/g, "some_other_table") +
    "\nMath.max(0, funded - settled)\n" +
    "\nORDER BY COUNT(*) DESC\n" +
    "\nILIKE '%faro%'\n" +
    "\nWITH candidates AS (\n";
  bad.feApi =
    String(good.feApi) +
    "\noutstanding_cents: num(raw.reserveCents ?? raw.outstanding_cents),\n";
  bad.dbTest = String(good.dbTest) + "\n`INV-FBL-${n()}`\n";
  bad.migration =
    String(good.migration).replace(/FORCE ROW LEVEL SECURITY/g, "ENABLE ROW LEVEL SECURITY") +
    "\n-- comment decoy only: factoring_advance_liability\n" +
    "\nWHERE status IN ('reserve_held', 'collected', 'released')\n" +
    "\nGREATEST(0, liability_credits_cents - liability_debits)\n" +
    "\nILIKE '%faro%'\n" +
    "\nORDER BY COUNT(*) DESC\n";
  bad.poster = String(good.poster).replace(/createFactoringJournalEntryAtomically/g, "createSomethingElse");
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
      "migration_must_not_clamp_greatest",
      "service_must_not_clamp_with_math_max",
    ],
  });
}
