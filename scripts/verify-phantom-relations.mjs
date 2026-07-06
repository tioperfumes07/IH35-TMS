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
  { rel: "insurance.policies", why: "forward-ref — insurance module unbuilt" },
  { rel: "fuel.loves_prices_daily", why: "forward-ref — Love's price feed unbuilt" },
  { rel: "fuel.recommended_stops", why: "forward-ref — fuel routing unbuilt" },
  { rel: "fuel.route_recommendations", why: "forward-ref — fuel routing unbuilt" },
  { rel: "samsara.hos_log_edits", why: "forward-ref — Samsara HOS-edit ingest unbuilt" },
  { rel: "integrations.samsara_positions", why: "forward-ref — Samsara positions ingest unbuilt" },
  { rel: "safety.csa_scores_cache", why: "forward-ref — CSA scores cache unbuilt" },
  { rel: "safety.training_completions", why: "forward-ref — training module unbuilt" },
  { rel: "banking.bank_account_balances", why: "forward-ref — balances cache unbuilt" },
  { rel: "mdata.load_assignments", why: "forward-ref — legacy; canonical=dispatch.load_assignment_history" },
  { rel: "documents.evidence_records", why: "forward-ref — legacy docs schema; canonical=docs.*" },
  { rel: "accounting.factoring_companies", why: "forward-ref — canonical=catalogs/mdata factoring refs" },
  { rel: "ops.program_board_notes", why: "[HOLD-FOR-JORGE] forward-ref — Program Board two-way notes table ships in gated migration 202607031200 (not yet applied to prod); read path is try/catch degrade-safe. Remove from debt when that migration merges." },
  { rel: "tasks.task_link", why: "[HOLD-FOR-JORGE] forward-ref — Tasks Planner v2 polymorphic task<->record link table ships in gated migration 202607031700_tasks_connectivity.sql (not yet applied to prod); task link/completion routes are build-and-hold and only exercised after the migration lands. Remove from debt when that migration merges." },
  { rel: "driver_finance.driver_settlement_gl_runs", why: "[HOLD-FOR-JORGE] forward-ref — settlement Bill+BillPayment GL posting run/idempotency anchor ships in gated migration 202607060900_settlement_bill_payment_posting.sql (not yet applied to prod); the engine is behind SETTLEMENT_GL_POSTING_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "driver_finance.driver_settlement_gl_bills", why: "[HOLD-FOR-JORGE] forward-ref — per-load Bill connectivity table for the settlement Bill+BillPayment engine, ships in gated migration 202607060900_settlement_bill_payment_posting.sql (not yet applied to prod); engine behind SETTLEMENT_GL_POSTING_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "driver_finance.driver_advance_accounts", why: "[HOLD-FOR-JORGE] forward-ref — per-driver cash-advance ASSET account bridge ships in gated migration 202607052300_driver_advance_account_link.sql (not yet applied to prod); the hire-path write is inside a best-effort try/catch (degrade-safe) and the backfill apply path is gated. Remove from debt when that migration merges." },
  { rel: "accounting.factoring_default_interest_accruals", why: "[HOLD-FOR-JORGE] forward-ref — daily default-interest accrual/idempotency anchor for the factoring default-interest + recourse engine; ships in gated migration 202607060000_factoring_default_interest_accruals.sql (not yet applied to prod). The accrual/poster paths are behind the factoring posting flag (default OFF). Remove from debt when that migration merges." },
  { rel: "compliance.appraisal_districts", why: "[HOLD-FOR-JORGE] forward-ref — TX county appraisal-district reference table for business-property-tax renditions; ships in gated migration 202607080300_property_tax_rendition_filing.sql (not yet applied to prod). Property-tax filing/poster paths are build-and-hold (PROPERTY_TAX_GL_POSTING_ENABLED default OFF). Remove from debt when that migration merges." },
  { rel: "compliance.property_tax_renditions", why: "[HOLD-FOR-JORGE] forward-ref — business-property-tax rendition filing header table; ships in gated migration 202607080300_property_tax_rendition_filing.sql (not yet applied to prod). Build-and-hold (PROPERTY_TAX_GL_POSTING_ENABLED default OFF). Remove from debt when that migration merges." },
  { rel: "compliance.property_tax_rendition_lines", why: "[HOLD-FOR-JORGE] forward-ref — per-asset rendition detail lines (unit/equipment linkage) for business-property-tax; ships in gated migration 202607080300_property_tax_rendition_filing.sql (not yet applied to prod). Build-and-hold (PROPERTY_TAX_GL_POSTING_ENABLED default OFF). Remove from debt when that migration merges." },
  { rel: "accounting.property_tax_accruals", why: "[HOLD-FOR-JORGE] forward-ref — property-tax accrual/payment ledger linking rendition → JEs → audit; ships in gated migration 202607080310_property_tax_accrual_posting.sql (not yet applied to prod). Poster is behind PROPERTY_TAX_GL_POSTING_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "driver_finance.driver_reimbursements", why: "[HOLD-FOR-JORGE] forward-ref — driver out-of-pocket toll/fuel reimbursement (pay-out) table for the settlement contract-terms engine; ships in gated migration 202607080000_settlement_contract_terms.sql (not yet applied to prod). Compute/poster paths are behind SETTLEMENT_CONTRACT_TERMS_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "driver_finance.settlement_contract_lines", why: "[HOLD-FOR-JORGE] forward-ref — provenance/connectivity backbone tying each computed contract line to its source+settlement+created line/deduction; ships in gated migration 202607080000_settlement_contract_terms.sql (not yet applied to prod). Behind SETTLEMENT_CONTRACT_TERMS_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "driver_finance.settlement_contract_terms_config", why: "[HOLD-FOR-JORGE] forward-ref — per-entity EDITABLE contract amounts (MPG bonus / referral reward) with locked defaults; ships in gated migration 202607080000_settlement_contract_terms.sql (not yet applied to prod). Behind SETTLEMENT_CONTRACT_TERMS_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "accounting.factoring_reserve_movements", why: "[HOLD-FOR-JORGE] forward-ref — CONN-2 Faro Reserve Tracker per-advance reserve movement ledger; ships in gated migration 202607130000_factoring_reserve_movements.sql (not yet applied to prod). Written only as a side effect of postFactoringAdvanceEvent/postFactoringReleaseEvent, both behind FACTORING_GL_POSTING_ENABLED (default OFF). Remove from debt when that migration merges." },
  { rel: "views.factoring_reserve_balances", why: "[HOLD-FOR-JORGE] forward-ref — CONN-2 Faro Reserve Tracker per-advance balance view (held-released), reads accounting.factoring_reserve_movements; ships in gated migration 202607130000_factoring_reserve_movements.sql (not yet applied to prod). Read-only reporting. Remove from debt when that migration merges." },
  { rel: "banking.bank_transaction_splits", why: "HOLD BANK-SPLIT-1 — migration 202607110100 (HELD, .held-migrations.json) creates this table; not yet run on prod" },
  { rel: "driver_finance.driver_escrow_separations", why: "[HOLD-FOR-JORGE] forward-ref to HELD 202607111000 driver-escrow separation-return, flag DRIVER_ESCROW_SEPARATION_RETURN_ENABLED default OFF" },
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
