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
  lifecycleRepair: "apps/backend/src/accounting/factoring-posting/lifecycle-repair.ts",
  faroGate: "apps/backend/src/accounting/factoring-posting/faro-agreement-gate.ts",
  defaultInterest: "apps/backend/src/accounting/factoring-posting/default-interest.service.ts",
  faroCsv: "apps/backend/src/factoring/faro-csv-import.ts",
  faroCsvTest: "apps/backend/src/factoring/faro-csv-import.test.ts",
  dataInfra: "apps/backend/src/data-infra/data-infra.service.ts",
  posterAtomicityTest: "apps/backend/src/accounting/factoring-posting/__tests__/poster-lifecycle-atomicity.test.ts",
  lifecycleRepairTest: "apps/backend/src/accounting/factoring-posting/__tests__/lifecycle-repair.test.ts",
  cpaVetoTest: "apps/backend/src/accounting/factoring-posting/__tests__/cpa-veto-eb06028d-remediation.test.ts",
  conn2Test: "apps/backend/src/accounting/factoring-posting/__tests__/conn2-ar-subledger-and-reserve-tracker.test.ts",
  posterDiLifecycleTest: "apps/backend/src/accounting/factoring-posting/__tests__/poster-default-interest-lifecycle.test.ts",
  day95Test: "apps/backend/src/accounting/factoring-posting/__tests__/default-interest-day95-recourse.test.ts",
  chain06DbTest: "apps/backend/src/accounting/factoring-posting/__tests__/chain-06-factoring-ar-tieout.db.test.ts",
  companyDateTest: "apps/backend/src/lib/__tests__/company-business-date.test.ts",
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

function stripCommentsKeepStrings(src, { sql = false } = {}) {
  let s = String(src ?? "");
  // Block comments first (TS docblocks + SQL /* */).
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  if (sql) {
    s = s.replace(/--.*$/gm, "");
  } else {
    // Line comments — keep `https://` URLs.
    s = s.replace(/(^|[^:])\/\/.*$/gm, "$1");
  }
  return s;
}

