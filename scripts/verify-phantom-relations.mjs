#!/usr/bin/env node
/**
 * Phantom-relation CI guard.
 *
 * Backend services have repeatedly been coded against schema-qualified relations that DO NOT EXIST
 * in prod (dispatch.loads, sales.customers, safety.dvir_reports, fuel.transactions,
 * maintenance.dot_inspection_events, docs.file_categories, ...), throwing 42P01 at runtime. This
 * guard parses every backend SQL FROM/JOIN/INTO/UPDATE target and fails CI if a referenced
 * schema.table is NOT one of:
 *   1. a real prod relation (scripts/canonical-relations.json — a read-only prod snapshot), OR
 *   2. behind a to_regclass()/tableExists()/relationExists() guard in the same file (intentional
 *      progressive-enhancement fallback), OR
 *   3. a frozen, annotated entry in KNOWN_PHANTOM_DEBT (ratchet): relations already known-missing,
 *      each tagged with its disposition (forward-ref to an unbuilt module, or a [HOLD-FOR-JORGE]
 *      financial fix in flight). NEW phantoms outside this set fail the build.
 *
 * Removing a relation from KNOWN_PHANTOM_DEBT (e.g. after its fix merges) means it can never
 * reappear — it would then be unknown debt and fail. That is the regression lock.
 *
 * Usage:
 *   node scripts/verify-phantom-relations.mjs          # CI gate (exit 1 on new phantom)
 *   node scripts/verify-phantom-relations.mjs --list   # print every phantom found, grouped
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// PHANTOM_SCAN_DIR lets the self-test point the scanner at a fixture dir; CI/local default to backend.
const BACKEND = process.env.PHANTOM_SCAN_DIR
  ? join(process.cwd(), process.env.PHANTOM_SCAN_DIR)
  : join(ROOT, "apps", "backend", "src");
const LIST = process.argv.includes("--list");

const canonical = new Set(
  JSON.parse(readFileSync(join(ROOT, "scripts", "canonical-relations.json"), "utf8")).relations,
);
// Real prod schemas (the part before the dot). A `schema.table` is only a candidate phantom when its
// schema actually exists in prod — this filters out SQL table-aliases (qa.name, bp.payment_date),
// JS member access (process.env, index.ts), and forward-refs to entirely-unbuilt schemas
// (insurance.*, telematics.* — those map to pending gap-specs, not 42P01 regressions in a live schema).
const REAL_SCHEMAS = new Set([...canonical].map((r) => r.split(".")[0]));

// Relation names whose table part is actually a function or pseudo-relation, never a base table.
const FUNCTION_LIKE = /^(fn_|recompute_|next_wo_|set_|trg_|refresh_)/;

// Schemas that are clearly not data schemas referenced in app SQL (defensive; none expected).
const NON_DATA_SCHEMAS = new Set(["pg_catalog", "information_schema", "pg_temp"]);

/**
 * Frozen current debt. Each entry: { rel, why }. `rel` must be schema.table. `why` documents the
 * disposition. Shrink this list as fixes merge — never grow it for a NEW bug (fix the bug instead).
 * Snapshot taken 2026-06-25 from `--list` on main; see memory bucket3-phantom-schema-disposition.
 */
