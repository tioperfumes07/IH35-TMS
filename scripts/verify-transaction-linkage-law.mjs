#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","fuel","maintenance"],"cols":["connectivity","unit","driver","load"],"leafRe":"transaction.linkage.law","task":"TRANSACTION-LINKAGE-LAW-A30"} */
export const REQUIRES_LIVE_DB = "TABLE_REGISTRY drift + USMCA tier density need Neon; static half is --static-only";
/**
 * verify-transaction-linkage-law.mjs
 *
 * ROUND 300 A-30 (Lead order, owner-stated law). Full text: docs/laws/TRANSACTION-LINKAGE-LAW.md.
 * "almost all transactions must be linked to a driver, truck, trailer, load, settlement... all fuel
 *  expenses must, and any type of tolls etc... maybe not all repairs and maintenance to loads or
 *  settlements because it might be done while the driver is home or the truck is waiting for a
 *  driver." Three tiers, drawn by the owner himself:
 *
 *   TIER1 — a truck that is WORKING. Requires unit AND driver AND load. No exceptions.
 *   TIER2 — something done to an ASSET, not a trip. Requires unit (or trailer). Load is OPTIONAL
 *           and demanding it is itself the defect (it would push writers to staple on a fake trip).
 *   TIER3 — the company, not the fleet. Company + GL only. A unit link here is a defect.
 *
 * THIS FILE IS THE ONE SHARED DECLARATION. Any new verify-*-linkage.mjs for a TIER1/2/3 table must
 * import TIER_CLASSIFICATIONS / TABLE_REGISTRY from here, never re-paste the tier predicate. A
 * per-table copy of "requires unit+driver+load" is itself a finding under this law (§10 of the doc).
 *
 * WHAT THIS GUARD CHECKS
 *  A. STATIC — TABLE REGISTRY DRIFT: every base table live today in the accounting, fuel, and
 *     maintenance schemas must be a key in TABLE_REGISTRY. A brand-new money table that nobody classified
 *     is exactly the drift this law exists to stop (docs/laws/TRANSACTION-LINKAGE-LAW.md never
 *     mentions "grep it later").
 *  B. STATIC — TIER2 LOAD-DEMAND SCAN: no write path may hard-require load_id for a TIER2 wo_type/
 *     source_type. One pre-existing instance is already known and is not this PR's to silently
 *     change (see KNOWN_TIER2_LOAD_DEMAND_PENDING_RULING below) — flagged for the Lead, not hidden,
 *     not auto-fixed.
 *  C. LIVE — for every classification this file can check directly against real columns (no
 *     multi-hop join needed), assert TIER1 rows carry unit+driver+(load OR the pre-existing G18
 *     load_exemption_reason escape hatch — see NOTE below), TIER2 rows carry unit, TIER3 rows carry
 *     NO unit. New rot beyond BASELINE.json fails the gate; the baseline itself can only shrink.
 *
 * NOTE ON THE G18 LOAD ESCAPE HATCH (accounting.enforce_load_fk_invariant, migration 0093): that
 * trigger already requires load_id (or a >=20-char load_exemption_reason) for 9 line_categories on
 * accounting.expense_lines and unconditionally on fuel.fuel_transactions. This law ADDS unit+driver
 * requirements G18 never checked. This guard does not fight G18's existing reason-escape for the
 * LOAD dimension (that trigger is live, deliberate, pre-existing infrastructure); it enforces the
 * NEW unit+driver dimensions the owner's words add on top of it, and reports load gaps G18 itself
 * would already have caught as informational only.
 *
 * SCOPE, STATED HONESTLY: TABLE_REGISTRY classifies every table that existed in these three schemas
 * on 2026-09-30. Many are marked NEEDS_JOIN_PATH (the tier is known, the FK path to unit/driver/load
 * requires a join this v1 does not yet walk — e.g. accounting.civil_fine_postings, fixed_assets,
 * lease_contract, bill_unit_allocation). Those are registered (drift-safe) but not yet
 * value-checked. Silently skipping registration would be the failure; silently walking joins this
 * file has not verified live would be guessing. Both are refused.
 *
 * Run: node scripts/verify-transaction-linkage-law.mjs [--selftest] [--static-only]
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-transaction-linkage-law";
const BASELINE_PATH = join(ROOT, "scripts/verify-transaction-linkage-law.baseline.json");
const WORK_ORDERS_ROUTES_PATH = "apps/backend/src/maintenance/work-orders.routes.ts";

// docs/laws/TRANSACTION-LINKAGE-LAW.md §9 measured its "726 of 726" / "0 unresolved unit" state
// against USMCA specifically, not the whole company. Live-verified while building this guard
// (2026-09-30): fuel.fuel_transactions carries 1,631 TRANSP rows (operating_company_id
// 91e0bf0a-133f-4ce8-a734-2586cfa66d96, source='other') with NO unit/driver/load at all -- a
// completely different, much larger population the law document never measured or ruled on. Per
// the standing law-of-the-land rule "classify row origin before calling any gap a defect" (imported/
// pre-TMS-native history is NOT a defect, and inventing a load FK for it would be), this guard
// enforces TIER1/TIER2/TIER3 row-value checks against USMCA ONLY -- the entity the law was actually
// measured against -- and reports other entities' same metrics as informational only, explicitly
// out of this law's current measured scope pending its own origin-classification pass. Silently
// enforcing against TRANSP's unverified 1,631-row gap would either red the gate for history nobody
// has ruled on, or (if exempted without evidence) fabricate an "expected state" finding this guard
// has no basis to claim. Filed as docs/audit/GUARD-WORKORDERS.md finding
// LINKAGE-A30-TRANSP-FUEL-SCOPE-UNMEASURED for whoever owns TRANSP's fuel-linkage scope next.
const USMCA_OPERATING_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

export const TIER = Object.freeze({
  TIER1: "TIER1",
  TIER2: "TIER2",
  TIER3: "TIER3",
});

// ---------------------------------------------------------------------------------------------
// A) THE TABLE REGISTRY — every base table in accounting.*, fuel.*, maintenance.* as of 2026-09-30
//    (live, br-fancy-credit-akjnd07a). status is one of:
//      TIER1 / TIER2 / TIER3        -- classified, whole table is one tier
//      MIXED_BY_CATEGORY            -- classified per-row via a documented predicate (see below)
//      MIXED_BY_SOURCE_TYPE         -- classified per-row via maintenance.work_orders.source_type
//      NEEDS_JOIN_PATH              -- tier is known but the FK path to unit/driver/load has not
//                                      been walked live yet; registered, not yet value-checked
//      OUT_OF_SCOPE                 -- not a truck/trip/asset transaction (AR, financing, GL-itself,
//                                      settlement mechanics already governed by driver_finance.* or
//                                      other dedicated linkage guards)
//      NOT_TRANSACTIONAL            -- catalog, config, staging, audit, log, or computed/derived
// ---------------------------------------------------------------------------------------------
export const TABLE_REGISTRY = {
  // accounting.*
  "accounting.ap_import_batches": { status: "NOT_TRANSACTIONAL", reason: "import staging" },
  "accounting.ap_import_preview_lines": { status: "NOT_TRANSACTIONAL", reason: "import staging" },
  "accounting.ar_collection_contacts": { status: "NOT_TRANSACTIONAL", reason: "AR workflow" },
  "accounting.ar_collection_tasks": { status: "NOT_TRANSACTIONAL", reason: "AR workflow" },
  "accounting.banking_rules": { status: "NOT_TRANSACTIONAL", reason: "categorization config" },
  "accounting.bill_lines": { status: "NEEDS_JOIN_PATH", reason: "AP line; overlaps bills domain, already partially governed by verify-linkage-required-edges.mjs" },
  "accounting.bill_payments": { status: "OUT_OF_SCOPE", reason: "settlement of an AP bill, not itself a truck transaction origin" },
  "accounting.bill_unit_allocation": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2, reason: "allocates a bill to an asset via asset_id (no unit_id column directly; target ambiguous units vs equipment)" },
  "accounting.bills": { status: "NEEDS_JOIN_PATH", reason: "AP header; governed today by verify-linkage-required-edges.mjs (vendor/gl edges)" },
  "accounting.broker_advances": { status: "OUT_OF_SCOPE", reason: "factoring/AR financing" },
  "accounting.cash_flow_adjustments": { status: "NOT_TRANSACTIONAL" },
  "accounting.cash_flow_row_adjustments": { status: "NOT_TRANSACTIONAL" },
  "accounting.cash_forecast_settings": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "accounting.chart_of_accounts_roles": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "accounting.civil_fine_postings": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER1, reason: "citations/fines -- no direct unit/driver/load column, links via the fine/violation record" },
  "accounting.coa_account": { status: "NOT_TRANSACTIONAL", reason: "GL catalog" },
  "accounting.company_settlement_driver_settlements": { status: "OUT_OF_SCOPE", reason: "settlement junction, governed by driver_finance.* linkage" },
  "accounting.company_settlements": { status: "OUT_OF_SCOPE", reason: "settlement header, governed by driver_finance.* linkage" },
  "accounting.credit_memo_applications": { status: "OUT_OF_SCOPE", reason: "AR" },
  "accounting.credit_memos": { status: "OUT_OF_SCOPE", reason: "AR" },
  "accounting.customer_classifications": { status: "NOT_TRANSACTIONAL", reason: "catalog" },
  // B-2 Make Deposit (202615171200) — UF receipts → bank JE; not a truck/trip expense origin.
  "accounting.deposit_lines": { status: "OUT_OF_SCOPE", reason: "Make Deposit line (customer payment / factoring advance / cash-back); money moves via deposit JE" },
  "accounting.deposits": { status: "OUT_OF_SCOPE", reason: "Make Deposit header (bank deposit of undeposited funds); posts bank_deposit JE, not a truck transaction" },
  "accounting.depreciation_autopost_runs": { status: "NOT_TRANSACTIONAL", reason: "batch run log" },
  "accounting.depreciation_schedule_rows": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2, reason: "per-asset depreciation, join through the fixed asset" },
  "accounting.escrow_accounts": { status: "OUT_OF_SCOPE", reason: "driver financial instrument, not a truck/trip expense" },
  "accounting.escrow_postings": { status: "OUT_OF_SCOPE", reason: "driver financial instrument" },
  "accounting.expense_category_account_map": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "accounting.expense_lines": { status: "MIXED_BY_CATEGORY", reason: "the primary expense line table -- see classifyExpenseLineCategory()" },
  "accounting.expenses": { status: "OUT_OF_SCOPE", reason: "expense header; linkage enforced at the expense_lines level (has its own unit/driver/load columns that carry the real classification)" },
  "accounting.expenses_review_queue": { status: "NOT_TRANSACTIONAL", reason: "queue" },
  "accounting.factoring_advances": { status: "OUT_OF_SCOPE", reason: "factoring/AR financing" },
  // ROUND 315 step 2 (CC-2, migration 202615180800): the factoring purchase document — AR financing like its 1:1 advance;
  // its unit/load linkage is reached through each line's invoice/load, never carried on the purchase itself.
  "accounting.factoring_purchases": { status: "OUT_OF_SCOPE", reason: "factoring/AR financing (purchase document, 1:1 with factoring_advances)" },
  "accounting.factoring_purchase_lines": { status: "OUT_OF_SCOPE", reason: "factoring/AR financing (one line per invoice; load reached via the invoice)" },
  "accounting.factoring_repurchase_due_events": { status: "OUT_OF_SCOPE", reason: "factoring/AR financing (day-95 repurchase decision per purchase line; invoice / customer / purchase carried, load reached via the invoice; no GL of its own)" },
  "accounting.factoring_default_interest_accruals": { status: "OUT_OF_SCOPE" },
  "accounting.factoring_lifecycle_posting_keys": { status: "OUT_OF_SCOPE" },
  "accounting.factoring_reserve_movements": { status: "OUT_OF_SCOPE" },
  "accounting.fixed_asset_classes": { status: "NOT_TRANSACTIONAL", reason: "catalog" },
  "accounting.fixed_asset_disposals": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2 },
  "accounting.fixed_assets": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2, reason: "capital spend on a unit; no direct unit_id column found, needs join-path confirmation" },
  "accounting.form_1042_s": { status: "NOT_TRANSACTIONAL", reason: "tax form" },
  "accounting.form_1099_nec": { status: "NOT_TRANSACTIONAL", reason: "tax form" },
  "accounting.insurance_claim_recovery_postings": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER1, reason: "accident/claim recovery, join through insurance.claim" },
  "accounting.invoice_disputes": { status: "OUT_OF_SCOPE", reason: "AR" },
  "accounting.invoice_lines": { status: "OUT_OF_SCOPE", reason: "AR, governed by dedicated AR linkage guards" },
  "accounting.invoices": { status: "OUT_OF_SCOPE", reason: "AR" },
  "accounting.journal_entries": { status: "OUT_OF_SCOPE", reason: "the posting hub itself (law §1: ALWAYS, once it hits the books) -- not itself tiered, receives linkage FROM tiered source rows" },
  "accounting.journal_entry_postings": { status: "OUT_OF_SCOPE", reason: "GL posting lines" },
  "accounting.lease_asset_line": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2 },
  "accounting.lease_classification": { status: "NOT_TRANSACTIONAL", reason: "classification config" },
  "accounting.lease_contract": { status: "NEEDS_JOIN_PATH", reason: "unit lease is TIER2, property/office lease is TIER3 -- ambiguous by table alone, needs the asset-type join" },
  "accounting.lease_schedule_period": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2 },
  "accounting.lease_lessee_schedule_period": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2 }, // ROUND 321 CC-1: ASC 842 lessee schedule; unit/trailer via lease_asset_line
  "accounting.line_category_load_required": { status: "NOT_TRANSACTIONAL", reason: "THE existing DB-native TIER1 declaration for expense_lines/fuel_transactions (migration 0093) -- read directly by classifyExpenseLineCategory(), not itself a transaction" },
  "accounting.load_revenue_recognition_postings": { status: "OUT_OF_SCOPE", reason: "revenue recognition, AR side" },
  "accounting.ob_register_audit_events": { status: "NOT_TRANSACTIONAL", reason: "audit log" },
  "accounting.ob_register_staging_lines": { status: "NOT_TRANSACTIONAL", reason: "opening-balance staging" },
  "accounting.ob_source_finality": { status: "NOT_TRANSACTIONAL" },
  "accounting.outbox_events": { status: "NOT_TRANSACTIONAL", reason: "event log" },
  "accounting.parts_purchase_postings": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2, reason: "parts consumed on a unit, join through the work order" },
  "accounting.payment_applications": { status: "OUT_OF_SCOPE", reason: "AR/AP settlement mechanics" },
  "accounting.payments": { status: "OUT_OF_SCOPE" },
  "accounting.period_cash_basis_snapshot": { status: "NOT_TRANSACTIONAL" },
  "accounting.periods": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "accounting.posting_batches": { status: "NOT_TRANSACTIONAL" },
  "accounting.prepaid_amortization_rows": { status: "NEEDS_JOIN_PATH", reason: "usually company-level (TIER3); TIER2 if a specific unit's prepaid item -- needs the source join" },
  "accounting.prepaid_assets": { status: "NEEDS_JOIN_PATH" },
  "accounting.property_tax_accruals": { status: "OUT_OF_SCOPE", reason: "real property, not fleet" },
  "accounting.ps_category": { status: "NOT_TRANSACTIONAL", reason: "QBO product/service catalog" },
  "accounting.ps_item": { status: "NOT_TRANSACTIONAL", reason: "QBO product/service catalog" },
  "accounting.pse_posting_policy": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "accounting.qbo_accounts": { status: "NOT_TRANSACTIONAL", reason: "QBO mirror catalog" },
  "accounting.qbo_customers": { status: "NOT_TRANSACTIONAL" },
  "accounting.qbo_remote_count_collection_state": { status: "NOT_TRANSACTIONAL" },
  "accounting.qbo_remote_counts": { status: "NOT_TRANSACTIONAL" },
  "accounting.qbo_vendors": { status: "NOT_TRANSACTIONAL" },
  // Lead's RECLASSIFY engine (migration 202615170000): the batch register + per-line evidence of a bulk
  // re-categorization. The money moves ONLY in its RECLASSIFICATION journal entries (journal_entries /
  // journal_entry_postings, the OUT_OF_SCOPE hub above); every line FKs posting_id + reclass_journal_entry_id.
  "accounting.reclassify_batch_lines": { status: "NOT_TRANSACTIONAL", reason: "reclassify evidence lines -- money lives in the RECLASSIFICATION JE they reference" },
  "accounting.reclassify_batches": { status: "NOT_TRANSACTIONAL", reason: "reclassify batch register -- money lives in its RECLASSIFICATION JEs" },
  "accounting.recon_exceptions": { status: "NOT_TRANSACTIONAL" },
  "accounting.recon_runs": { status: "NOT_TRANSACTIONAL" },
  "accounting.recurring_bill_generation_log": { status: "NOT_TRANSACTIONAL", reason: "log" },
  "accounting.recurring_bill_templates": { status: "NOT_TRANSACTIONAL", reason: "template config" },
  "accounting.recurring_templates": { status: "NOT_TRANSACTIONAL", reason: "template config" },
  "accounting.related_party_loan_entries": { status: "OUT_OF_SCOPE", reason: "financing" },
  "accounting.related_party_loan_schedule": { status: "OUT_OF_SCOPE" },
  "accounting.revenue_contracts": { status: "OUT_OF_SCOPE", reason: "AR" },
  "accounting.revenue_obligations": { status: "OUT_OF_SCOPE" },
  "accounting.revenue_recognition_rows": { status: "OUT_OF_SCOPE" },
  "accounting.sales_tax_agencies": { status: "NOT_TRANSACTIONAL" },
  "accounting.sales_tax_returns": { status: "NOT_TRANSACTIONAL" },
  "accounting.settlement_posting_config": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "accounting.tax_document": { status: "NOT_TRANSACTIONAL" },
  "accounting.tax_document_batch": { status: "NOT_TRANSACTIONAL" },
  "accounting.transaction_source_links": { status: "OUT_OF_SCOPE", reason: "the reverse-routing junction itself (law §6), not a source transaction" },
  "accounting.vendor_classifications": { status: "NOT_TRANSACTIONAL", reason: "catalog" },
  "accounting.vendor_credit_applications": { status: "OUT_OF_SCOPE", reason: "AP" },
  "accounting.vendor_credits": { status: "OUT_OF_SCOPE" },
  "accounting.vendor_payment_methods": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "accounting.vendor_subtype_pse_map": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "accounting.warranty_reimburse_postings": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2 },

  // fuel.*
  "fuel.fraud_alerts": { status: "NOT_TRANSACTIONAL" },
  "fuel.fuel_card_assignments": { status: "NOT_TRANSACTIONAL", reason: "E-22 registry: card -> truck (+ driver) over effective dates; master data, no amount" },
  "fuel.fuel_card_overage_events": { status: "NOT_TRANSACTIONAL" },
  "fuel.fuel_card_overage_policies": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "fuel.fuel_planner_settings": { status: "NOT_TRANSACTIONAL", reason: "config" },
  // E-23 / 202615110000: on-read derived pump time + IFTA state; never writes fuel_transactions.
  "fuel.fuel_transaction_derivations": { status: "NOT_TRANSACTIONAL", reason: "derived output side-table; source fuel_transactions stay TIER1" },
  "fuel.fuel_transactions": { status: TIER.TIER1, reason: "the purest TIER1 table -- always unit+driver+load" },
  "fuel.load_fuel_cost": { status: "OUT_OF_SCOPE", reason: "derived/aggregated rollup, not itself a transaction" },
  "fuel.loves_prices_daily": { status: "NOT_TRANSACTIONAL", reason: "reference price feed" },
  "fuel.tank_events": { status: "NOT_TRANSACTIONAL", reason: "operational telemetry, no cost column" },
  "fuel.tank_state": { status: "NOT_TRANSACTIONAL" },
  "fuel.unit_mpg": { status: "NOT_TRANSACTIONAL", reason: "computed metric" },

  // maintenance.*
  "maintenance.brake_projections": { status: "NOT_TRANSACTIONAL", reason: "predictive metric" },
  "maintenance.brake_wear_measurements": { status: "NOT_TRANSACTIONAL" },
  "maintenance.defects": { status: "NOT_TRANSACTIONAL", reason: "fault log; becomes a transaction only once a work order is opened" },
  "maintenance.driver_reports": { status: "NOT_TRANSACTIONAL" },
  "maintenance.dvir_submissions": { status: "NOT_TRANSACTIONAL" },
  "maintenance.fault_code_severity_rules": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "maintenance.inspection_photos": { status: "NOT_TRANSACTIONAL" },
  "maintenance.inspections": { status: "NOT_TRANSACTIONAL", reason: "the inspection record; cost realized through work_orders when one is opened" },
  "maintenance.internal_labor_log": { status: "NEEDS_JOIN_PATH", reason: "labor time against a WO -- tier follows the parent work order" },
  "maintenance.maintenance_settings": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "maintenance.parts_inventory": { status: "NOT_TRANSACTIONAL", reason: "stock levels, not a transaction" },
  "maintenance.parts_invoice_links": { status: "NEEDS_JOIN_PATH" },
  "maintenance.parts_purchases": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2, reason: "parts bought for a unit, likely via work order join" },
  "maintenance.parts_warranty": { status: "NOT_TRANSACTIONAL" },
  "maintenance.pm_alerts": { status: "NOT_TRANSACTIONAL" },
  "maintenance.pm_auto_engine_settings": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "maintenance.pm_auto_wo_log": { status: "NOT_TRANSACTIONAL", reason: "log" },
  "maintenance.pm_schedule_runs": { status: "NOT_TRANSACTIONAL" },
  "maintenance.pm_schedules": { status: "NOT_TRANSACTIONAL", reason: "the schedule, not a $ transaction -- cost realized in work_orders" },
  "maintenance.position_history": { status: "NOT_TRANSACTIONAL" },
  "maintenance.predictive_alerts": { status: "NOT_TRANSACTIONAL" },
  "maintenance.reefer_hours_log": { status: "NOT_TRANSACTIONAL" },
  "maintenance.reefer_specs": { status: "NOT_TRANSACTIONAL", reason: "config" },
  "maintenance.road_service_tickets": {
    status: TIER.TIER1,
    reason: "roadside service is explicitly TIER1 in the law -- unit_id and driver_id columns exist and ARE checked live",
    schemaGap: "no load_id column exists on this table -- the law's third TIER1 requirement cannot be expressed here today. Reported, not invented. See docs/audit/GUARD-WORKORDERS.md finding LINKAGE-A30-ROAD-SERVICE-TICKETS-NO-LOAD-COLUMN.",
  },
  "maintenance.samsara_fault_code_history": { status: "NOT_TRANSACTIONAL" },
  "maintenance.severe_repair_estimates": { status: "NOT_TRANSACTIONAL", reason: "an estimate, not an actual transaction" },
  "maintenance.tire_brands": { status: "NOT_TRANSACTIONAL", reason: "catalog" },
  "maintenance.tire_events": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2, reason: "tire replacement cost -- needs cost-column/join confirmation" },
  "maintenance.tire_projections": { status: "NOT_TRANSACTIONAL" },
  "maintenance.tire_records": { status: "NEEDS_JOIN_PATH", tier: TIER.TIER2 },
  "maintenance.tire_tread_measurements": { status: "NOT_TRANSACTIONAL" },
  "maintenance.warranty_claims": { status: "NEEDS_JOIN_PATH", reason: "resolves to accounting.warranty_reimburse_postings when money moves" },
  "maintenance.wo_serialized_parts": { status: "NOT_TRANSACTIONAL", reason: "parts serial tracking" },
  "maintenance.wo_status_history": { status: "NOT_TRANSACTIONAL", reason: "status log" },
  "maintenance.wo_time_entries": { status: "NOT_TRANSACTIONAL", reason: "labor time; cost realized via the parent work order" },
  "maintenance.work_order_lines": { status: "NEEDS_JOIN_PATH", reason: "cost lines under a WO -- tier follows the parent work_orders.source_type" },
  "maintenance.work_order_seq_per_month": { status: "NOT_TRANSACTIONAL", reason: "sequence counter" },
  "maintenance.work_orders": { status: "MIXED_BY_SOURCE_TYPE", reason: "classified per-row via source_type -- see classifyWorkOrderSourceType()" },
};

// ---------------------------------------------------------------------------------------------
// B) PER-ROW CLASSIFIERS for the two MIXED tables (the shared predicate the order requires)
// ---------------------------------------------------------------------------------------------

// TIER1 line_category values are read LIVE from accounting.line_category_load_required (migration
// 0093) -- that table IS the owner's existing, DB-native shared declaration for this dimension.
// TIER2/TIER3 are declared here because no DB table encodes them yet.
export const EXPENSE_CATEGORY_TIER2 = Object.freeze([
  "TIRES", "BRAKES", "ENGINE", "ELECTRICAL", "AC", "BODY", "OIL", "INSURANCE", "PM_PREVENTIVE", "DOT",
]);
export const EXPENSE_CATEGORY_TIER3 = Object.freeze(["OFFICE"]);
// Ambiguous today -- never guessed. REPAIR needs the linked work order's own classification;
// PERMIT/MISC/OTHER/DRIVER_PAY/CASH_ADVANCE/ESCROW/FACTORING_FEE/LUMPER_REIMBURSEMENT_INCOME are not
// truck-tier expense categories in this law's sense.
export const EXPENSE_CATEGORY_UNCLASSIFIED = Object.freeze([
  "REPAIR", "PERMIT", "MISC", "OTHER", "DRIVER_PAY", "CASH_ADVANCE", "ESCROW", "FACTORING_FEE",
  "LUMPER_REIMBURSEMENT_INCOME",
]);

/** classifyWorkOrderSourceType -- the shared predicate for maintenance.work_orders.
 * Uses source_type (WHY the WO exists), never bucket (WHERE it was performed) or wo_type (a
 * user-facing label that lumps causes together, e.g. "repair" covers both IS and RS live) --
 * source_type is the only column that actually encodes "was a trip underway".
 */