export function checker(sources) {
  const failures = [];
  const requireText = (key, text, code) => {
    if (!sources[key] || !sources[key].includes(text)) failures.push(code);
  };
  // Executable-only evidence = comment-stripped source (string literals kept for policy/SQL).
  // Rejects `-- decoy` / `// decoy` comment plants. Dead unused string-literal decoys are
  // additionally rejected by identifier-presence plants below (requireIdent) + badFixture.
  // Never fall back to raw full-source includes.
  const requireExec = (key, text, code) => {
    const stripped = stripCommentsKeepStrings(sources[key], { sql: key === "migration" });
    if (!stripped.includes(text)) failures.push(code);
  };
  /**
   * Identifier must appear in executable code OR SQL template bodies.
   * Dead unused string-literal-only decoys (`const x = "ident"`) do NOT satisfy this —
   * stringLiterals are ignored; only code skeleton + sqlTemplates count.
   */
  const requireIdent = (key, ident, code) => {
    const sem = toExecutableSemantics(sources[key] ?? "");
    const inCode = sem.code.includes(ident);
    const inSql = (sem.sqlTemplates ?? []).some((s) => String(s).includes(ident));
    if (!inCode && !inSql) failures.push(code);
  };
  const forbidExec = (key, re, code) => {
    const stripped = stripCommentsKeepStrings(sources[key], { sql: key === "migration" || key === "dbTest" });
    const codeBody = toExecutableSemantics(sources[key] ?? "").code;
    if (re.test(stripped) || re.test(codeBody)) failures.push(code);
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
  requireExec("service", "orphan_unattributed_liability_role_legs", "service_orphan_liability_fail_closed_missing");
  requireExec("service", "voided_advance_without_reversing_je", "service_voided_without_reversal_fail_closed_missing");
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
  // Canonical entity code only — forbid legal_name / TRANSPORTATION string inference.
  forbidExec("service", /\blegal_name\b/i, "service_must_not_infer_legal_name");
  requireExec("service", "isTranspContractEntityCode", "service_must_use_canonical_entity_code_helper");
  forbidExec("service", /\/TRANSPORTATION\/i/, "service_must_not_regex_legal_transportation");
  forbidExec("service", /\/IH\\s\*35\/i/, "service_must_not_regex_legal_ih35");

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
  requireExec("poster", "createJournalEntry(", "poster_must_post_via_createJournalEntry");
  requireExec("poster", "suppressSideEffects: true", "poster_must_suppress_side_effects_until_commit");
  requireExec("poster", "afterInsertBeforeCommit", "poster_must_attach_links_before_commit");
  requireExec("poster", "repairFactoringLifecycleSourceLinksOnClient", "poster_on_client_repair_missing");
  requireExec("poster", "repairFactoringLifecycleSourceLinks", "poster_already_posted_repair_missing");
  requireExec("poster", "afterRepair", "poster_already_posted_atomic_after_repair_missing");
  requireExec("poster", "ensureOpenPeriod", "poster_closed_period_gate_missing");
  requireExec("poster", "failAfterJeBeforeLifecycleLinks", "poster_inject_failure_hook_missing");
  requireExec("poster", "failAfterChargebackRepayBeforeReturn", "poster_chargeback_inject_hook_missing");
  requireExec("poster", "policy_partial_or_ambiguous_recourse", "poster_partial_recourse_policy_missing");
  requireExec("poster", "loadExactLinkedChargebackAmounts", "poster_exact_linked_amounts_missing");
  requireExec("poster", "companyBusinessDate", "poster_company_business_date_missing");
  requireExec("poster", "claimFactoringLifecyclePostingKey", "poster_posting_key_claim_missing");
  requireExec("poster", "factoring_customer_payment", "poster_customer_payment_source_missing");
  requireExec("poster", "factoring_reserve_release", "poster_reserve_release_source_missing");
  requireExec("poster", "factoring_chargeback", "poster_chargeback_source_missing");
  requireExec("poster", "FACTORING_GL_POSTING", "poster_flag_gate_present");
  // Every lifecycle path must post via the atomic helper or funding's inline createJournalEntry+.
  requireExec("poster", "postFactoringCustomerPaymentEvent", "poster_customer_payment_fn_missing");
  requireExec("poster", "postFactoringReleaseEvent", "poster_release_fn_missing");
  requireExec("poster", "postFactoringChargebackEvent", "poster_chargeback_fn_missing");
  requireExec("lifecycleRepair", "findStrictLifecycleRepairCandidate", "lifecycle_repair_strict_candidate_missing");
  requireExec("lifecycleRepair", "attachFactoringLifecycleSourceLinksStrict", "lifecycle_repair_strict_attach_missing");
  requireIdent("lifecycleRepair", "validateLifecycleJeExactShape", "lifecycle_repair_exact_shape_missing");
  requireExec("lifecycleRepair", "factoring_lifecycle_posting_keys", "lifecycle_repair_posting_keys_missing");
  requireExec("lifecycleRepair", "ON CONFLICT", "lifecycle_repair_on_conflict_claim_missing");
  requireExec("lifecycleRepair", "AND source_transaction_id IS NULL", "lifecycle_repair_must_only_fill_null_source");
  requireExec("lifecycleRepair", "factoring_lifecycle_source_link_conflict", "lifecycle_repair_conflict_throw_missing");
  requireIdent("faroGate", "requireEffectiveFaroFullRecourseAgreement", "faro_gate_require_missing");
  requireExec("faroGate", "FARO_FULL_RECOURSE_V1", "faro_gate_code_missing");
  requireIdent("faroGate", "advanceBoundToFaroVendor", "faro_gate_advance_bound_missing");
  requireIdent("poster", "requireEffectiveFaroFullRecourseAgreement", "poster_faro_gate_missing");
  requireExec("poster", "policy_overpayment", "poster_overpayment_policy_missing");
  requireExec("poster", "policy_over_release", "poster_over_release_policy_missing");
  requireExec("poster", "policy_invalid_entry_date", "poster_invalid_date_policy_missing");
  requireExec("poster", "FOR UPDATE", "poster_settlement_lock_missing");
  // In-flight settlement JE must be excluded from outstanding re-check after insert (else self-debit → 0).
  requireExec("poster", "excludeJournalEntryId", "poster_outstanding_must_exclude_inflight_je");
  requireExec("poster", "je.id IS DISTINCT FROM $3::uuid", "poster_outstanding_exclude_sql_missing");
  // Authoritative DB timestamptz::text (space separator) must parse — not only ISO-with-T.
  requireExec("poster", ")[ T](", "poster_must_accept_pg_timestamptz_text");
  requireExec("cpaVetoTest", "Postgres timestamptz::text", "cpa_veto_test_pg_timestamptz_missing");
  requireIdent("poster", "validateLifecycleJeExactShape", "poster_exact_shape_validator_missing");
  requireIdent("poster", "liveJournalEntryNotReversedSql", "poster_reversal_exclusion_missing");
  requireExec("lifecycleRepair", "reversed_by_je_id", "lifecycle_repair_reversal_cols_missing");
  requireIdent("poster", "FactoringLifecyclePostingKeyRaceError", "poster_posting_key_race_missing");
  requireExec("poster", "SAVEPOINT factoring_lifecycle_je_create", "poster_je_savepoint_missing");
  forbidExec("poster", /Math\.min\s*\(\s*inv\.total_cents/, "poster_must_not_mathmin_clamp_payment");
  forbidExec("poster", /return companyBusinessDate\(\)\s*;/, "poster_must_not_fallback_entry_date_to_today");
  requireExec("chain06DbTest", "requireEffectiveFaroFullRecourseAgreement", "chain06_db_must_seed_faro_agreement");
  requireExec("chain06DbTest", "canonical_factor_agreements", "chain06_db_must_insert_faro_agreement");
  // ROOT CAUSE (build-typecheck flake): shared TRANSP + parallel forks deadlocked on
  // factoring_lifecycle_posting_keys composite FKs. Isolation is mandatory — advisory lock alone
  // does not cover the poster's withCurrentUser connection.
  requireExec("chain06DbTest", "createIsolatedOperatingCompany", "chain06_db_must_use_isolated_company");
  requireExec("chain06DbTest", "deactivateIsolatedOperatingCompany", "chain06_db_must_teardown_isolated_company");
  forbidExec(
    "chain06DbTest",
    /companyId\s*=\s*await\s+ensureIntegrationPrerequisites\s*\(/,
    "chain06_db_must_not_use_shared_transp_company"
  );
  // Faro agreement table family serialization under vitest forks (Leg B prepare deadlock).
  requireExec("chain06DbTest", "FARO_CANONICAL_AGREEMENT_TEST_LOCK_KEY", "chain06_db_must_hold_faro_agreement_lock");
  requireExec("dbTest", "FARO_CANONICAL_AGREEMENT_TEST_LOCK_KEY", "db_test_must_hold_faro_agreement_lock");
  requireExec("service", "queryWithDeadlockRetry", "service_faro_query_must_retry_deadlock");
  requireIdent("defaultInterest", "companyBusinessDate", "default_interest_company_business_date_missing");
  requireIdent("defaultInterest", "loadExactLinkedChargebackAmounts", "default_interest_exact_linked_amounts_missing");
  requireIdent("defaultInterest", "requireEffectiveFaroFullRecourseAgreement", "default_interest_faro_gate_missing");
  requireExec("defaultInterest", "factoring_company_vendor_id", "default_interest_faro_vendor_filter_missing");
  forbidExec("defaultInterest", /toISOString\(\)\.slice\(0,\s*10\)/, "default_interest_must_not_utc_slice");
  requireIdent("faroCsv", "requireEffectiveFaroFullRecourseAgreement", "faro_csv_must_use_agreement_gate");
  forbidExec("faroCsv", /ORDER BY COUNT\(\*\) DESC/, "faro_csv_must_not_customer_majority");
  requireExec("faroCsv", "policy_faro_agreement", "faro_csv_fail_closed_missing");
  // CPA VETO 4f44dfbc — atomic CSV + statement-date Faro + DI catch-up before chargeback.
  requireIdent("faroCsv", "upsertFaroDailyImportOnClient", "faro_csv_must_persist_on_client_txn");
  requireIdent("faroCsv", "resolveFaroCsvStatementDate", "faro_csv_statement_date_resolver_missing");
  requireIdent("faroCsv", "ensureDefaultInterestAccruedThroughDate", "faro_csv_must_accrue_di_before_chargeback");
  requireExec("faroCsv", "policy_future_statement_date", "faro_csv_future_statement_policy_missing");
  requireExec("faroCsv", "policy_missing_statement_date", "faro_csv_missing_statement_policy_missing");
  requireExec("faroCsv", "asOfStatementDate", "faro_csv_agreement_as_of_statement_missing");
  requireIdent("dataInfra", "upsertFaroDailyImportOnClient", "data_infra_on_client_upsert_missing");
  requireIdent("defaultInterest", "ensureDefaultInterestAccruedThroughDate", "default_interest_catchup_export_missing");
  requireIdent("poster", "repairChargebackAlreadyPosted", "poster_chargeback_repair_helper_missing");
  requireExec("poster", "SAVEPOINT factoring_chargeback_je_create", "poster_chargeback_savepoint_missing");
  // Chargeback must lock the advance before posting-key / status / outstanding rejection.
  requireExec(
    "poster",
    "await lockFactoringAdvanceForSettlement(client, input.operating_company_id, input.factoring_advance_id)",
    "poster_chargeback_lock_before_keys_missing"
  );
  requireExec("poster", "expected_entry_date: accrualDate", "poster_di_repair_expected_entry_date_missing");
  requireExec("lifecycleRepair", "expected_entry_date", "lifecycle_repair_expected_entry_date_missing");
  requireExec("faroCsvTest", "rejected Faro agreement leaves zero durable CSV rows", "faro_csv_test_reject_no_rows_missing");
  requireExec("faroCsvTest", "as-of statement/economic date", "faro_csv_test_statement_date_agreement_missing");
  requireExec("faroCsvTest", "ensureDefaultInterestAccruedThroughDate runs before exact liability load", "faro_csv_test_missed_cron_order_missing");
  requireExec("cpaVetoTest", "repair_candidate_wrong_entry_date", "cpa_veto_test_di_wrong_entry_date_missing");
  requireExec("cpaVetoTest", "concurrent duplicate retries under row lock", "cpa_veto_test_chargeback_concurrent_missing");
  requireExec("cpaVetoTest", "wrong accrual amount vs contractual math", "cpa_veto_test_di_wrong_amount_missing");
  // CPA VETO 36946df7 follow-on — cumulative paid + liability interest base + agreement immutability.
  requireIdent("poster", "linkedCustomerPaymentPaidCents", "poster_cumulative_paid_helper_missing");
  requireIdent("poster", "defaultInterestOpeningFromOutstandingLiability", "poster_di_opening_from_liability_missing");
  requireExec("poster", "factoring_customer_payment_over_invoice_face: paid=", "poster_cumulative_paid_over_face_missing");
  forbidExec(
    "poster",
    /applyCustomerPaymentSubledgerRelief\([\s\S]{0,120}amountCents/,
    "poster_must_not_pass_latest_allocation_as_paid"
  );
  requireExec("conn2Test", "multi-payment cumulative", "conn2_test_multi_payment_cumulative_missing");
  requireExec(
    "posterDiLifecycleTest",
    "post-payment interest base",
    "poster_di_test_post_payment_base_missing"
  );
  requireExec("migration", "prevent_canonical_factor_agreement_term_mutation", "migration_agreement_term_immutability_missing");
  requireExec("migration", "trg_canonical_factor_agreements_terms_immutable", "migration_agreement_immutability_trigger_missing");
  requireExec("migration", "ADD COLUMN IF NOT EXISTS voided_at", "migration_agreement_voided_at_missing");
  requireExec("migration", "canonical_factor_agreement_terms_immutable", "migration_agreement_immutable_exception_missing");
  requireIdent("service", "voided_at", "service_must_exclude_voided_agreements");
  requireExec("service", "a.voided_at IS NULL", "service_agreement_void_filter_missing");
  requireExec("dbTest", "canonical_factor_agreement_terms_immutable", "db_test_agreement_term_immutability_missing");
  // Dead string-literal decoy must not satisfy identifier plants (CR eb06028d / 36946df7).
  requireIdent("poster", "resolveCanonicalEntryDate", "poster_date_resolver_ident_missing");
  requireExec("journalEntries", "createJournalEntryOnClient", "journal_entries_on_client_missing");
  requireExec("journalEntries", "afterInsertBeforeCommit", "journal_entries_after_insert_hook_missing");
  requireExec("journalEntries", "suppressSideEffects", "journal_entries_suppress_side_effects_missing");
  requireExec("journalEntries", "enqueueJournalEntrySideEffects", "journal_entries_deferred_side_effects_missing");
  requireExec("posterAtomicityTest", "injected_failure_between_je_and_lifecycle_links", "atomicity_test_inject_missing");
  requireExec("posterAtomicityTest", "already_posted path repairs", "atomicity_test_repair_missing");
  requireExec("posterAtomicityTest", "failAfterChargebackRepayBeforeReturn", "atomicity_test_chargeback_inject_missing");
  requireExec("lifecycleRepairTest", "memo_collision", "lifecycle_repair_test_memo_collision_missing");
  requireExec("lifecycleRepairTest", "factoring_lifecycle_source_link_conflict", "lifecycle_repair_test_conflict_missing");
  requireExec("day95Test", "loadExactLinkedChargebackAmounts", "day95_test_exact_linked_missing");
  requireExec("companyDateTest", "Central midnight winter", "company_date_winter_midnight_test_missing");
  requireExec("companyDateTest", "Central midnight summer", "company_date_summer_midnight_test_missing");

  // Migration — hold marker may live in header comments; structural DDL is executable-only.
  requireText("migration", "DO NOT RUN ON PROD", "migration_missing_hold_marker");
  requireExec("migration", "FORCE ROW LEVEL SECURITY", "migration_missing_force_rls");
  requireExec("migration", "factoring_advances_entity_insert", "migration_missing_insert_policy");
  requireExec("migration", "factoring_advances_entity_update", "migration_missing_update_policy");
  requireExec("migration", "factoring_advances_factor_vendor_same_entity_fkey", "migration_missing_same_entity_advance_fk");
  requireExec("migration", "canonical_factor_agreements_vendor_same_entity_fkey", "migration_missing_same_entity_agreement_vendor_fk");
  requireExec("migration", "canonical_factor_agreements_profile_same_entity_fkey", "migration_missing_same_entity_agreement_profile_fk");
  requireExec("migration", "CREATE OR REPLACE VIEW", "migration_must_use_create_or_replace_view");
  requireExec("migration", "DISTINCT ON (jep.id)", "migration_missing_posting_dedup");
  requireExec("migration", "Owner", "migration_missing_owner_role_gate");
  requireExec("migration", "Administrator", "migration_missing_admin_role_gate");
  requireExec("migration", "REVOKE DELETE", "migration_missing_revoke_delete");
  requireExec("migration", "security_invoker", "migration_missing_security_invoker");
  requireExec("migration", "COUNT(DISTINCT i.id)", "migration_missing_distinct_invoice_count");
  requireExec("migration", "factoring_advance_liability", "migration_missing_liability_role");
  requireExec("migration", "factor_reserve_held", "migration_missing_reserve_role");
  requireExec("migration", "source_transaction_type", "migration_missing_source_txn_join");
  requireExec("migration", "transaction_source_links", "migration_missing_tsl_join");
  requireExec("migration", "factoring_customer_payment", "migration_missing_settlement_source");
  requireExec("migration", "factoring_chargeback", "migration_missing_recourse_source");
  requireExec("migration", "factoring_reserve_release", "migration_missing_release_source");
  requireExec("migration", "app.factoring_balance_as_of", "migration_missing_as_of_guc");
  requireExec("migration", "outstanding_liability_signed_cents", "migration_missing_signed_liability");
  requireExec("migration", "orphan_liability_role_cents", "migration_missing_orphan_counter");
  requireExec("migration", "factoring_lifecycle_posting_keys", "migration_missing_lifecycle_posting_keys");
  requireExec("migration", "UNIQUE (operating_company_id, factoring_advance_id, source_transaction_type, event_key)", "migration_missing_posting_key_unique");
  requireExec("migration", "factoring_lifecycle_posting_keys_advance_same_entity_fkey", "migration_missing_posting_key_advance_same_entity_fk");
  requireExec("migration", "factoring_lifecycle_posting_keys_je_same_entity_fkey", "migration_missing_posting_key_je_same_entity_fk");
  requireExec("migration", "uq_factoring_advances_company_id", "migration_missing_advance_company_id_unique");
  requireExec("migration", "uq_journal_entries_company_id", "migration_missing_je_company_id_unique");
  requireExec("migration", "America/Chicago", "migration_missing_chicago_as_of");
  requireExec("migration", "advanced_at AT TIME ZONE 'America/Chicago'", "migration_missing_advanced_at_as_of");
  requireExec("migration", "HELD_MIGRATION_PREREQUISITE_MISSING", "migration_missing_prereq_fail_closed");
  requireExec("migration", "202607340000_je_reversal_linkage", "migration_missing_prereq_reference");
  requireExec("migration", "canonical_factor_agreements", "migration_missing_faro_agreement_table");
  requireExec("migration", "FARO_FULL_RECOURSE_V1", "migration_missing_faro_agreement_code");
  forbidExec("migration", /DROP\s+TABLE/i, "migration_must_be_additive");
  forbidExec("migration", /DROP\s+COLUMN/i, "migration_must_not_drop_column");
  forbidExec("migration", /DROP\s+VIEW/i, "migration_must_not_drop_view");
  forbidExec("migration", /status\s+IN\s*\(\s*'reserve_held'/i, "migration_must_not_settle_via_status");
  forbidExec("migration", /ILIKE\s*'%faro%'/i, "migration_must_not_vendor_name_match");
  forbidExec("migration", /GREATEST\s*\(\s*0\s*,/i, "migration_must_not_clamp_greatest");
  forbidExec("migration", /ORDER BY COUNT\(\*\) DESC/, "migration_must_not_majority_inference");
  // Mutable voided status alone must not drop live JE legs from liability roll.
  {
    const stripped = String(sources.migration ?? "")
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const linkedBlock = stripped.match(/advance_linked_postings AS \(([\s\S]*?)\),\s*liability_legs/i);
    if (linkedBlock && /fa\.status\s*<>\s*'voided'|fa\.status\s*!=\s*'voided'/.test(linkedBlock[1])) {
      failures.push("migration_must_not_drop_liability_via_voided_status");
    }
  }
  // Completeness must require liability role legs — bare reserve_movements→JE is insufficient.
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
  requireText("additions", "afterInsertBeforeCommit", "additions_missing_atomic_links");
  requireText("additions", "HELD_MIGRATION_PREREQUISITE_MISSING", "additions_missing_prereq");
  requireText("additions", "accounting_exception", "additions_missing_accounting_exception");
  requireText("additions", "same-entity", "additions_missing_same_entity");
  requireText("additions", "CREATE OR REPLACE VIEW", "additions_missing_create_or_replace");
  requireText("additions", "isTranspContractEntityCode", "additions_missing_canonical_entity_code");
  requireText("additions", "factoring_lifecycle_posting_keys", "additions_missing_posting_keys");
  requireText("additions", "policy_partial_or_ambiguous_recourse", "additions_missing_partial_recourse_policy");
  requireText("additions", "orphan_unattributed_liability_role_legs", "additions_missing_orphan_fail_closed");
  requireText("additions", "voided_advance_without_reversing_je", "additions_missing_voided_fail_closed");
  requireText("additions", "eb06028d", "additions_missing_eb06028d_veto");
  requireText("additions", "policy_overpayment", "additions_missing_overpayment");
  requireText("additions", "validateLifecycleJeExactShape", "additions_missing_exact_shape");
  requireText("additions", "policy_invalid_entry_date", "additions_missing_invalid_date");
  requireText("additions", "requireEffectiveFaroFullRecourseAgreement", "additions_missing_faro_gate_posting");
  requireText("additions", "4f44dfbc", "additions_missing_4f44dfbc_veto");
  requireText("additions", "upsertFaroDailyImportOnClient", "additions_missing_csv_atomic_upsert");
  requireText("additions", "ensureDefaultInterestAccruedThroughDate", "additions_missing_di_catchup");
  requireText("additions", "repairChargebackAlreadyPosted", "additions_missing_chargeback_lock_repair");
  requireText("additions", "36946df7", "additions_missing_36946df7_veto");
  requireText("additions", "linkedCustomerPaymentPaidCents", "additions_missing_cumulative_paid");
  requireText("additions", "defaultInterestOpeningFromOutstandingLiability", "additions_missing_di_liability_base");
  requireText("additions", "prevent_canonical_factor_agreement_term_mutation", "additions_missing_agreement_immutability");

  // Tests — fixture IDs, plants, isolation, CPA negatives
  requireExec("cpaVetoTest", "policy_overpayment", "cpa_veto_test_overpayment_missing");
  requireExec("cpaVetoTest", "policy_over_release", "cpa_veto_test_over_release_missing");
  requireExec("cpaVetoTest", "policy_invalid_entry_date", "cpa_veto_test_invalid_date_missing");
  requireExec("cpaVetoTest", "repair_candidate_wrong_account_or_amount", "cpa_veto_test_wrong_account_missing");
  requireExec("cpaVetoTest", "reversed-funding", "cpa_veto_test_reversed_funding_missing");
  requireExec("cpaVetoTest", "missing_faro_agreement_binding", "cpa_veto_test_faro_fail_closed_missing");
  requireExec("cpaVetoTest", "factoring_customer_payment_overpayment", "cpa_veto_test_race_overpayment_missing");
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
  requireExec("dbTest", "orphan_unattributed_liability_role_legs", "db_test_orphan_je");
  requireExec("dbTest", "voided_advance_without_reversing_je", "db_test_voided_without_reversal");
  requireExec("dbTest", "2099-12-31", "db_test_future_je");
  requireExec("dbTest", "debit_liability_anomaly", "db_test_debit_anomaly");
  requireExec("dbTest", "reserve_over_release", "db_test_reserve_over_release");
  requireExec("dbTest", "Dispatcher", "db_test_unauthorized_rls_write");
  requireExec("dbTest", "unbacked reserve_movements", "db_test_unbacked_reserve_movement");
  requireExec("dbTest", "incomplete_funding_je_artifacts", "db_test_incomplete_funding_reason");
  forbidExec("dbTest", /INV-FBL-|INV-FBO-/, "db_test_must_not_seed_malformed_invoice_display_id");
  // Orphan must never assert status ok.
  forbidExec("dbTest", /orphan[\s\S]{0,400}status\)\.toBe\("ok"\)/, "db_test_must_not_accept_orphan_as_ok");
  requireExec("feTest", "orphan_unattributed_liability_role_legs", "fe_test_orphan_unverifiable_missing");
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
  requireText("manifest", "apps/backend/src/data-infra/data-infra.service.ts", "manifest_data_infra_not_listed");

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
    String(good.migration)
      .replace(/FORCE ROW LEVEL SECURITY/g, "ENABLE ROW LEVEL SECURITY")
      .replace(/CREATE OR REPLACE VIEW/g, "CREATE VIEW") +
    "\n-- comment decoy only: FORCE ROW LEVEL SECURITY\n" +
    "\n-- comment decoy only: factoring_advance_liability\n" +
    "\n-- comment decoy only: CREATE OR REPLACE VIEW\n" +
    "\nWHERE status IN ('reserve_held', 'collected', 'released')\n" +
    "\nGREATEST(0, liability_credits_cents - liability_debits)\n" +
    "\nILIKE '%faro%'\n" +
    "\nORDER BY COUNT(*) DESC\n" +
    "\nDROP VIEW IF EXISTS views.factoring_balance_invoice_linkage;\n";
  bad.poster =
    String(good.poster).replace(/createFactoringJournalEntryAtomically/g, "createSomethingElse")
      .replace(/validateLifecycleJeExactShape/g, "validateSomethingElse")
      .replace(/liveJournalEntryNotReversedSql/g, "liveSomethingElse")
      .replace(/requireEffectiveFaroFullRecourseAgreement/g, "requireSomethingElse")
      .replace(/FactoringLifecyclePostingKeyRaceError/g, "SomeOtherRaceError")
      .replace(/resolveCanonicalEntryDate/g, "resolveSomethingElse")
      .replace(/linkedCustomerPaymentPaidCents/g, "linkedSomethingElse")
      .replace(/defaultInterestOpeningFromOutstandingLiability/g, "defaultInterestSomethingElse")
      .replace(/repairChargebackAlreadyPosted/g, "repairSomethingElse") +
    '\nconst _dead_decoy_policy = "policy_overpayment";\n' +
    '\nconst _dead_decoy_shape = "validateLifecycleJeExactShape";\n' +
    '\nconst _dead_decoy_paid = "linkedCustomerPaymentPaidCents";\n' +
    '\nconst _dead_decoy_di_open = "defaultInterestOpeningFromOutstandingLiability";\n' +
    '\nconst _dead_decoy_repair = "repairChargebackAlreadyPosted";\n' +
    "\nconst allocated = Math.min(inv.total_cents, allocations.get(inv.id) ?? 0);\n" +
    "\nfunction resolveCanonicalEntryDate(){ return companyBusinessDate(); }\n" +
    "\nasync function applyCustomerPaymentSubledgerRelief(client, opco, advanceId, amountCents) { void amountCents; }\n";
  bad.faroCsv =
    String(good.faroCsv ?? "")
      .replace(/upsertFaroDailyImportOnClient/g, "upsertSomethingElse")
      .replace(/ensureDefaultInterestAccruedThroughDate/g, "ensureSomethingElse")
      .replace(/resolveFaroCsvStatementDate/g, "resolveSomethingElse") +
    "\nORDER BY COUNT(*) DESC\n";
  bad.dataInfra =
    String(good.dataInfra ?? "").replace(/upsertFaroDailyImportOnClient/g, "upsertSomethingElse");
  bad.defaultInterest =
    String(good.defaultInterest ?? "")
      .replace(/requireEffectiveFaroFullRecourseAgreement/g, "requireSomethingElse")
      .replace(/ensureDefaultInterestAccruedThroughDate/g, "ensureSomethingElse");
  bad.poster =
    String(bad.poster).replace(/SAVEPOINT factoring_chargeback_je_create/g, "SAVEPOINT something_else");
  bad.migration =
    String(bad.migration)
      .replace(/prevent_canonical_factor_agreement_term_mutation/g, "prevent_something_else")
      .replace(/trg_canonical_factor_agreements_terms_immutable/g, "trg_something_else")
      .replace(/ADD COLUMN IF NOT EXISTS voided_at/g, "ADD COLUMN IF NOT EXISTS something_else");
  bad.service =
    String(bad.service) +
    "\nconst legal = row.legal_name; /TRANSPORTATION/i.test(legal);\n";
  bad.service = String(bad.service).replace(/a\.voided_at IS NULL/g, "a.something_else IS NULL");
  bad.chain06DbTest =
    String(good.chain06DbTest ?? "")
      .replace(/createIsolatedOperatingCompany/g, "createSomethingElse")
      .replace(/deactivateIsolatedOperatingCompany/g, "deactivateSomethingElse")
      .replace(/FARO_CANONICAL_AGREEMENT_TEST_LOCK_KEY/g, "SOME_OTHER_LOCK_KEY") +
    "\ncompanyId = await ensureIntegrationPrerequisites();\n";
  bad.dbTest = String(bad.dbTest).replace(/FARO_CANONICAL_AGREEMENT_TEST_LOCK_KEY/g, "SOME_OTHER_LOCK_KEY");
  bad.service = String(bad.service).replace(/queryWithDeadlockRetry/g, "querySomethingElse");
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
      "migration_must_not_drop_view",
      "migration_missing_force_rls",
      "service_must_not_clamp_with_math_max",
      "service_must_not_infer_legal_name",
      "poster_cumulative_paid_helper_missing",
      "poster_di_opening_from_liability_missing",
      "poster_must_not_pass_latest_allocation_as_paid",
      "migration_agreement_term_immutability_missing",
      "service_agreement_void_filter_missing",
      // Dead-string regression (CR eb06028d finding 5): the bad fixture removes the real
      // `validateLifecycleJeExactShape` identifier from poster.service but re-introduces it ONLY as an
      // inert string literal (`_dead_decoy_shape`). This violation MUST still fire — it locks the poster
      // exact-shape check to requireIdent (executable/identifier semantics, string literals masked) so it
      // can never be weakened back to a string-permitting requireExec that a dead decoy would satisfy.
      "poster_exact_shape_validator_missing",
      "chain06_db_must_use_isolated_company",
      "chain06_db_must_not_use_shared_transp_company",
      "chain06_db_must_hold_faro_agreement_lock",
      "service_faro_query_must_retry_deadlock",
    ],
  });
}