const KNOWN_PHANTOM_DEBT = [
  // ── [HOLD-FOR-JORGE] financial fixes in flight (PR #1483) — remove when #1483 merges ──
  // ── bucket-③ HOLD / needs migration or data-model decision ──
  { rel: "accounting.qbo_payroll_links", why: "HOLD payroll — real integrations.qbo_payroll_links is per-run aggregate, not per-employee; needs data-model decision" },
  { rel: "accounting.journal_entry_lines", why: "deprecated dead route (manual-je.routes.deprecated.ts — not served); canonical=accounting.journal_entry_postings; archive, don't revive" },
  // ── section C: degrade-safe but still names the phantom in a comment/fallback path (PR #1485) ──

  // ── forward-refs to unbuilt modules (bucket-4 — map to pending gap-specs, not bugs) ──
  { rel: "insurance.insurance_policies", why: "forward-ref — insurance module unbuilt" },
  { rel: "insurance.insurance_policy_units", why: "forward-ref — insurance module unbuilt" },
  { rel: "fuel.recommended_stops", why: "forward-ref — fuel routing unbuilt" },
  { rel: "fuel.route_recommendations", why: "forward-ref — fuel routing unbuilt" },
  { rel: "samsara.hos_log_edits", why: "forward-ref — Samsara HOS-edit ingest unbuilt" },
  // integrations.samsara_positions REMOVED 2026-07-13 — border-crossing detector now reads the real
  // integrations.samsara_vehicle_positions; no backend SQL references the phantom anymore, so it is
  // locked out (verify-border-crossing-canonical-relations.mjs enforces the two files stay canonical).
  // safety.csa_scores_cache REMOVED 2026-07-13 — safety.routes.ts (KPI dashboard + /csa/latest) now
  // reads the real safety.csa_scores (migration 0051; columns computed_at + per-BASIC numerics), not the
  // phantom cache table. No backend SQL references the phantom anymore, so it is locked out
  // (verify-safety-csa-canonical-read.mjs enforces safety.routes.ts stays on the canonical table).
  { rel: "safety.training_completions", why: "forward-ref — training module unbuilt" },
  { rel: "banking.bank_account_balances", why: "forward-ref — balances cache unbuilt" },
  { rel: "mdata.load_assignments", why: "forward-ref — legacy; canonical=dispatch.load_assignment_history" },
  { rel: "accounting.factoring_companies", why: "forward-ref — canonical=catalogs/mdata factoring refs" },
  { rel: "finance.forecast_scenarios", why: "forward-ref — LV-FINANCE-PLANNING tables ship in migration 202612600000_finance_forecast_scenarios_data_model.sql (on main); not yet in prod canonical-relations.json snapshot. DELETE THIS ENTRY once migration is applied on Neon and scripts/gen-canonical-relations.mjs is regenerated." },
  { rel: "finance.forecast_lines", why: "forward-ref — LV-FINANCE-PLANNING line table ships in migration 202612600000_finance_forecast_scenarios_data_model.sql (on main); not yet in prod canonical-relations.json snapshot. DELETE THIS ENTRY once migration is applied on Neon and scripts/gen-canonical-relations.mjs is regenerated." },
  { rel: "ops.program_board_notes", why: "[HOLD-FOR-JORGE] forward-ref — Program Board two-way notes table ships in gated migration 202607031200 (not yet applied to prod); read path is try/catch degrade-safe. Remove from debt when that migration merges." },
  { rel: "tasks.task_link", why: "[HOLD-FOR-JORGE] forward-ref — Tasks Planner v2 polymorphic task<->record link table ships in gated migration 202607031700_tasks_connectivity.sql (not yet applied to prod); task link/completion routes are build-and-hold and only exercised after the migration lands. Remove from debt when that migration merges." },
  { rel: "driver_finance.driver_settlement_gl_runs", why: "[HOLD-FOR-JORGE] forward-ref — settlement Bill+BillPayment GL posting run/idempotency anchor ships in gated migration 202607060900_settlement_bill_payment_posting.sql (not yet applied to prod); the engine is behind SETTLEMENT_GL_POSTING_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "accounting.ap_import_batches", why: "[HOLD-FOR-JORGE] forward-ref — AF-4 A/P import preview audit table ships in gated migration 202607110310_af4_ap_import_scaffold.sql (not yet applied to prod); AP_IMPORT_ENABLED default OFF and the money-moving write path is not built (design-only, see docs/accounting/AF-4-AF-2-AF-7-DESIGN.md). Remove from debt when that migration merges." },
  { rel: "accounting.ap_import_preview_lines", why: "[HOLD-FOR-JORGE] forward-ref — AF-4 A/P import reviewable bill list ships in gated migration 202607110310_af4_ap_import_scaffold.sql (not yet applied to prod); read/insert-only preview layer, no GL write path. Remove from debt when that migration merges." },
  { rel: "driver_finance.driver_settlement_gl_bills", why: "[HOLD-FOR-JORGE] forward-ref — per-load Bill connectivity table for the settlement Bill+BillPayment engine, ships in gated migration 202607060900_settlement_bill_payment_posting.sql (not yet applied to prod); engine behind SETTLEMENT_GL_POSTING_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "driver_finance.driver_advance_accounts", why: "[HOLD-FOR-JORGE] forward-ref — per-driver cash-advance ASSET account bridge ships in gated migration 202607052300_driver_advance_account_link.sql (not yet applied to prod); the hire-path write is inside a best-effort try/catch (degrade-safe) and the backfill apply path is gated. Remove from debt when that migration merges." },
  { rel: "accounting.factoring_default_interest_accruals", why: "[HOLD-FOR-JORGE] forward-ref — daily default-interest accrual/idempotency anchor for the factoring default-interest + recourse engine; ships in gated migration 202607060000_factoring_default_interest_accruals.sql (not yet applied to prod). The accrual/poster paths are behind the factoring posting flag (default OFF). Remove from debt when that migration merges." },
  { rel: "compliance.appraisal_districts", why: "[HOLD-FOR-JORGE] forward-ref — TX county appraisal-district reference table for business-property-tax renditions; ships in gated migration 202607080300_property_tax_rendition_filing.sql (not yet applied to prod). Property-tax filing/poster paths are build-and-hold (PROPERTY_TAX_GL_POSTING_ENABLED default OFF). Remove from debt when that migration merges." },
  { rel: "compliance.property_tax_renditions", why: "[HOLD-FOR-JORGE] forward-ref — business-property-tax rendition filing header table; ships in gated migration 202607080300_property_tax_rendition_filing.sql (not yet applied to prod). Build-and-hold (PROPERTY_TAX_GL_POSTING_ENABLED default OFF). Remove from debt when that migration merges." },
  { rel: "compliance.property_tax_rendition_lines", why: "[HOLD-FOR-JORGE] forward-ref — per-asset rendition detail lines (unit/equipment linkage) for business-property-tax; ships in gated migration 202607080300_property_tax_rendition_filing.sql (not yet applied to prod). Build-and-hold (PROPERTY_TAX_GL_POSTING_ENABLED default OFF). Remove from debt when that migration merges." },
  { rel: "accounting.property_tax_accruals", why: "[HOLD-FOR-JORGE] forward-ref — property-tax accrual/payment ledger linking rendition → JEs → audit; ships in gated migration 202607080310_property_tax_accrual_posting.sql (not yet applied to prod). Poster is behind PROPERTY_TAX_GL_POSTING_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "accounting.civil_fine_postings", why: "[HOLD-FOR-JORGE] forward-ref — COMPANY-PAID civil-fine expense-JE linkage ledger (fine → JE, JE → fine) for the safety fine-GL hop; ships in gated migration 202608110000_safety_civil_fine_expense_gl_hop.sql (not yet applied to prod). Poster is behind SAFETY_FINE_GL_POSTING_ENABLED (default OFF) AND fails closed until the owner designates the civil_fines_expense role, so it cannot read this table before the migration applies. Remove from debt when that migration merges." },
  { rel: "accounting.parts_purchase_postings", why: "[HOLD-FOR-JORGE] forward-ref — MNT-ECON-01 parts-purchase → bill/JE linkage ledger; ships in gated migration 202609030000_mnt_econ_01_parts_purchase_gl_hop.sql (not yet applied to prod). Poster is behind PARTS_PURCHASE_GL_POSTING_ENABLED (default OFF) AND fails closed until the owner designates maintenance_parts_expense. Remove from debt when that migration merges." },
  { rel: "accounting.warranty_reimburse_postings", why: "[HOLD-FOR-JORGE] forward-ref — MNT-ECON-04 warranty reimburse to JE linkage; ships in gated migration 202609050000_mnt_econ_04_warranty_reimburse_gl_hop.sql (not yet applied to prod). Behind WARRANTY_REIMBURSE_GL_POSTING_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "driver_finance.driver_reimbursements", why: "[HOLD-FOR-JORGE] forward-ref — driver out-of-pocket toll/fuel reimbursement (pay-out) table for the settlement contract-terms engine; ships in gated migration 202607080000_settlement_contract_terms.sql (not yet applied to prod). Compute/poster paths are behind SETTLEMENT_CONTRACT_TERMS_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "driver_finance.settlement_contract_lines", why: "[HOLD-FOR-JORGE] forward-ref — provenance/connectivity backbone tying each computed contract line to its source+settlement+created line/deduction; ships in gated migration 202607080000_settlement_contract_terms.sql (not yet applied to prod). Behind SETTLEMENT_CONTRACT_TERMS_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "driver_finance.settlement_contract_terms_config", why: "[HOLD-FOR-JORGE] forward-ref — per-entity EDITABLE contract amounts (MPG bonus / referral reward) with locked defaults; ships in gated migration 202607080000_settlement_contract_terms.sql (not yet applied to prod). Behind SETTLEMENT_CONTRACT_TERMS_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "accounting.factoring_reserve_movements", why: "[HOLD-FOR-JORGE] forward-ref — CONN-2 Faro Reserve Tracker per-advance reserve movement ledger; ships in gated migration 202607130000_factoring_reserve_movements.sql (not yet applied to prod). Written only as a side effect of postFactoringAdvanceEvent/postFactoringReleaseEvent, both behind FACTORING_GL_POSTING_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "views.factoring_reserve_balances", why: "[HOLD-FOR-JORGE] forward-ref — CONN-2 Faro Reserve Tracker per-advance balance view (held-released), reads accounting.factoring_reserve_movements; ships in gated migration 202607130000_factoring_reserve_movements.sql (not yet applied to prod). Read-only reporting. Remove from debt when that migration merges." },
  { rel: "banking.bank_transaction_splits", why: "HOLD BANK-SPLIT-1 — migration 202607110100 (HELD, .held-migrations.json) creates this table; not yet run on prod" },
  { rel: "safety.company_violation_drivers", why: "[HOLD-FOR-JORGE] forward-ref to HELD 202607820000_safety_relational_linkage_and_lifecycle.sql (safety gated batch, owner work order 2026-07-24). The table + its readers ship in the SAME PR; the owner applies the migration on Neon, then merges. DELETE THIS ENTRY in that merge — leaving it would let a future phantom hide behind it." },
  { rel: "safety.company_violation_units", why: "[HOLD-FOR-JORGE] forward-ref to HELD 202607820000_safety_relational_linkage_and_lifecycle.sql (safety gated batch, owner work order 2026-07-24). The table + its readers ship in the SAME PR; the owner applies the migration on Neon, then merges. DELETE THIS ENTRY in that merge — leaving it would let a future phantom hide behind it." },
  { rel: "safety.company_violation_fines", why: "[HOLD-FOR-JORGE] forward-ref to HELD 202607820000_safety_relational_linkage_and_lifecycle.sql (safety gated batch, owner work order 2026-07-24). The table + its readers ship in the SAME PR; the owner applies the migration on Neon, then merges. DELETE THIS ENTRY in that merge — leaving it would let a future phantom hide behind it." },
  { rel: "driver_finance.escrow_settings", why: "[HOLD-FOR-JORGE] forward-ref to HELD 202607830000_escrow_target_settings.sql (safety gated batch, owner work order 2026-07-24). The table + its readers ship in the SAME PR; the owner applies the migration on Neon, then merges. DELETE THIS ENTRY in that merge — leaving it would let a future phantom hide behind it." },
  { rel: "driver_finance.driver_escrow_separations", why: "[HOLD-FOR-JORGE] forward-ref to HELD 202607111000 driver-escrow separation-return, flag DRIVER_ESCROW_SEPARATION_RETURN_ENABLED default OFF" },
  { rel: "catalogs.payee_tax_profile", why: "[HOLD-FOR-JORGE] forward-ref — BLOCK-17/24 per-payee tax status (W-9 us_person vs W-8BEN) driving 1099-NEC vs 1042-S selection; ships in gated migration 202607130100_block17_24_tax_document_engine.sql (not yet applied to prod). Read-only tax-doc generation behind default-OFF flag. Remove from debt when that migration merges." },
  { rel: "catalogs.tax_form_thresholds", why: "[HOLD-FOR-JORGE] forward-ref — BLOCK-17/24 year-keyed IRS reporting thresholds (e.g. 1099-NEC $600) reference catalog; ships in gated migration 202607130100_block17_24_tax_document_engine.sql (not yet applied to prod). Remove from debt when that migration merges." },
  { rel: "accounting.tax_document_batch", why: "[HOLD-FOR-JORGE] forward-ref — BLOCK-17/24 annual tax-document generation batch header (append-only); ships in gated migration 202607130100_block17_24_tax_document_engine.sql (not yet applied to prod). Remove from debt when that migration merges." },
  { rel: "accounting.tax_document", why: "[HOLD-FOR-JORGE] forward-ref — BLOCK-17/24 immutable generated tax-document record (1099-NEC/1042-S), void-not-delete; ships in gated migration 202607130100_block17_24_tax_document_engine.sql (not yet applied to prod). Remove from debt when that migration merges." },
  { rel: "accounting.form_1099_nec", why: "[HOLD-FOR-JORGE] forward-ref — BLOCK-17/24 per-payee 1099-NEC box-1 detail extending accounting.tax_document; ships in gated migration 202607130100_block17_24_tax_document_engine.sql (not yet applied to prod). Remove from debt when that migration merges." },
  { rel: "factoring.letter_of_release", why: "[HOLD-FOR-JORGE] forward-ref — FACT-PAR-2 Letter of Release lifecycle table; ships in gated migration 202607160000_fact_par2_noa_remit_to.sql (not yet applied to prod). Created in same PR as this forward-ref. Remove from debt when that migration merges." },
  { rel: "accounting.vendor_credit_applications", why: "[HOLD-FOR-JORGE] forward-ref — CUSTVEND-PAR-1 vendor-credit application junction table; ships in gated migration 202607170000_custvend_par1_vendor_credit_applications.sql (not yet applied to prod). Read/insert by vendor-credits.routes.ts apply/void paths; no GL posting. Remove from debt when that migration merges." },
  { rel: "accounting.credit_memo_applications", why: "ACCT-F5606 forward-ref — AR mirror of accounting.vendor_credit_applications (the entry above), the credit-memo-to-invoice application junction table closing LV-CREDITMEMO-NOPATH's AR half; ships in migration 202612811300_acct_f5606_credit_memo_applications.sql in the SAME PR as its reader (accounting/credit-memos.routes.ts apply/void paths; no GL posting). Not gated behind a flag. DELETE THIS ENTRY once the migration is applied on Neon and canonical-relations.json is regenerated." },
  { rel: "mdata.qbo_ap_bill_payments", why: "[HOLD-FOR-JORGE] forward-ref to HELD 202607860000_qbo_ap_bill_payments_inbound_mirror.sql; table+puller ship same PR; owner Neon-applies then merge. DELETE THIS ENTRY when migration applied on prod." },
  { rel: "mdata.qbo_purchases", why: "[HOLD-FOR-JORGE] forward-ref to HELD 202607880000_qbo_purchases_inbound_mirror.sql; table+puller same PR; owner Neon-applies then merge. DELETE THIS ENTRY when applied on prod." },
  { rel: "mdata.qbo_ar_payments", why: "[HOLD-FOR-JORGE] forward-ref to HELD 202607920000_qbo_ar_payments_inbound_mirror.sql; table+puller same PR; owner Neon-applies then merge. DELETE THIS ENTRY when applied on prod." },
  { rel: "maintenance.position_history", why: "[HOLD-FOR-JORGE] forward-ref — SWEEP-C2 repoint 1 of 2, canonical position-history table ships in HELD migration 202609020000_c2_maintenance_position_history_canonical.sql (not yet Neon-applied). The table + its sole reader (safety/position-history/position-history.routes.ts) ship in the SAME PR; the owner applies the migration on Neon, then merges. DELETE THIS ENTRY in that merge." },
  { rel: "banking.reconciliation_matches", why: "[HOLD-FOR-JORGE] forward-ref — SWEEP-C2 repoint 2 of 2 / BANK-DOM-01, canonical bank-reconciliation-match table ships in HELD migration 202609020010_c2_banking_reconciliation_matches_canonical.sql (not yet Neon-applied). The table + all ~11 repointed readers/writers (match.service.ts, recon-worklist.service.ts, bills.service.ts, expenses.routes.ts, month-close.service.ts, banking/p7-wave2.routes.ts, cron/bank-recon-auto-match.cron.ts) ship in the SAME PR; the owner applies the migration on Neon, then merges. DELETE THIS ENTRY in that merge." },
  { rel: "accounting.ob_source_finality", why: "OB-01 forward-ref — the opening-balance DATA GATE (is_final per entity/period). Ships in migration 202610141200_ob01_opening_balance_register.sql in the SAME PR; applied + idempotent-re-applied on a throwaway Neon copy of prod, not yet on prod. DELETE THIS ENTRY once 202610141200 is applied and canonical-relations.json is regenerated." },
  { rel: "accounting.ob_register_staging_lines", why: "OB-01 forward-ref — reviewed opening balances live here until a data-gated commit writes catalogs.accounts. Ships in migration 202610141200_ob01_opening_balance_register.sql in the SAME PR; not yet on prod. DELETE THIS ENTRY once 202610141200 is applied and canonical-relations.json is regenerated." },
  { rel: "accounting.ob_register_audit_events", why: "OB-01 forward-ref — the WORM audit for every opening-balance edit, refusal and commit (append-only trigger + no UPDATE/DELETE grant). Ships in migration 202610141200_ob01_opening_balance_register.sql in the SAME PR; not yet on prod. DELETE THIS ENTRY once 202610141200 is applied and canonical-relations.json is regenerated." },
];
const KNOWN = new Map(KNOWN_PHANTOM_DEBT.map((d) => [d.rel, d.why]));

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      out.push(...walk(full));
    } else if (/\.(ts|mts|cts)$/.test(entry) && !/\.(test|spec)\.[cm]?ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// schema.table immediately after FROM/JOIN/INTO/UPDATE. Escaped dot so "a.b" only — not "a<any>b".
const REL_RE = /\b(?:FROM|JOIN|INTO|UPDATE)\s+("?)([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\1/gi;

function isGuarded(src, rel) {
  // to_regclass('schema.table') / tableExists(client, "schema.table") / relationExists(.., 'schema.table')
  const r = rel.replace(/[.]/g, "\\.");
  return new RegExp(
    `(to_regclass|tableExists|relationExists|regclassExists)\\s*\\([^)]*['"\`]${r}['"\`]`,
    "i",
  ).test(src);
}

const newPhantoms = []; // { file, rel }
const debtSeen = new Set();
const guardedSkipped = [];

for (const file of walk(BACKEND)) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const seen = new Set();
  let m;
  REL_RE.lastIndex = 0;
  while ((m = REL_RE.exec(src))) {
    // char right after the match: if "(", it's a function call, not a relation.
    const after = src[REL_RE.lastIndex];
    if (after === "(") continue;
    const schema = m[2].toLowerCase();
    const table = m[3].toLowerCase();
    const relation = `${schema}.${table}`;
    if (NON_DATA_SCHEMAS.has(schema)) continue;
    if (!REAL_SCHEMAS.has(schema)) continue; // alias / JS member / unbuilt-schema forward-ref
    if (FUNCTION_LIKE.test(table)) continue;
    if (canonical.has(relation)) continue;
    if (seen.has(relation)) continue;
    seen.add(relation);
    if (isGuarded(src, relation)) {
      guardedSkipped.push({ file: rel, rel: relation });
      continue;
    }
    if (KNOWN.has(relation)) {
      debtSeen.add(relation);
      continue;
    }
    newPhantoms.push({ file: rel, rel: relation });
  }
}

if (LIST) {
  const groups = new Map();
  for (const p of [...newPhantoms]) {
    if (!groups.has(p.rel)) groups.set(p.rel, []);
    groups.get(p.rel).push(p.file);
  }
  console.log(`\nUNKNOWN phantoms (would FAIL CI): ${groups.size}`);
  for (const [rel, files] of [...groups].sort()) console.log(`  ✘ ${rel}\n      ${files.join("\n      ")}`);
  console.log(`\nKnown-debt phantoms present (allowlisted): ${debtSeen.size}/${KNOWN.size}`);
  for (const rel of [...debtSeen].sort()) console.log(`  • ${rel} — ${KNOWN.get(rel)}`);
  console.log(`\nGuarded (to_regclass/tableExists) — skipped: ${guardedSkipped.length}`);
  for (const g of guardedSkipped.sort((a, b) => a.rel.localeCompare(b.rel))) console.log(`  ~ ${g.rel}  (${g.file})`);
}

// Stale debt entries (in the list but no longer referenced) — warn so the ratchet stays tight.
const staleDebt = [...KNOWN.keys()].filter((r) => !debtSeen.has(r));
if (staleDebt.length && LIST) {
  console.log(`\nStale debt entries (no longer referenced — safe to delete from KNOWN_PHANTOM_DEBT): ${staleDebt.length}`);
  for (const r of staleDebt.sort()) console.log(`  - ${r}`);
}

if (newPhantoms.length) {
  console.error(`\n✘ phantom-relation guard FAILED — ${newPhantoms.length} reference(s) to non-existent relation(s):\n`);
  for (const p of newPhantoms.sort((a, b) => a.rel.localeCompare(b.rel))) {
    console.error(`    ${p.rel}   ←   ${p.file}`);
  }
  console.error(
    `\nEach references a schema.table not in scripts/canonical-relations.json (real prod relations),\n` +
      `not behind a to_regclass()/tableExists() guard, and not a known forward-ref/HOLD entry.\n` +
      `Fix the relation name (see CLAUDE.md §4), guard it, or — only if it is a genuine forward-ref\n` +
      `to an unbuilt module — add it to KNOWN_PHANTOM_DEBT with a justification.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ phantom-relation guard passed — no new phantoms. ` +
    `(${KNOWN.size} known-debt entries, ${guardedSkipped.length} guarded refs, ${canonical.size} canonical relations)`,
);