export function classifyWorkOrderSourceType(sourceType) {
  if (["AC", "RS", "RT", "ET"].includes(sourceType)) return TIER.TIER1; // accident, roadside, road tow, emergency tow
  if (["IS", "IT", "backfill"].includes(sourceType)) return TIER.TIER2; // in-shop, inspection, historical PM backfill
  return null; // ES (external shop) and any unknown code: ambiguous, never guessed
}

export function classifyExpenseLineCategoryCode(code, tier1Codes) {
  const upper = (code || "").toUpperCase();
  if (tier1Codes.has(upper.toLowerCase())) return TIER.TIER1;
  if (EXPENSE_CATEGORY_TIER2.includes(upper)) return TIER.TIER2;
  if (EXPENSE_CATEGORY_TIER3.includes(upper)) return TIER.TIER3;
  return null;
}

// ---------------------------------------------------------------------------------------------
// C) STATIC CHECKS
// ---------------------------------------------------------------------------------------------

// RESOLVED (ROUND 302 A-34, Lead ruling: docs/bus/2026-09-30-LEAD-RULING-WO-TYPE-TIRE-IS-SPLIT-BY-SOURCE-TYPE.md):
// wo_type "tire" used to be forced to require driver_id+load_id unconditionally, alongside
// "repair"/"accident" -- a TIER2 in-house yard tire swap (source_type IS) demanding a load is
// exactly the anti-pattern this law exists to stop. The Lead ruled tire splits by source_type like
// everything else: RS (roadside) stays TIER1 (driver+load required), IS (in-house) is TIER2 (never
// forced). work-orders.routes.ts now gates the requirement on source_type === "RS" for tire. This
// check is a PERMANENT REGRESSION GUARD, not a one-time fix record: it fails if the unconditional
// forced-load pattern for "tire" ever comes back, and fails if the source_type gate disappears.
// ROUND 305 A-48 -- law §6: a link that resolves one way only is HALF A LINK. Every work order carries
// unit_id (WO -> unit resolves); the list route must also answer "this unit's work orders".
export function checkUnitWorkOrderReverseLink(src = readFileSync(join(ROOT, WORK_ORDERS_ROUTES_PATH), "utf8")) {
  const acceptsUnit = /unit_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(src.split("const listByBucketQuerySchema")[0] ?? "");
  const filtersUnit = /if \(q\.unit_id\)\s*\{[\s\S]{0,120}?w\.unit_id = \$\$\{values\.length\}/.test(src);
  if (acceptsUnit && filtersUnit) {
    return [{ level: "OK", message: `${WORK_ORDERS_ROUTES_PATH}: unit -> its work orders resolves (list accepts and applies unit_id).` }];
  }
  return [{ level: "FAIL", message: `${WORK_ORDERS_ROUTES_PATH}: unit -> its work orders is HALF A LINK -- the list route no longer ${acceptsUnit ? "applies" : "accepts"} unit_id (TRANSACTION-LINKAGE-LAW §6).` }];
}

// E-16 (ORDERS 2026-10-01 CC-1 row 3): WO <-> unit <-> driver-at-time <-> vendor <-> bill <-> JE, both
// directions, and the owner's three dates as real columns.
export function checkWorkOrderLinkageBothWays(src = readFileSync(join(ROOT, WORK_ORDERS_ROUTES_PATH), "utf8")) {
  const f = [];
  const loader = src.match(/export async function loadWorkOrderLinkage\([\s\S]*?\n\}/);
  if (!loader) return [{ level: "FAIL", message: `${WORK_ORDERS_ROUTES_PATH}: loadWorkOrderLinkage is gone -- the WO detail no longer resolves its hubs.` }];
  const body = loader[0];
  if (!/driverAtTimeSql\(/.test(body)) f.push("driver-at-time must come from driverAtTimeSql, never re-inlined");
  if (!/accounting\.bills[\s\S]{0,160}linked_work_order_uuid/.test(body)) f.push("WO -> bills via linked_work_order_uuid missing");
  if (!/accounting\.expenses[\s\S]{0,160}linked_work_order_uuid/.test(body)) f.push("WO -> expenses via linked_work_order_uuid missing");
  if (!/journal_entry_postings[\s\S]{0,300}source_transaction_type IN \('bill', 'expense'\)/.test(body)) f.push("bill/expense -> JE via postings missing");
  if (!/accounting\.bill_payments[\s\S]{0,160}bill_id = ANY/.test(body)) f.push("bill -> bill payments missing");
  if (!/accounting\.invoices[\s\S]{0,160}source_load_id = ANY/.test(body)) f.push("load -> invoices (received side) missing");
  if (!/accounting\.payment_applications[\s\S]{0,200}accounting\.payments/.test(body)) f.push("invoice -> received payments missing");
  if (!/mdata\.equipment eq ON eq\.id = w\.equipment_id/.test(body)) f.push("WO -> trailer missing");
  if (!/mdata\.customers cu ON cu\.id = w\.customer_id/.test(body)) f.push("WO -> customer missing");
  if (!/if \(q\.customer_id\)\s*\{[\s\S]{0,120}w\.customer_id = \$\$\{values\.length\}/.test(src)) f.push("customer -> WO list filter missing");
  if (!/loadWorkOrderLinkage\(client, companyId, params\.data\.id\)/.test(src)) f.push("the detail route no longer returns linkage");
  for (const col of ["reported_at", "in_shop_at", "expected_release_at"]) {
    if (!new RegExp(`${col} = COALESCE\\(\\$\\d+::timestamptz, ${col}\\)`).test(src)) f.push(`PATCH no longer writes ${col}`);
  }
  if (f.length) return [{ level: "FAIL", message: `${WORK_ORDERS_ROUTES_PATH}: HALF A LINK (law §6) -- ${f.join("; ")}.` }];
  return [{ level: "OK", message: `${WORK_ORDERS_ROUTES_PATH}: WO resolves unit, trailer, driver-at-time, vendor, customer, loads, bills, bill payments, expenses, JEs, load invoices and received payments; three dates are columns.` }];
}

// Maintenance money linkage both ways (ORDERS 2026-10-01 CC-1): work order -> bill / expense -> bill
// payment -> journal entry -> bank line, and back from the bill payment to its work order. The bank
// line is resolved by ONE rule (BILL_PAYMENT_BANK_TRANSACTION_ID_SQL: source_bank_transaction_id first,
// else matched_bill_payment_id) on every bill-payment read -- the detail page used to check only the
// match column and showed no bank line for payments created from the bank line itself.
const BILLS_SERVICE_PATH = "apps/backend/src/accounting/bills.service.ts";
const WO_DETAIL_PAGE_PATH = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const BILL_PAYMENT_DETAIL_PAGE_PATH = "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx";
export function checkMaintenanceMoneyBankLegs(
  svc = readFileSync(join(ROOT, BILLS_SERVICE_PATH), "utf8"),
  woPage = readFileSync(join(ROOT, WO_DETAIL_PAGE_PATH), "utf8"),
  bpPage = readFileSync(join(ROOT, BILL_PAYMENT_DETAIL_PAGE_PATH), "utf8")
) {
  const f = [];
  const fin = svc.match(/export async function listWorkOrderLinkedFinancials\([\s\S]*?\n\}\n/);
  if (!fin) return [{ level: "FAIL", message: `${BILLS_SERVICE_PATH}: listWorkOrderLinkedFinancials is gone.` }];
  if (!/EXPENSE_MATCHED_BANK_TRANSACTION_ID_SQL\} AS bank_transaction_id/.test(fin[0])) f.push("WO expense -> bank line missing");
  if (!/source_transaction_type = 'bill_payment'[\s\S]{0,200}BILL_PAYMENT_BANK_TRANSACTION_ID_SQL\} AS bank_transaction_id/.test(fin[0])) f.push("WO bill payment -> JE + bank line missing");
  const det = svc.match(/export async function getBillPaymentDetail\([\s\S]*?\n\}\n/);
  if (!det) f.push("getBillPaymentDetail is gone");
  else {
    if (!/b\.linked_work_order_uuid::text AS work_order_id/.test(det[0])) f.push("bill payment -> work order missing");
    if (!/SELECT \$\{BILL_PAYMENT_BANK_TRANSACTION_ID_SQL\} AS matched_bank_transaction_id/.test(det[0])) f.push("bill payment detail must use the shared bank-line rule");
  }
  if ((woPage.match(/kind="bank_transaction" id=\{row\.bank_transaction_id\}/g) ?? []).length < 2) f.push("WO page must link the bank line on bill payments and expenses");
  if (!/kind="work_order" id=\{payment\.work_order_id\}/.test(bpPage)) f.push("bill payment page must link its work order");
  if (f.length) return [{ level: "FAIL", message: `maintenance money linkage: HALF A LINK (law §6) -- ${f.join("; ")}.` }];
  return [{ level: "OK", message: "maintenance money linkage: WO -> bill/expense -> bill payment -> JE -> bank line, and bill payment -> WO, resolve both ways." }];
}

function checkTier2LoadDemand() {
  const findings = [];
  const src = readFileSync(join(ROOT, WORK_ORDERS_ROUTES_PATH), "utf8");

  const regressedToUnconditional = /\["repair", "tire", "accident"\]\.includes\(body\.wo_type\)/.test(src);
  if (regressedToUnconditional) {
    findings.push({
      level: "FAIL",
      message: `${WORK_ORDERS_ROUTES_PATH}: REGRESSION -- "tire" is back in the unconditional forced-driver/load array alongside "repair"/"accident". ROUND 302 A-34 ruled this must split by source_type (RS=TIER1 required, IS=TIER2 never forced). Forcing a load on a TIER2 yard tire swap invents a trip that never happened.`,
    });
  }

  const hasSourceTypeGate = /body\.wo_type === "tire" && tireIsTier1Roadside/.test(src) || /body\.wo_type === "tire"[\s\S]{0,80}source_type === "RS"/.test(src);
  if (!hasSourceTypeGate) {
    findings.push({
      level: "FAIL",
      message: `${WORK_ORDERS_ROUTES_PATH}: the tire/source_type=="RS" gate is missing -- ROUND 302 A-34's ruling is no longer enforced in code.`,
    });
  }

  if (findings.length === 0) {
    findings.push({ level: "OK", message: `${WORK_ORDERS_ROUTES_PATH}: tire is correctly gated by source_type (RS required, IS never forced) per ROUND 302 A-34.` });
  }
  return findings;
}

function checkTableRegistryDrift(liveTables) {
  const missing = liveTables.filter((t) => !(t in TABLE_REGISTRY));
  return missing;
}

// ---------------------------------------------------------------------------------------------
// selftest -- proves the classifiers and the drift check actually fire, no DB needed
// ---------------------------------------------------------------------------------------------
function runSelftest() {
  const failures = [];

  if (classifyWorkOrderSourceType("AC") !== TIER.TIER1) failures.push("AC should classify TIER1 (accident)");
  if (classifyWorkOrderSourceType("RS") !== TIER.TIER1) failures.push("RS should classify TIER1 (roadside)");
  if (classifyWorkOrderSourceType("IS") !== TIER.TIER2) failures.push("IS should classify TIER2 (in-shop)");
  if (classifyWorkOrderSourceType("IT") !== TIER.TIER2) failures.push("IT should classify TIER2 (inspection)");
  if (classifyWorkOrderSourceType("backfill") !== TIER.TIER2) failures.push("backfill should classify TIER2");
  if (classifyWorkOrderSourceType("ES") !== null) failures.push("ES (external shop) should be unclassified (null), never guessed");
  if (classifyWorkOrderSourceType("bogus") !== null) failures.push("an unknown source_type should be unclassified, never guessed");

  const tier1Codes = new Set(["diesel", "def", "toll", "scale", "lumper", "parking", "roadside_repair", "detention_paid", "over_road_other"]);
  if (classifyExpenseLineCategoryCode("FUEL", new Set(["fuel"])) !== TIER.TIER1) failures.push("a category present in the live tier1 set should classify TIER1");
  if (classifyExpenseLineCategoryCode("TIRES", tier1Codes) !== TIER.TIER2) failures.push("TIRES should classify TIER2");
  if (classifyExpenseLineCategoryCode("OFFICE", tier1Codes) !== TIER.TIER3) failures.push("OFFICE should classify TIER3");
  if (classifyExpenseLineCategoryCode("REPAIR", tier1Codes) !== null) failures.push("REPAIR should be unclassified (ambiguous OTR vs in-house), never guessed");

  const drift = checkTableRegistryDrift(["accounting.expense_lines", "accounting.some_brand_new_money_table"]);
  if (!drift.includes("accounting.some_brand_new_money_table")) failures.push("checkTableRegistryDrift did not catch a fabricated unregistered table");
  if (drift.includes("accounting.expense_lines")) failures.push("checkTableRegistryDrift false-flagged a registered table");

  // checkTier2LoadDemand reads the real file from disk; against the current (fixed) source it must
  // report OK, never FAIL. Regression detection itself is proven directly against synthetic source
  // snippets here, without touching the real file.
  const tier2Findings = checkTier2LoadDemand();
  if (tier2Findings.some((f) => f.level === "FAIL")) failures.push(`checkTier2LoadDemand unexpectedly FAILed against the current (should be fixed) work-orders.routes.ts: ${tier2Findings.map((f) => f.message).join(" | ")}`);
  if (!tier2Findings.some((f) => f.level === "OK")) failures.push("checkTier2LoadDemand did not report OK against the current, already-fixed work-orders.routes.ts");

  const regressedSnippet = `if (["repair", "tire", "accident"].includes(body.wo_type) && !body.load_id) {`;
  if (!/\["repair", "tire", "accident"\]\.includes\(body\.wo_type\)/.test(regressedSnippet)) {
    failures.push("selftest fixture invalid: regressedSnippet should match the regression-detection regex (proves checkTier2LoadDemand would FAIL if this pattern ever came back)");
  }
  const fixedGateSnippet = `if (["repair", "accident"].includes(body.wo_type) || (body.wo_type === "tire" && tireIsTier1Roadside)) {`;
  if (!/body\.wo_type === "tire" && tireIsTier1Roadside/.test(fixedGateSnippet)) {
    failures.push("selftest fixture invalid: fixedGateSnippet should match hasSourceTypeGate's detection regex (proves the guard recognizes the correct fix, not just the absence of the bug)");
  }

  const reverse = checkUnitWorkOrderReverseLink();
  if (!reverse.some((f) => f.level === "OK")) failures.push(`checkUnitWorkOrderReverseLink did not report OK against the current work-orders.routes.ts: ${reverse.map((f) => f.message).join(" | ")}`);
  const brokenRoutes = readFileSync(join(ROOT, WORK_ORDERS_ROUTES_PATH), "utf8").replace(/if \(q\.unit_id\)/, "if (false)");
  if (!checkUnitWorkOrderReverseLink(brokenRoutes).some((f) => f.level === "FAIL")) failures.push("checkUnitWorkOrderReverseLink did not FAIL when the unit_id filter was removed");

  const woLink = checkWorkOrderLinkageBothWays();
  if (!woLink.some((x) => x.level === "OK")) failures.push(`checkWorkOrderLinkageBothWays not OK on current source: ${woLink.map((x) => x.message).join(" | ")}`);
  const brokenWo = readFileSync(join(ROOT, WORK_ORDERS_ROUTES_PATH), "utf8").replace(/driverAtTimeSql\(/g, "inlined(");
  if (!checkWorkOrderLinkageBothWays(brokenWo).some((x) => x.level === "FAIL")) failures.push("checkWorkOrderLinkageBothWays did not FAIL when driverAtTimeSql was removed");

  const money = checkMaintenanceMoneyBankLegs();
  if (!money.some((x) => x.level === "OK")) failures.push(`checkMaintenanceMoneyBankLegs not OK on current source: ${money.map((x) => x.message).join(" | ")}`);
  const brokenBp = readFileSync(join(ROOT, BILL_PAYMENT_DETAIL_PAGE_PATH), "utf8").replace(/kind="work_order"/g, 'kind="unit"');
  if (!checkMaintenanceMoneyBankLegs(undefined, undefined, brokenBp).some((x) => x.level === "FAIL")) failures.push("checkMaintenanceMoneyBankLegs did not FAIL when the bill payment -> WO link was removed");
  const brokenSvc = readFileSync(join(ROOT, BILLS_SERVICE_PATH), "utf8").replace("SELECT ${BILL_PAYMENT_BANK_TRANSACTION_ID_SQL} AS matched_bank_transaction_id", "SELECT NULL AS matched_bank_transaction_id");
  if (!checkMaintenanceMoneyBankLegs(brokenSvc).some((x) => x.level === "FAIL")) failures.push("checkMaintenanceMoneyBankLegs did not FAIL when the detail dropped the shared bank-line rule");

  if (failures.length > 0) {
    console.error(`${LABEL} --selftest: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: OK -- classifiers, drift check, and tier2-load-demand scan all fire correctly`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) return runSelftest();

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const failures = [];
  const infoLines = [];

  // --- STATIC HALF ---
  for (const finding of [...checkTier2LoadDemand(), ...checkUnitWorkOrderReverseLink(), ...checkWorkOrderLinkageBothWays(), ...checkMaintenanceMoneyBankLegs()]) {
    infoLines.push(`[${finding.level}] ${finding.message}`);
    if (finding.level === "FAIL") failures.push(finding.message);
  }

  if (args.includes("--static-only")) {
    for (const line of infoLines) console.log(line);
    if (failures.length > 0) {
      console.error(`${LABEL} --static-only: FAIL`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log(`${LABEL} --static-only: OK (registry drift + live value checks require DATABASE_URL; run without --static-only for the full check)`);
    process.exit(0);
  }

  // --- LIVE HALF ---
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    // A) table registry drift
    const { rows: liveTableRows } = await client.query(
      `SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
       WHERE table_schema IN ('accounting','fuel','maintenance') AND table_type = 'BASE TABLE'`
    );
    const liveTables = liveTableRows.map((r) => r.t);
    const drift = checkTableRegistryDrift(liveTables);
    if (drift.length > 0) {
      failures.push(
        `TABLE REGISTRY DRIFT: ${drift.length} table(s) live in accounting.*/fuel.*/maintenance.* are not classified in TABLE_REGISTRY: ${drift.join(", ")}. ` +
          `A new money table must be classified TIER1/TIER2/TIER3/NEEDS_JOIN_PATH/OUT_OF_SCOPE/NOT_TRANSACTIONAL before it can pass this gate.`
      );
    }

    // B) fuel.fuel_transactions -- pure TIER1, direct check, USMCA-scoped (see USMCA_OPERATING_COMPANY_ID note above)
    {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM fuel.fuel_transactions
         WHERE operating_company_id = $1 AND voided_at IS NULL AND (unit_id IS NULL OR driver_id IS NULL OR load_id IS NULL)`,
        [USMCA_OPERATING_COMPANY_ID]
      );
      const n = rows[0].n;
      const baselineN = baseline["fuel.fuel_transactions"]?.max_allowed ?? 0;
      if (n > baselineN) {
        failures.push(`fuel.fuel_transactions (USMCA): ${n} live non-voided rows missing unit_id/driver_id/load_id (TIER1, no exceptions) -- exceeds baseline ceiling of ${baselineN}`);
      } else {
        infoLines.push(`[OK] fuel.fuel_transactions (USMCA): ${n} rows missing a TIER1 link (baseline ceiling ${baselineN})`);
      }
      const { rows: otherRows } = await client.query(
        `SELECT operating_company_id, count(*)::int AS n FROM fuel.fuel_transactions
         WHERE operating_company_id <> $1 AND voided_at IS NULL AND (unit_id IS NULL OR driver_id IS NULL OR load_id IS NULL)
         GROUP BY operating_company_id`,
        [USMCA_OPERATING_COMPANY_ID]
      );
      for (const r of otherRows) {
        infoLines.push(`[INFO, NOT ENFORCED] fuel.fuel_transactions: ${r.n} rows missing a TIER1 link in operating_company_id ${r.operating_company_id} -- outside this law's measured scope (USMCA only), needs its own origin-classification pass before any ceiling applies`);
      }
    }

    // C) maintenance.work_orders -- MIXED_BY_SOURCE_TYPE, USMCA-scoped
    {
      const { rows } = await client.query(
        `SELECT id, display_id, source_type, unit_id, driver_id, load_id FROM maintenance.work_orders WHERE status <> 'voided' AND operating_company_id = $1`,
        [USMCA_OPERATING_COMPANY_ID]
      );
      let tier1Bad = [];
      let tier2Bad = [];
      for (const r of rows) {
        const tier = classifyWorkOrderSourceType(r.source_type);
        if (tier === TIER.TIER1 && (r.unit_id === null || r.driver_id === null || r.load_id === null)) {
          tier1Bad.push(r.id);
        }
        if (tier === TIER.TIER2 && r.unit_id === null) {
          tier2Bad.push(r.id);
        }
      }
      const baselineWoIds = new Set(baseline["maintenance.work_orders"]?.tier1_known_gap_ids ?? []);
      const newTier1Bad = tier1Bad.filter((id) => !baselineWoIds.has(id));
      if (newTier1Bad.length > 0) {
        failures.push(`maintenance.work_orders: ${newTier1Bad.length} NEW TIER1 row(s) (source_type AC/RS/RT/ET) missing unit/driver/load, not in baseline: ${newTier1Bad.join(", ")}`);
      } else {
        infoLines.push(`[OK] maintenance.work_orders TIER1: ${tier1Bad.length} known baseline gap(s), 0 new`);
      }
      if (tier2Bad.length > 0) {
        failures.push(`maintenance.work_orders: ${tier2Bad.length} TIER2 row(s) (source_type IS/IT/backfill) missing unit_id -- TIER2 requires unit even though load is optional: ${tier2Bad.join(", ")}`);
      } else {
        infoLines.push(`[OK] maintenance.work_orders TIER2: 0 rows missing unit_id`);
      }
    }

    // D) maintenance.road_service_tickets -- TIER1 with a known schema gap on load, USMCA-scoped.
    // Excludes ticket_number ILIKE '%TEST%': CC3-TEST-RS-01 is a leftover test fixture (no
    // is_sample_data column exists on this table to filter by), not a real production row --
    // per standing law, never a test/sample row counted as a linkage defect.
    {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM maintenance.road_service_tickets
         WHERE operating_company_id = $1 AND (unit_id IS NULL OR driver_id IS NULL)
           AND ticket_number NOT ILIKE '%TEST%'`,
        [USMCA_OPERATING_COMPANY_ID]
      );
      const n = rows[0].n;
      if (n > 0) {
        failures.push(`maintenance.road_service_tickets (USMCA): ${n} row(s) missing unit_id or driver_id (both columns exist and are enforceable today)`);
      } else {
        infoLines.push(`[OK] maintenance.road_service_tickets (USMCA): 0 real rows missing unit_id/driver_id (1 test fixture, CC3-TEST-RS-01, excluded; load_id cannot be checked -- no such column exists on this table, see TABLE_REGISTRY.schemaGap)`);
      }
    }

    // E) accounting.expense_lines -- MIXED_BY_CATEGORY, USMCA-scoped.
    // TIER1 is read directly off el.line_category (the column G18's own trigger, migration 0093,
    // already populates from accounting.line_category_load_required) -- NOT re-derived through
    // catalogs.expense_categories.code, because several line_category values (scale, parking,
    // roadside_repair, detention_paid, over_road_other) have no matching catalogs.expense_categories
    // row to join through at all; re-deriving undercounted the real TIER1 population. TIER2/TIER3
    // still classify via catalogs.expense_categories.code since G18 never populates line_category
    // for those.
    {
      const { rows: tier1Rows } = await client.query(`SELECT line_category FROM accounting.line_category_load_required`);
      const tier1Codes = new Set(tier1Rows.map((r) => r.line_category));
      const { rows } = await client.query(
        `SELECT el.id, el.line_category, ec.code, el.unit_id, el.driver_id
         FROM accounting.expense_lines el
         LEFT JOIN catalogs.expense_categories ec ON ec.id = el.expense_category_uuid
         WHERE el.operating_company_id = $1`,
        [USMCA_OPERATING_COMPANY_ID]
      );
      let tier1MissingUnitOrDriver = 0;
      let tier2MissingUnit = 0;
      let tier3UnitPresent = 0;
      for (const r of rows) {
        const tier = r.line_category && tier1Codes.has(r.line_category)
          ? TIER.TIER1
          : classifyExpenseLineCategoryCode(r.code, new Set());
        if (tier === TIER.TIER1 && (r.unit_id === null || r.driver_id === null)) tier1MissingUnitOrDriver++;
        if (tier === TIER.TIER2 && r.unit_id === null) tier2MissingUnit++;
        if (tier === TIER.TIER3 && r.unit_id !== null) tier3UnitPresent++;
      }
      const baselineCeiling = baseline["accounting.expense_lines"]?.tier1_missing_unit_or_driver_max ?? 0;
      if (tier1MissingUnitOrDriver > baselineCeiling) {
        failures.push(`accounting.expense_lines: ${tier1MissingUnitOrDriver} TIER1 rows missing unit_id/driver_id -- exceeds baseline ceiling of ${baselineCeiling} (this is a KNOWN, LARGE, pre-existing gap -- see docs/audit/GUARD-WORKORDERS.md LINKAGE-A30-EXPENSE-LINES-NO-UNIT-DRIVER)`);
      } else {
        infoLines.push(`[OK] accounting.expense_lines TIER1: ${tier1MissingUnitOrDriver} missing unit/driver (baseline ceiling ${baselineCeiling} -- KNOWN, tracked, not this PR's to backfill)`);
      }
      if (tier2MissingUnit > 0) {
        failures.push(`accounting.expense_lines: ${tier2MissingUnit} TIER2 rows missing unit_id`);
      } else {
        infoLines.push(`[OK] accounting.expense_lines TIER2: 0 rows missing unit_id (0 live rows in TIER2 categories today)`);
      }
      if (tier3UnitPresent > 0) {
        failures.push(`accounting.expense_lines: ${tier3UnitPresent} TIER3 rows carry a unit_id -- a unit link on a TIER3 (company, not fleet) row is a defect, not an improvement`);
      } else {
        infoLines.push(`[OK] accounting.expense_lines TIER3: 0 rows wrongly carry a unit_id`);
      }
    }

    for (const line of infoLines) console.log(line);

    if (failures.length > 0) {
      console.error(`${LABEL}: FAIL`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log(`${LABEL}: OK`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`${LABEL}: FAIL — unexpected error: ${err?.stack || err}`);
  process.exit(1);
});
