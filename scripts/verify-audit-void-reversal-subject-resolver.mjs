#!/usr/bin/env node
/**
 * VOID-REVERSAL-REPORT-SUBJECT-NOT-VISIBLE — /reports/audit/void-reversal live-rendered 100
 * real accounting.journal_entry.reversed rows with correct Date/Time/Actor/Source, but every
 * row's Subject column showed "— · Subject — not visible". Root cause, live-verified against
 * prod: CODER-12-VOID-SPINE's payloads carry `reversed_entity_type`/`reversed_entity_id`, but
 * the void-reversal report's audit.audit_events branch only ever extracted subject_type from
 * `payload->>'resource_type'` (a different event source's key naming) — so subject_type was
 * NULL for every one of these rows, meaning the shared auditSubjectProjection() CASE (used by
 * 7 sibling report endpoints) always fell to its ELSE NULL branch regardless of how many
 * subject_type arms it had. `reversed_entity_type` resolves to either 'journal_entry' (a bare
 * value with NO prior resolver branch at all) or 'invoice' (a value the shared resolver already
 * handled correctly, just never reached because subject_type itself was null).
 *
 * Fixed: (1) subject_type/source_table extraction now falls back to
 * payload->>'reversed_entity_type' when resource_type is absent; (2) a new 'journal_entry'
 * branch was added to the SHARED auditSubjectProjection()/auditSubjectJoins() (benefiting all 7
 * sibling audit-report endpoints uniformly, not just void-reversal), joining
 * accounting.journal_entries and projecting memo as the display label.
 *
 * Live-verified against prod (Neon, bypass_rls=lucia, entity-agnostic since journal entries span
 * both USMCA and TRANSP for this event class): of 78 real accounting.journal_entry.reversed
 * rows, 48 resolve via the journal_entry branch, 8 via the invoice branch, 19 via the bill
 * branch, 2 via the customer_payment branch, 1 via the prepaid_purchase branch -- 78 of 78
 * (100%). The customer_payment/prepaid_purchase branches (accounting.payments.display_id,
 * accounting.prepaid_assets COALESCE(asset_number, description)) close the 3-row residual gap
 * this guard's first pass explicitly left open rather than silently claiming covered.
 */
import { readFileSync } from "node:fs";

const routesPath = "apps/backend/src/audit/audit-reports.routes.ts";
const src = readFileSync(routesPath, "utf8");

