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
 * rows, 48 resolve via the new journal_entry branch, 8 via the pre-existing invoice branch (now
 * reachable), 19 via the pre-existing bill branch (now reachable) -- 75 of 78 (96%). The
 * remaining 3 rows carry a distinct, tiny-volume subject_type shape
 * (customer_payment/prepaid_purchase) with no resolver branch at all -- a separate, smaller gap,
 * explicitly out of this finding's scope, not silently claimed as fixed here.
 */
import { readFileSync } from "node:fs";

const routesPath = "apps/backend/src/audit/audit-reports.routes.ts";
const src = readFileSync(routesPath, "utf8");

function analyze(src) {
  const failures = [];

  if (!/COALESCE\(ae\.payload->>'resource_type', ae\.payload->>'reversed_entity_type'\) AS subject_type/.test(src)) {
    failures.push(`${routesPath}: audit.audit_events branch no longer falls back to reversed_entity_type for subject_type — journal_entry.reversed rows will go NULL again`);
  }
  if (!/COALESCE\(ae\.payload->>'resource_type', ae\.payload->>'reversed_entity_type'\) AS source_table/.test(src)) {
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

  return failures;
}

function selftest() {
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-audit-void-reversal-subject-resolver --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Mutation 1: drop the reversed_entity_type fallback for subject_type (reverts to the original bug).
  const mutated1 = src.replace(
    "COALESCE(ae.payload->>'resource_type', ae.payload->>'reversed_entity_type') AS subject_type,",
    "(ae.payload->>'resource_type') AS subject_type,"
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

  console.log("verify-audit-void-reversal-subject-resolver --selftest: OK (good file clean, both targeted mutations caught)");
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
  console.log("verify-audit-void-reversal-subject-resolver: OK — reversed_entity_type fallback present, journal_entry subject branch wired end-to-end, entity-scoped");
}