function analyze(src) {
  const failures = [];

  // VOID-REVERSAL-REPORT-PAYLOAD-SUBJECT-TYPE-VOCABULARY-MISMATCH re-anchor (2026-08-29): the
  // subject_type extraction was folded into a CASE that normalizes raw dotted table-paths to the
  // short vocabulary and adds a THIRD payload->>'entity_type' fallback beyond reversed_entity_type
  // — so it's no longer a bare `COALESCE(...) AS subject_type` alias. Check the two properties
  // that actually matter: the reversed_entity_type fallback is still present in the COALESCE feeding
  // the CASE, and that CASE still resolves to `AS subject_type`.
  if (!/COALESCE\(ae\.payload->>'resource_type', ae\.payload->>'reversed_entity_type'/.test(src)) {
    failures.push(`${routesPath}: audit.audit_events branch no longer falls back to reversed_entity_type for subject_type — journal_entry.reversed rows will go NULL again`);
  }
  if (!/END AS subject_type/.test(src)) {
    failures.push(`${routesPath}: subject_type CASE no longer resolves to AS subject_type`);
  }
  // source_table kept its direct COALESCE-as-alias shape, just with the same third entity_type
  // fallback appended before the closing paren.
  if (!/COALESCE\(ae\.payload->>'resource_type', ae\.payload->>'reversed_entity_type', ae\.payload->>'entity_type'\) AS source_table/.test(src)) {
    failures.push(`${routesPath}: audit.audit_events branch no longer falls back to reversed_entity_type for source_table`);
  }
  if (!/WHEN \$\{alias\}\.subject_type = 'journal_entry' THEN NULLIF\(TRIM\(audit_je\.memo\), ''\)/.test(src)) {
    failures.push(`${routesPath}: shared auditSubjectProjection() no longer has a journal_entry branch`);
  }
  if (!/LEFT JOIN accounting\.journal_entries audit_je\s*\n\s*ON \$\{alias\}\.subject_type = 'journal_entry'/.test(src)) {
    failures.push(`${routesPath}: shared auditSubjectJoins() no longer joins accounting.journal_entries for the journal_entry subject_type`);
  }
  // The join must stay entity-scoped (operating_company_id), matching every sibling join's
  // pattern — an unscoped join here would be a cross-entity leak, not just a label bug.
  if (!/audit_je\.operating_company_id = \$\{alias\}\.operating_company_id/.test(src)) {
    failures.push(`${routesPath}: journal_entry join is not entity-scoped (operating_company_id) — cross-entity leak risk`);
  }

  if (!/WHEN \$\{alias\}\.subject_type = 'customer_payment' THEN NULLIF\(TRIM\(audit_customer_payment\.display_id\), ''\)/.test(src)) {
    failures.push(`${routesPath}: shared auditSubjectProjection() no longer has a customer_payment branch`);
  }
  if (!/WHEN \$\{alias\}\.subject_type = 'prepaid_purchase' THEN NULLIF\(TRIM\(COALESCE\(audit_prepaid\.asset_number, audit_prepaid\.description\)\), ''\)/.test(src)) {
    failures.push(`${routesPath}: shared auditSubjectProjection() no longer has a prepaid_purchase branch`);
  }
  // Re-anchored (2026-08-29): the join grew a second linkage arm (a generic subject_type='task'
  // + source_table='accounting.payments' path, matching the pattern already used elsewhere in
  // this file), wrapping the original condition in an outer `((...) OR (...))`. The functional
  // property this guard cares about — join accounting.payments, keyed on subject_type =
  // 'customer_payment' — is still present, just no longer immediately after `ON` with no parens.
  if (
    !/LEFT JOIN accounting\.payments audit_customer_payment/.test(src) ||
    !/\$\{alias\}\.subject_type = 'customer_payment' AND audit_customer_payment\.id = \$\{alias\}\.subject_id/.test(src)
  ) {
    failures.push(`${routesPath}: shared auditSubjectJoins() no longer joins accounting.payments for customer_payment`);
  }
  if (!/LEFT JOIN accounting\.prepaid_assets audit_prepaid\s*\n\s*ON \$\{alias\}\.subject_type = 'prepaid_purchase'/.test(src)) {
    failures.push(`${routesPath}: shared auditSubjectJoins() no longer joins accounting.prepaid_assets for prepaid_purchase`);
  }
  if (!/audit_customer_payment\.operating_company_id = \$\{alias\}\.operating_company_id/.test(src)) {
    failures.push(`${routesPath}: customer_payment join is not entity-scoped — cross-entity leak risk`);
  }
  if (!/audit_prepaid\.operating_company_id = \$\{alias\}\.operating_company_id/.test(src)) {
    failures.push(`${routesPath}: prepaid_purchase join is not entity-scoped — cross-entity leak risk`);
  }

  return failures;
}

function selftest() {
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-audit-void-reversal-subject-resolver --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Mutation 1: drop the reversed_entity_type fallback everywhere it feeds subject_type/
  // source_table (reverts to the original bug). The fallback is now repeated across every WHEN
  // arm of the subject_type-normalizing CASE, so this must strip ALL occurrences, not just the
  // first, or the still-present copies elsewhere in the CASE would mask the regression.
  const mutated1 = src.replaceAll(
    "COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type', ae.payload->>'entity_type')",
    "(ae.payload->>'resource_type')"
  );
  if (mutated1 === src) {
    console.error("verify-audit-void-reversal-subject-resolver --selftest: mutation 1 setup failed — anchor not found");
    process.exit(1);
  }
  const failures1 = analyze(mutated1);
  if (failures1.length === 0) {
    console.error("verify-audit-void-reversal-subject-resolver --selftest: mutation 1 (drop reversed_entity_type fallback) was not caught");
    process.exit(1);
  }

  // Mutation 2: drop the journal_entry projection branch entirely.
  const mutated2 = src.replace(
    "      WHEN ${alias}.subject_type = 'journal_entry' THEN NULLIF(TRIM(audit_je.memo), '')\n",
    ""
  );
  if (mutated2 === src) {
    console.error("verify-audit-void-reversal-subject-resolver --selftest: mutation 2 setup failed — anchor not found");
    process.exit(1);
  }
  const failures2 = analyze(mutated2);
  if (failures2.length === 0) {
    console.error("verify-audit-void-reversal-subject-resolver --selftest: mutation 2 (drop journal_entry projection branch) was not caught");
    process.exit(1);
  }

  // Mutation 3: drop the customer_payment projection branch entirely.
  const mutated3 = src.replace(
    "      WHEN ${alias}.subject_type = 'customer_payment' THEN NULLIF(TRIM(audit_customer_payment.display_id), '')\n",
    ""
  );
  if (mutated3 === src) {
    console.error("verify-audit-void-reversal-subject-resolver --selftest: mutation 3 setup failed — anchor not found");
    process.exit(1);
  }
  const failures3 = analyze(mutated3);
  if (failures3.length === 0) {
    console.error("verify-audit-void-reversal-subject-resolver --selftest: mutation 3 (drop customer_payment projection branch) was not caught");
    process.exit(1);
  }

  console.log("verify-audit-void-reversal-subject-resolver --selftest: OK (good file clean, all three targeted mutations caught)");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-audit-void-reversal-subject-resolver: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-audit-void-reversal-subject-resolver: OK — reversed_entity_type fallback present, journal_entry/customer_payment/prepaid_purchase subject branches wired end-to-end, entity-scoped");
}
