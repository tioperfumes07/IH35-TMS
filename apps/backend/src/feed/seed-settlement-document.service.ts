// SEED ENGINE — one AlwaysTrack settlement document, idempotent by document number.
//
// Input is a matched pair of truth-JSON entries from
// data/alwaystrack/settlements-truth-2026-09-13.json (`{ company, driver }`, keyed by
// `settlement_no`) — NEVER a re-parsed PDF, NEVER a retyped figure. This file owns the
// TRANSFORM (truth JSON -> normalized SeedPlan, pure, fully unit-testable with no DB) and the
// ORCHESTRATION (SeedPlan -> the seven artifacts below, in the owner's fixed order), split into
// two phases — `seedSettlementDocument` (in the caller's transaction) then, after commit,
// `postGlForSeededDocument` (its own connections) — see the "TWO PHASES" note further down for
// why. It does NOT own GL math — every dollar that hits `accounting.journal_entries` in this
// file comes from calling an EXISTING poster; see the "GL — existing posters only" section at
// the bottom for the full list and why each one is safe to call from historical-seed context.
//
// The load-bookended trip-close GL wire (step 6's settlement posting) is NOT this file's own
// code — it calls postLoadBookendedSettlementGlAfterClose, CC-3's proven mechanism (ROUND 137
// item 1, tested live on S-2026-5769, balanced to zero, idempotent). Do not write a second path.
//
// The "stop writer" (actual_arrival_at / actual_departure_at) and the revenue Event-1 latch read
// of it are the SAME mechanism, not two register items — seedLoad (step 1, below) writes both
// columns on the delivery stop it creates; postGlForSeededDocument's Event-1 call is what reads
// them. There is exactly one write path for those two columns in this file.
//
// Order (owner's ruling, holds):
//   1. mdata.loads                                  — real load numbers from loads[]
//   2. accounting.invoices + invoice_lines           — one line per customer_charges[] entry
//   3. driver_finance.driver_bills                   — from driver_payment_total, load-linked
//   4. accounting.expenses + expense_lines           — one row per expenses[] entry, load-linked,
//                                                       plus an expense_attribution.expense_load_links
//                                                       row whose expense_number = the load_number
//   5. fuel.fuel_transactions                        — one row per fuel_purchases[] receipt,
//                                                       fuel_type='diesel' always (DEF/reefer are
//                                                       EXPENSES on these documents, never reclassified)
//   6. driver_finance.driver_settlements              — net_pay is POSTED, not written directly
//                                                       from the truth JSON's total_due (see step
//                                                       6a below); source_document_ref =
//                                                       settlement_no; settled_in_settlement_id
//                                                       stamped on every bill
//   7. accounting.factoring_advances                  — last, cannot start before the load + chain
//
// Whole-document idempotency: before touching anything, this looks for a live (not voided, not
// cancelled) `driver_finance.driver_settlements` row at (operating_company_id, source_document_ref
// = documentNumber). If one exists, the document is already seeded and this returns immediately —
// no partial re-run, no duplicate rows. Everything below that point is additionally idempotent on
// its own natural key (matching the house convention in historical-driver-bill-backfill.service.ts
// and fuel-expense-document.service.ts) so a crash mid-document and a clean re-run never double-post.
// The GL posters called by postGlForSeededDocument are each idempotent on their own terms too
// (postFuelExpenseFromEvent returns "already_posted"; postLoadBookendedSettlementGlAfterClose's
// underlying closeSettlementPayRun claims via driver_finance.payrun_gl_runs) — running phase 2
// twice on the same document is safe, never a double-post.
//
// NO DB WRITES have been exercised against this file yet — per instruction, this waits for
// Cursor's AUTH-001 wipe to report COMMITTED before document 5769 runs as the live proof. The pure
// transform below (parseSettlementDocumentPlan + its helpers) has been validated against the real
// truth-JSON entries for all 34 documents in the 5769-5803 range (see the companion --selftest
// script) — totals tie exactly to verify-alwaystrack-parity.mjs's own --selftest targets.

import type { QueryResultRow } from "pg";
import { createLoadWithFullSideEffects, type BookLoadInput } from "../dispatch/book-load.service.js";
import { createHistoricalDriverBill } from "../driver-finance/historical-driver-bill-backfill.service.js";
// postLoadBookendedSettlementGlAfterClose — CC-3, ROUND 137 item 1, commit 56844614f0 on
// claude/round125-never-posted-predicate-fix. NOT YET on main as of this writing — this import
// will not resolve until that commit merges. Deliberate: the owner's instruction is "the seeder
// calls CC-3's settlement poster — do not write a second path," so this file is built against
// the real function, not a local approximation of it. Do not substitute closeSettlementPayRun
// directly here even though it exists on main today — that IS the second path the instruction
// forbids (it skips the "Driver Net-Pay Clearing" payment-method resolution CC-3's wrapper does).
import { postLoadBookendedSettlementGlAfterClose } from "../driver-finance/settlement-payrun-close.service.js";
import { postLoadRevenueLatch } from "../accounting/revrec-delivery-posting/poster.service.js";
import { postFuelExpenseFromEvent } from "../accounting/fuel-posting/poster.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { postFactoringAdvanceEvent } from "../accounting/factoring-posting/poster.service.js";
import { nextExpenseDisplayId } from "../accounting/display-id.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// TYPES — truth-JSON shape (data/alwaystrack/settlements-truth-2026-09-13.json), verbatim field
// names, confirmed by direct inspection of document 5769's real entries. Never widen these to
// "maybe" fields without re-checking against the actual file — a silently-absent field here
// becomes a silently-wrong dollar amount downstream.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type TruthCustomerCharge = {
  load: string;
  customer: string;
  item: string;
  description: string;
  miles: number | null;
  rate: number | null;
  amount: number; // dollars
};

export type TruthDriverPaymentLine = {
  load: string;
  driver: string;
  item: string;
  detail: string;
  amount: number; // dollars
};

export type TruthFuelPurchase = {
  load: string;
  date: string;
  vendor: string;
  location: string;
  invoice: string;
  gallons: number;
  cpg: number;
  receipt: number;
  fees: number;
  disc: number;
  discpg: number;
  actual: number; // dollars — the figure the parity gate sums
};

export type TruthExpenseLine = {
  date: string;
  vendor: string;
  description: string;
  invoice: string;
  reimb: string;
  comp: string;
  amount: number; // dollars
  raw: string;
  load?: string; // absent on some documents/lines — see attributeExpenseLoad below
};

export type TruthCompanyDoc = {
  doc: string;
  kind: "company";
  settlement_no: string;
  start_date: string;
  end_date: string;
  entity: string;
  loads: string[];
  customer_charges: TruthCustomerCharge[];
  driver_payment: TruthDriverPaymentLine[];
  driver_payment_total: number;
  fuel_purchases: TruthFuelPurchase[];
  expenses: TruthExpenseLine[];
  expenses_total: number;
};

export type TruthDeduction = {
  load: string;
  date: string;
  description: string;
  amount: number; // dollars, negative in source
};

export type TruthPayLine = {
  load: string;
  item: string;
  miles: number | null;
  rate: number | null;
  amount: number;
};

export type TruthDriverDoc = {
  doc: string;
  kind: "driver";
  settlement_no: string;
  start_date: string;
  end_date: string;
  entity: string;
  driver: string; // free-text name, resolved to mdata.drivers.id below
  loads: string[];
  total_due: number; // dollars — the figure DRIVER_NET compares cents-exact
  pay_lines: TruthPayLine[];
  deductions: TruthDeduction[];
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PURE TRANSFORM — no DB, no network, fully unit-testable. dollarsToCents uses the same
// round-half-up-in-cents convention as verify-alwaystrack-parity.mjs's round2Cents so a plan
// built here always compares equal, cents-exact, to what that gate expects.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function groupByLoad<T extends { load?: string }>(rows: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.load) continue;
    const bucket = map.get(row.load) ?? [];
    bucket.push(row);
    map.set(row.load, bucket);
  }
  return map;
}

/**
 * Attribute an `expenses[]` entry with no `load` key to a load in the same document. Some
 * documents (confirmed on doc 5769) carry a DEF/company-expense line with no structured `load`
 * field even though its `raw` text embeds the same invoice number as a same-day, same-vendor
 * `fuel_purchases[]` receipt that DOES carry a load — e.g. doc 5769's DEF line
 * (vendor LOVES, 2026-08-07, raw contains "2870483") matches fuel_purchases[1] (vendor LOVES,
 * 2026-08-07, invoice "2870483", load "13508") exactly.
 *
 * Attribution order, each step exact-match only (never a fuzzy guess):
 *   1. expense.load is present -> use it directly.
 *   2. Exactly one fuel_purchases[] row in the same document shares vendor + date with the
 *      expense -> attribute to that row's load.
 *   3. The document has exactly one load total -> attribute to that load (nothing else it could be).
 *   4. Otherwise -> UNATTRIBUTED. Never guess past this point; the caller must resolve it by hand
 *      (structural assertion D exists precisely to catch a wrong guess here).
 */
export function attributeExpenseLoad(
  expense: TruthExpenseLine,
  doc: TruthCompanyDoc
): { loadNumber: string; method: "explicit" | "fuel-vendor-date-match" | "single-load-document" } | null {
  if (expense.load) return { loadNumber: expense.load, method: "explicit" };

  const fuelMatches = doc.fuel_purchases.filter(
    (f) => f.vendor === expense.vendor && f.date === expense.date
  );
  if (fuelMatches.length === 1) {
    return { loadNumber: fuelMatches[0].load, method: "fuel-vendor-date-match" };
  }

  if (doc.loads.length === 1) {
    return { loadNumber: doc.loads[0], method: "single-load-document" };
  }

  return null;
}

/**
 * ROUND 165 order 2 — feed_input.json merges the company and driver documents, so a cost the
 * driver paid out of pocket prints TWICE in the company doc's own expenses[]: once as the real
 * cost line, once again as "Driver Reimbursement-<whatever>" (the payment path, not a second
 * cost). Confirmed live on doc 5775 (scale 15.25 prints 3x: 2 clean cost lines + 1
 * description-truncated-to-"Drv" echo — the company document itself only ever shows 2).
 *
 * The truncation is real and inconsistent: `description` is sometimes corrupted to the literal
 * string "Drv" for these echo lines, and even `raw` does not always retain the word
 * "Reimbursement" on those truncated rows (confirmed against docs 5774/5784/5794/5800) — so "Drv"
 * on its own is treated as a second, equally-reliable marker of the same echo class, not just a
 * fallback when the "Reimbursement" text is missing.
 */
function isReimbursementMarkedLine(e: Pick<TruthExpenseLine, "description" | "raw">): boolean {
  if (e.description.trim() === "Drv") return true;
  return /reimbursement/i.test(e.description) || /reimbursement/i.test(e.raw);
}

/**
 * ROUND 165 order 2 — "book an expense line only up to the number of times that amount prints in
 * the company settlement's EXPENSES block." Implemented as: group same-document expense lines by
 * (load, amount); within a group, a reimbursement-marked line is dropped whenever a genuine
 * (non-reimbursement-marked) line already accounts for that amount — the genuine line(s) ARE the
 * quota. A group with ONLY reimbursement-marked lines keeps exactly one (the first) rather than
 * dropping to zero: an amount with no other representation on the document is still a real cost,
 * just one whose only surviving text happens to be the reimbursement echo (see
 * isReimbursementSurvivor on SeedPlanLoad.expenseLines).
 *
 * A SEPARATE pass first collapses exact duplicates (same load + date + vendor + description +
 * amount) — this is the other class Lead's report names ("the parser duplicated it"): 5774
 * reefer 45.47, 5784 washout 55.21, 5785 lumper 10.00, 5787 parking 22.00, each printing once on
 * the real company document but twice, byte-identically, in this array.
 *
 * Pure, no DB, fully unit-testable — the exact contract order 2 asks for.
 */
export function dedupeCompanyExpenses(expenses: readonly TruthExpenseLine[]): Array<TruthExpenseLine & { isReimbursementSurvivor: boolean }> {
  const exactSeen = new Set<string>();
  const afterExactDedupe: TruthExpenseLine[] = [];
  for (const e of expenses) {
    const exactKey = `${e.load ?? ""} ${e.date} ${e.vendor} ${e.description} ${dollarsToCents(e.amount)}`;
    if (exactSeen.has(exactKey)) continue;
    exactSeen.add(exactKey);
    afterExactDedupe.push(e);
  }

  const groups = new Map<string, TruthExpenseLine[]>();
  for (const e of afterExactDedupe) {
    const groupKey = `${e.load ?? ""} ${dollarsToCents(e.amount)}`;
    const bucket = groups.get(groupKey) ?? [];
    bucket.push(e);
    groups.set(groupKey, bucket);
  }

  const result: Array<TruthExpenseLine & { isReimbursementSurvivor: boolean }> = [];
  for (const bucket of groups.values()) {
    const genuine = bucket.filter((e) => !isReimbursementMarkedLine(e));
    if (genuine.length > 0) {
      for (const e of genuine) result.push({ ...e, isReimbursementSurvivor: false });
      continue;
    }
    // Every line in this (load, amount) group is reimbursement-marked -- keep exactly one, it is
    // the only representation of this cost on the document.
    result.push({ ...bucket[0], isReimbursementSurvivor: true });
  }
  return result;
}

export type SeedPlanLoad = {
  loadNumber: string;
  customerName: string;
  driverName: string;
  invoiceLines: Array<{ item: string; description: string; amountCents: number; miles: number | null; rate: number | null }>;
  invoiceTotalCents: number;
  driverBillGrossCents: number;
  driverPayLines: TruthDriverPaymentLine[];
  expenseLines: Array<{
    date: string;
    vendor: string;
    description: string;
    amountCents: number;
    invoice: string;
    raw: string;
    /**
     * ROUND 165 order 2 — true only when this line survived dedupeCompanyExpenses() as a
     * reimbursement-marked line with NO genuine (non-reimbursement) sibling at the same
     * load+amount — i.e. it is the ONLY representation of this cost on the company document, so
     * it must still be booked, but as the reimbursement item (Driver Reimbursement-...), not the
     * regular cost item. Every other reimbursement echo never reaches this array at all — see
     * dedupeCompanyExpenses.
     */
    isReimbursementSurvivor: boolean;
  }>;
  fuelLines: Array<{ date: string; vendor: string; location: string; invoice: string; gallons: number; amountCents: number }>;
};

export type SeedPlan = {
  documentNumber: string;
  startDate: string;
  endDate: string;
  loads: SeedPlanLoad[];
  /**
   * A load number present in `loads[]` with zero matching `customer_charges[]` rows — confirmed
   * to exist on real documents (5778/13525, 5790/13554, 5803/13564). There is no customer name
   * to resolve for it in the truth JSON, and `mdata.loads.customer_id` is NOT NULL, so this load
   * cannot be created without a guess. Never guessed — surfaced here for hand resolution instead.
   */
  loadsWithNoCharges: string[];
  unattributedExpenses: TruthExpenseLine[];
  driverName: string;
  driverNetDueCents: number;
  deductions: TruthDeduction[];
  totals: {
    lineHaulCents: number;
    driverPaymentCents: number;
    fuelCents: number;
    fuelCount: number;
    expensesCents: number;
    expensesCount: number;
  };
};

/**
 * Build a normalized, per-load seed plan from one matched company+driver truth-JSON pair.
 * Every dollar figure here traces directly to a field already present in the truth JSON —
 * nothing is invented, nothing is re-derived from a formula that could drift from the source.
 */
export function parseSettlementDocumentPlan(companyDoc: TruthCompanyDoc, driverDoc: TruthDriverDoc | null): SeedPlan {
  if (String(companyDoc.settlement_no) !== String(driverDoc?.settlement_no ?? companyDoc.settlement_no)) {
    throw new Error(
      `parseSettlementDocumentPlan: company doc ${companyDoc.settlement_no} paired with mismatched driver doc ${driverDoc?.settlement_no}`
    );
  }

  const chargesByLoad = groupByLoad(companyDoc.customer_charges);
  const paymentByLoad = groupByLoad(companyDoc.driver_payment);
  const fuelByLoad = groupByLoad(companyDoc.fuel_purchases);

  const dedupedExpenses = dedupeCompanyExpenses(companyDoc.expenses);

  const unattributedExpenses: TruthExpenseLine[] = [];
  const expensesByLoad = new Map<string, Array<TruthExpenseLine & { isReimbursementSurvivor: boolean }>>();
  for (const expense of dedupedExpenses) {
    const attribution = attributeExpenseLoad(expense, companyDoc);
    if (!attribution) {
      unattributedExpenses.push(expense);
      continue;
    }
    const bucket = expensesByLoad.get(attribution.loadNumber) ?? [];
    bucket.push(expense);
    expensesByLoad.set(attribution.loadNumber, bucket);
  }

  const loadsWithNoCharges: string[] = [];
  const loads: SeedPlanLoad[] = [];
  for (const loadNumber of companyDoc.loads) {
    const charges = chargesByLoad.get(loadNumber) ?? [];
    const payments = paymentByLoad.get(loadNumber) ?? [];
    const fuel = fuelByLoad.get(loadNumber) ?? [];
    const expenses = expensesByLoad.get(loadNumber) ?? [];

    if (charges.length === 0) {
      // No customer_charges -> no customer name -> mdata.loads.customer_id (NOT NULL) cannot be
      // resolved without a guess. Skip the load entirely rather than invent a customer; surfaced
      // in loadsWithNoCharges for hand resolution before this document can seed cleanly.
      loadsWithNoCharges.push(loadNumber);
      continue;
    }

    loads.push({
      loadNumber,
      customerName: charges[0].customer,
      driverName: payments[0]?.driver ?? driverDoc?.driver ?? "",
      invoiceLines: charges.map((c) => ({
        item: c.item,
        description: c.description,
        amountCents: dollarsToCents(c.amount),
        miles: c.miles,
        rate: c.rate,
      })),
      invoiceTotalCents: charges.reduce((sum, c) => sum + dollarsToCents(c.amount), 0),
      driverBillGrossCents: payments.reduce((sum, p) => sum + dollarsToCents(p.amount), 0),
      driverPayLines: payments,
      expenseLines: expenses.map((e) => ({
        date: e.date,
        vendor: e.vendor,
        description: e.description,
        amountCents: dollarsToCents(e.amount),
        invoice: e.invoice,
        raw: e.raw,
        isReimbursementSurvivor: e.isReimbursementSurvivor,
      })),
      fuelLines: fuel.map((f) => ({
        date: f.date,
        vendor: f.vendor,
        location: f.location,
        invoice: f.invoice,
        gallons: f.gallons,
        amountCents: dollarsToCents(f.actual),
      })),
    });
  }

  return {
    documentNumber: String(companyDoc.settlement_no),
    startDate: companyDoc.start_date,
    endDate: companyDoc.end_date,
    loads,
    loadsWithNoCharges,
    unattributedExpenses,
    driverName: driverDoc?.driver ?? loads[0]?.driverName ?? "",
    driverNetDueCents: driverDoc ? dollarsToCents(driverDoc.total_due) : 0,
    deductions: driverDoc?.deductions ?? [],
    totals: {
      lineHaulCents: dollarsToCents(companyDoc.customer_charges.reduce((s, c) => s + c.amount, 0)),
      driverPaymentCents: dollarsToCents(companyDoc.driver_payment_total),
      fuelCents: dollarsToCents(companyDoc.fuel_purchases.reduce((s, f) => s + f.actual, 0)),
      fuelCount: companyDoc.fuel_purchases.length,
      expensesCents: dollarsToCents(companyDoc.expenses_total),
      expensesCount: companyDoc.expenses.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DB ORCHESTRATION — everything below writes. The caller opens the transaction (same convention
// as historical-feed-day.routes.ts's withCurrentUser: BEGIN, SET LOCAL ROLE, set_config the
// tenant GUC, run this, COMMIT on success / ROLLBACK on throw) and passes a plain queryable
// client plus the resolved operating_company_id and actor_user_id. This file never opens or
// closes a transaction itself.
//
// TWO PHASES, not one — this matters. `seedSettlementDocument` writes every DOCUMENT (loads,
// invoices, driver_bills, expenses, fuel rows, the settlement row) inside the caller's
// transaction. It does NOT call postLoadRevenueLatch, postFuelExpenseFromEvent, or
// postLoadBookendedSettlementGlAfterClose — none of those three accept a client/transaction
// parameter; each opens its OWN connection internally (withLuciaBypass / withCurrentUser). Called
// before this transaction commits, they would read via a separate connection under READ
// COMMITTED and see none of the rows just written. The caller MUST commit first, then call
// `postGlForSeededDocument` (below) as a separate step. postSourceTransactionInClientTx is the
// one exception — it takes the client explicitly and is safe to call in-transaction, which is
// why the AP leg of expenses still posts inside seedSettlementDocument itself.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type QueryableClient = {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount?: number | null }>;
};

export type SeedSettlementDocumentInput = {
  operatingCompanyId: string;
  actorUserId: string;
  companyDoc: TruthCompanyDoc;
  driverDoc: TruthDriverDoc | null;
  /** Gate-B sample tag — bound from the caller, never hardcoded. Defaults to false (real data). */
  is_sample_data?: boolean;
};

export type SeedSettlementDocumentResult = {
  documentNumber: string;
  alreadySeeded: boolean;
  settlementId: string | null;
  loadIds: Record<string, string>;
  invoiceIds: Record<string, string>;
  driverBillIds: Record<string, string>;
  expenseIds: string[];
  fuelTransactions: Array<{ fuelTransactionId: string; postedAt: string; amountCents: number }>;
  loadsWithNoCharges: string[];
  unattributedExpenses: TruthExpenseLine[];
  warnings: string[];
};

class ResolveOrThrowError extends Error {}

/** Resolve a real, existing row by case-insensitive name match. Never invents a row. */
async function resolveByName(
  client: QueryableClient,
  schemaTable: string,
  nameColumn: string,
  operatingCompanyId: string,
  name: string
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text FROM ${schemaTable} WHERE operating_company_id = $1::uuid AND ${nameColumn} ILIKE $2 LIMIT 5`,
    [operatingCompanyId, name.trim()]
  );
  if (res.rows.length === 0) {
    throw new ResolveOrThrowError(`No ${schemaTable} row named "${name}" for company ${operatingCompanyId} — never fabricated, resolve by hand first`);
  }
  if (res.rows.length > 1) {
    throw new ResolveOrThrowError(`Ambiguous ${schemaTable} name "${name}" for company ${operatingCompanyId} — ${res.rows.length} candidates, resolve by hand`);
  }
  return res.rows[0].id;
}

async function findLiveSettlementByDocumentRef(
  client: QueryableClient,
  operatingCompanyId: string,
  documentNumber: string
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND source_document_ref = $2
        AND voided_at IS NULL AND reversed_at IS NULL AND status <> 'cancelled'
      LIMIT 2`,
    [operatingCompanyId, documentNumber]
  );
  if (res.rows.length > 1) {
    // Mirrors structural assertion A — a real live duplicate must be reconciled by hand, never
    // silently treated as "already seeded, first one wins."
    throw new ResolveOrThrowError(
      `${res.rows.length} live non-cancelled settlements already carry source_document_ref=${documentNumber} for company ${operatingCompanyId} — this is the structural-assertion-A duplicate class, resolve by hand before seeding`
    );
  }
  return res.rows[0]?.id ?? null;
}

// STEP 1 — mdata.loads, via createLoadWithFullSideEffects — THE ONE SHARED CREATE PATH
// (apps/backend/src/dispatch/book-load.service.ts), enforced by
// scripts/verify-one-load-create-path.mjs. source: "historical_backfill" is the exact mode this
// function's own header names for a feed like this one — every hard-block gate (OOS, driver
// qualification, drug-test/HOS-at-load-time, zero-dollar charge lines) RECORDS an
// appendCrudAudit exception and proceeds instead of throwing (see that function's own
// "historical_backfill_gate_exception" branches). The delivery stop's actual_arrival_at /
// actual_departure_at are written by createLoadWithFullSideEffects itself, in this exact mode —
// that IS the "stop writer" the CC-1 task register names; there is no second write path for
// those two columns anywhere in this file.
//
// DELIBERATELY created with NO assigned_primary_driver_id / team_id. createLoadWithFullSideEffects
// mints its own driver_finance.driver_bills row via createDriverBillArtifacts when a driver IS
// assigned at creation — but that minter prices from mdata.drivers rate × miles_shortest (a
// LIVE-booking mechanism, gated on miles_shortest being non-null, refuses otherwise), never from
// a signed document's stated gross. That is exactly wrong for this feeder: the truth JSON's
// driver_payment_total IS the signed figure, and historical-driver-bill-backfill.service.ts's
// createHistoricalDriverBill exists precisely to write it exactly, never computed. Leaving the
// driver off at creation makes createDriverBillArtifacts a no-op ("not_applicable" — see its own
// early return when neither a driver nor a team is set); the driver is assigned in a narrow,
// separate UPDATE right after, and the real bill is minted by seedDriverBill (step 3) from the
// stated figure — one write path for driver pay, not two competing ones.
async function seedLoad(
  client: QueryableClient,
  operatingCompanyId: string,
  actorUserId: string,
  plan: SeedPlan,
  planLoad: SeedPlanLoad
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2 LIMIT 1`,
    [operatingCompanyId, planLoad.loadNumber]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const customerId = await resolveByName(client, "mdata.customers", "name", operatingCompanyId, planLoad.customerName);
  const driverId = await resolveByName(client, "mdata.drivers", "full_name", operatingCompanyId, planLoad.driverName);

  const bookLoadInput: BookLoadInput = {
    requestingUserUuid: actorUserId,
    requestingUserRole: "Owner",
    operating_company_id: operatingCompanyId,
    customer_id: customerId,
    status: "completed_docs_received",
    load_number: planLoad.loadNumber,
    notes: `AlwaysTrack seed — settlement ${plan.documentNumber} (${plan.startDate}..${plan.endDate})`,
    is_sample_data: false,
    // ROUND 143.3 — linkage written at creation, not backfilled. Every one of the 89 is a Faro
    // purchase, so every load carries the Faro Factoring vendor at creation. The load records
    // who bought it, so a cost or a receivable can be attributed without reconstructing it later.
    factoring_company_vendor_id: "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4",
    charges: planLoad.invoiceLines.map((line, i) => ({
      code: `LINE-${i + 1}`,
      description: `${line.item} — ${line.description}`,
      amount_cents: line.amountCents,
    })),
    stops: [
      { stop_type: "pickup", sequence_number: 1, scheduled_arrival_at: `${plan.startDate}T00:00:00Z` },
      {
        stop_type: "delivery",
        sequence_number: 2,
        scheduled_arrival_at: `${plan.endDate}T00:00:00Z`,
        // The truth JSON carries no per-stop timestamps, only the document's own date range —
        // the settlement's own end_date is the real signal for "when this load actually
        // delivered" on a historical AlwaysTrack document; not an invented figure, the
        // document's own field. finalActiveDeliveryDepartureAt (revrec) reads exactly this.
        actual_arrival_at: `${plan.endDate}T00:00:00Z`,
        actual_departure_at: `${plan.endDate}T00:00:00Z`,
      },
    ],
    save_mode: "book_dispatch",
  };

  const result = await createLoadWithFullSideEffects(client as never, bookLoadInput, { source: "historical_backfill" });
  if (result.kind === "error") {
    throw new ResolveOrThrowError(
      `createLoadWithFullSideEffects refused load ${planLoad.loadNumber} (doc ${plan.documentNumber}): status ${result.status} ${JSON.stringify(result.payload)}`
    );
  }
  const loadId = String(result.row.id ?? "");
  if (!loadId) {
    throw new ResolveOrThrowError(`createLoadWithFullSideEffects returned no id for load ${planLoad.loadNumber} (doc ${plan.documentNumber})`);
  }

  await client.query(
    `UPDATE mdata.loads SET assigned_primary_driver_id = $1::uuid, updated_at = now() WHERE id = $2::uuid`,
    [driverId, loadId]
  );

  await appendCrudAudit(client, actorUserId, "mdata.load.alwaystrack_seed", { operating_company_id: operatingCompanyId, load_id: loadId, document_number: plan.documentNumber }, "info", "SEED-SETTLEMENT-DOCUMENT-01");
  return loadId;
}

// STEP 2 — accounting.invoices + invoice_lines. ONE INVOICE PER LOAD (each load's
// customer_charges[] become that load's invoice lines) — invoices.source_load_id is a single
// column, so grouping by load is the only shape that keeps "each line carrying its own load
// attribution" literally true at both the header and line level. display_id = the load number
// itself (the widened CHECK on accounting.invoices allows plain digits) — deterministic, no
// sequence allocator needed, matches the GO-19 "the number IS the load number" convention already
// used for driver_bills.bill_number. Status = 'proforma' (booking-time, non-posting) per spec;
// Event 2 (A/R) is fired separately, below, by calling the existing revrec latch — never by
// flipping this status to something that isn't in the real CHECK.
async function seedInvoice(
  client: QueryableClient,
  operatingCompanyId: string,
  actorUserId: string,
  loadId: string,
  planLoad: SeedPlanLoad
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.invoices WHERE operating_company_id = $1::uuid AND source_load_id = $2::uuid LIMIT 1`,
    [operatingCompanyId, loadId]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const customerId = await resolveByName(client, "mdata.customers", "name", operatingCompanyId, planLoad.customerName);

  const invoice = await client.query<{ id: string }>(
    `INSERT INTO accounting.invoices (
       operating_company_id, customer_id, display_id, status, source_load_id,
       due_date, subtotal_cents, total_cents, is_sample_data, created_by_user_id, updated_by_user_id
     )
     VALUES ($1::uuid, $2::uuid, $3, 'proforma', $4::uuid, CURRENT_DATE + INTERVAL '30 days', $5, $5, false, $6::uuid, $6::uuid)
     RETURNING id::text`,
    [operatingCompanyId, customerId, planLoad.loadNumber, loadId, planLoad.invoiceTotalCents, actorUserId]
  );
  const invoiceId = invoice.rows[0].id;

  let displayOrder = 0;
  for (const line of planLoad.invoiceLines) {
    await client.query(
      `INSERT INTO accounting.invoice_lines (
         operating_company_id, invoice_id, source_load_id, line_type, description,
         quantity, unit_amount_cents, line_total_cents, display_order
       )
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'linehaul', $4, 1, $5, $5, $6)`,
      [operatingCompanyId, invoiceId, loadId, `${line.item} — ${line.description}`, line.amountCents, displayOrder]
    );
    displayOrder += 1;
  }

  await appendCrudAudit(client, actorUserId, "accounting.invoice.alwaystrack_seed", { operating_company_id: operatingCompanyId, invoice_id: invoiceId, load_id: loadId }, "info", "SEED-SETTLEMENT-DOCUMENT-02");
  return invoiceId;
}

// STEP 3 — driver_finance.driver_bills. Reuses the EXISTING historical writer
// (createHistoricalDriverBill) rather than re-implementing its idempotency/refusal logic. Writes
// no GL — a driver bill is a document; posting is the settlement engine's job (step 6).
async function seedDriverBill(
  client: QueryableClient,
  operatingCompanyId: string,
  actorUserId: string,
  documentNumber: string,
  loadId: string,
  planLoad: SeedPlanLoad
): Promise<string> {
  const driverId = await resolveByName(client, "mdata.drivers", "full_name", operatingCompanyId, planLoad.driverName);
  const outcome = await createHistoricalDriverBill(client as never, {
    operating_company_id: operatingCompanyId,
    load_id: loadId,
    load_number: planLoad.loadNumber,
    driver_id: driverId,
    team_driver_id: null,
    gross_amount_cents: planLoad.driverBillGrossCents,
    miles_basis: null,
    miles_basis_type: null,
    rate_per_mile_cents: null,
    miles_deadhead: null,
    rate_empty_per_mile_cents: null,
    loaded_pay_cents: null,
    deadhead_pay_cents: null,
    source_document_ref: documentNumber,
    requesting_user_uuid: actorUserId,
  });
  if (outcome.outcome === "refused") {
    throw new ResolveOrThrowError(
      `createHistoricalDriverBill refused load ${planLoad.loadNumber} (doc ${documentNumber}): ${outcome.reason}`
    );
  }
  return outcome.driver_bill_id;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ROUND 165 order 1 — item/account resolution for expense lines. Every alias below was matched
// against the LIVE catalogs.items rows for USMCA (queried directly, not guessed) — see the
// account mapping table in docs/bus's ROUND 165 order for the account side of this; the item_name
// strings here are the exact live names that resolve to those accounts. Ordered so a more
// specific keyword (e.g. "washout") is tried before a more general one that could also match
// (e.g. "reefer" alone would otherwise catch "reefer washout" and misfile it as reefer fuel).
// Each entry's `reimb` name is used only for a line whose isReimbursementSurvivor is true (the
// rare case where a reimbursement-marked line is the ONLY representation of that cost — see
// dedupeCompanyExpenses); when no dedicated reimbursement item exists for a category, `reimb` is
// omitted and such a line REFUSES rather than posting to the regular cost item under a guess.
// ─────────────────────────────────────────────────────────────────────────────────────────────
type ExpenseItemAlias = {
  test: (haystack: string) => boolean;
  regular: string | ((haystack: string) => string);
  reimb?: string;
};
const EXPENSE_ITEM_ALIASES: ExpenseItemAlias[] = [
  { test: (h) => /\bscale\b/.test(h), regular: "OTR-Scale Expense", reimb: "Driver Reimbursement-Scale Expense" },
  {
    test: (h) => /\bwash\s*out\b/.test(h),
    regular: "Reefer-Trailer Washout Expense",
  },
  {
    test: (h) => /\btoll\b/.test(h),
    regular: (h) => (/\bmex(ico)?\b/.test(h) ? "Highway Toll Expense-Mexico" : "Highway Toll Expense-USA"),
    reimb: "Driver Reimbursement-TPE-Toll Expense",
  },
  { test: (h) => /\bpark(ing)?\b/.test(h), regular: "OTR-Parking Expense" },
  { test: (h) => /\blumper\b/.test(h), regular: "Warehouse Lumper Expense", reimb: "Driver Reimbursement Warehouse-Lumper Fee" },
  {
    test: (h) => /\btires?\b/.test(h) && /\b(trailer|reefer|flatbed)\b/.test(h),
    regular: "Road Service-Trailer Tire Expense",
  },
  { test: (h) => /\btires?\b/.test(h), regular: "Road Service-Truck Tire Expense" },
  {
    test: (h) => /\b(repair|mechanic)\b/.test(h) && /\b(trailer|reefer|flatbed)\b/.test(h),
    regular: "IH 35-Internal-Trailer Repair & Maintenance",
  },
  { test: (h) => /\b(repair|mechanic)\b/.test(h), regular: "Road Service-Truck Repair Expense" },
  { test: (h) => /\btools?\b/.test(h), regular: "OTR-Maintenance-Tools", reimb: "Driver Reimbursement-OTR-Maintenance, Oils, Additives" },
  {
    test: (h) => /\b(oil|additives?|antifreeze)\b/.test(h),
    regular: "OTR-Additives, Oil, Antifreeze",
    reimb: "Driver Reimbursement-OTR-Maintenance, Oils, Additives",
  },
  { test: (h) => /\bdef\b/.test(h), regular: "Fuel-DEF-Diesel Exhaust Fluid", reimb: "Driver Reimbursement-Fuel Def" },
  { test: (h) => /\breefer\b/.test(h), regular: "Fuel-Reefer-Diesel" },
];

/**
 * ROUND 165 order 1 — resolve item_name -> {item_id, expense_account_uuid}, USMCA-scoped first,
 * then global (operating_company_id IS NULL). No keyword matches, or the matched item has no
 * default_expense_account_id: REFUSE — never falls back to a default account. Matches against
 * `description` first (genuine cost lines print real text like "SCALE"/"TOLL"/"WASHOUT" — Lead's
 * own cited examples), falling back to `raw` for the rare surviving reimbursement line whose
 * description is the corrupted literal "Drv".
 */
async function resolveExpenseItem(
  client: QueryableClient,
  operatingCompanyId: string,
  line: SeedPlanLoad["expenseLines"][number]
): Promise<{ itemId: string; expenseAccountId: string; itemName: string }> {
  const haystack = `${line.description} ${line.raw}`.toLowerCase();
  const alias = EXPENSE_ITEM_ALIASES.find((a) => a.test(haystack));
  if (!alias) {
    throw new ResolveOrThrowError(
      `resolveExpenseItem: no item alias matches expense description "${line.description}" (${line.amountCents}c) — refusing rather than posting to a default; add a real alias or resolve by hand`
    );
  }
  const regularName = typeof alias.regular === "function" ? alias.regular(haystack) : alias.regular;
  const itemName = line.isReimbursementSurvivor ? alias.reimb ?? regularName : regularName;
  if (line.isReimbursementSurvivor && !alias.reimb) {
    throw new ResolveOrThrowError(
      `resolveExpenseItem: "${line.description}" is a reimbursement-only line (no genuine sibling on the document) but its alias category has no dedicated reimbursement item — refusing rather than booking it as a regular cost under a guess`
    );
  }

  const res = await client.query<{ id: string; expense_account_id: string | null }>(
    `SELECT id::text, default_expense_account_id::text AS expense_account_id
       FROM catalogs.items
      WHERE item_name = $2 AND (operating_company_id = $1::uuid OR operating_company_id IS NULL)
      ORDER BY (operating_company_id = $1::uuid) DESC
      LIMIT 1`,
    [operatingCompanyId, itemName]
  );
  const row = res.rows[0];
  if (!row || !row.expense_account_id) {
    throw new ResolveOrThrowError(
      `resolveExpenseItem: catalogs.items "${itemName}" not found or has no default_expense_account_id for company ${operatingCompanyId} — refusing rather than posting to a default`
    );
  }
  return { itemId: row.id, expenseAccountId: row.expense_account_id, itemName };
}

// STEP 4 — accounting.expenses + expense_lines + expense_attribution.expense_load_links. ONE
// EXPENSES ROW PER expenses[] ENTRY, load_id set, expense_number on the link row set to the
// LOAD'S load_number exactly (structural assertion D checks this literal equality — never a
// generated expense display id).
//
// ROUND 165 order 1 — expense_lines.expense_account_uuid / item_id are now ALWAYS set via
// resolveExpenseItem; a line whose item/account cannot be resolved throws rather than posting
// anywhere (never a default, never 5000 Fuel & Diesel).
//
// ROUND 165 order 3 — DEF/reefer is never booked as a second, regular expense when a card fuel
// expense (accounting.expenses.source_fuel_transaction_id IS NOT NULL, the LAW 4 record) already
// exists for the same load and amount. That card-fuel path is a separate ingestion
// (fuel-expense-document.service.ts), not this seeder — this is a read-before-write guard against
// it, not a second writer. Returns null (a genuine, expected skip, not an error) when it applies.
async function seedExpense(
  client: QueryableClient,
  operatingCompanyId: string,
  actorUserId: string,
  loadId: string,
  loadNumber: string,
  line: SeedPlanLoad["expenseLines"][number]
): Promise<string | null> {
  const existing = await client.query<{ id: string }>(
    `SELECT e.id::text FROM accounting.expenses e
      JOIN expense_attribution.expense_load_links l ON l.expense_source = 'accounting' AND l.expense_id = e.id
      WHERE e.operating_company_id = $1::uuid AND e.load_id = $2::uuid
        AND e.transaction_date = $3::date AND e.total_amount_cents = $4 AND e.memo = $5
      LIMIT 1`,
    [operatingCompanyId, loadId, line.date, line.amountCents, line.description]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const cardFuelDupe = await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND load_id = $2::uuid AND total_amount_cents = $3
        AND source_fuel_transaction_id IS NOT NULL AND voided_at IS NULL
      LIMIT 1`,
    [operatingCompanyId, loadId, line.amountCents]
  );
  if (cardFuelDupe.rows[0]) return null;

  const item = await resolveExpenseItem(client, operatingCompanyId, line);

  const vendorId = await resolveByName(client, "mdata.vendors", "name", operatingCompanyId, line.vendor).catch(() => null);

  const expenseNumber = await nextExpenseDisplayId(client as never, operatingCompanyId, new Date(line.date));
  const expense = await client.query<{ id: string }>(
    `INSERT INTO accounting.expenses (
       operating_company_id, expense_number, vendor_uuid, driver_uuid, transaction_date,
       total_amount_cents, memo, load_id, status, posting_status, created_by_user_id, updated_by_user_id, is_sample_data,
       trailer_id, unit_id
     )
     SELECT $1::uuid, $2, $3::uuid, d.id, $4::date, $5, $6, $7::uuid, 'draft', 'unposted', $8::uuid, $8::uuid, false,
            l.assigned_trailer_id, l.assigned_unit_id
       FROM mdata.loads l JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
      WHERE l.id = $7::uuid
     RETURNING id::text`,
    [operatingCompanyId, expenseNumber, vendorId, /*unused placeholder*/ null, line.date, line.amountCents, line.description, loadId, actorUserId]
  );
  const expenseId = expense.rows[0].id;

  await client.query(
    `INSERT INTO accounting.expense_lines (
       operating_company_id, expense_id, line_sequence, amount, amount_cents, description, load_id, load_required,
       expense_account_uuid, item_id
     )
     VALUES ($1::uuid, $2::uuid, 1, $3, $4, $5, $6::uuid, true, $7::uuid, $8::uuid)`,
    [operatingCompanyId, expenseId, line.amountCents / 100, line.amountCents, line.description, loadId, item.expenseAccountId, item.itemId]
  );

  const seq = await client.query<{ last_seq: number }>(
    `INSERT INTO expense_attribution.expense_seq_per_load (load_id, last_seq)
     VALUES ($1::uuid, 1)
     ON CONFLICT (load_id) DO UPDATE SET last_seq = expense_attribution.expense_seq_per_load.last_seq + 1, updated_at = now()
     RETURNING last_seq`,
    [loadId]
  );
  await client.query(
    `INSERT INTO expense_attribution.expense_load_links (
       operating_company_id, expense_id, expense_source, load_id, load_number, expense_seq,
       expense_number, attribution_method, attribution_confidence, attributed_by_user_id
     )
     VALUES ($1::uuid, $2::uuid, 'accounting', $3::uuid, $4, $5, $4, 'auto_timestamp', 'high', $6::uuid)`,
    [operatingCompanyId, expenseId, loadId, loadNumber, seq.rows[0].last_seq, actorUserId]
  );

  await appendCrudAudit(client, actorUserId, "accounting.expense.alwaystrack_seed", { operating_company_id: operatingCompanyId, expense_id: expenseId, load_id: loadId, item_name: item.itemName }, "info", "SEED-SETTLEMENT-DOCUMENT-04");
  return expenseId;
}

// STEP 5 — fuel.fuel_transactions. fuel_type is ALWAYS 'diesel' here — the truth JSON's
// fuel_purchases[] is diesel-only by construction (DEF/reefer print under expenses[] on these
// documents; do not reclassify them into fuel even though the DB CHECK would technically allow
// 'def'/'reefer_diesel' — see verify-alwaystrack-parity.mjs's own fuel_type='diesel' filter,
// which this table must match or dimension 3 (fuel $/rows) cannot tie).
//
// GL for this row does NOT happen here. postFuelExpenseFromEvent opens its own connection
// internally (it takes no client param) — calling it before this function's transaction commits
// would have it read via a separate connection and see nothing (the row isn't durable yet under
// READ COMMITTED). It is called post-commit instead — see postGlForSeededDocument below.
async function seedFuel(
  client: QueryableClient,
  operatingCompanyId: string,
  actorUserId: string,
  loadId: string,
  line: SeedPlanLoad["fuelLines"][number],
  driverId: string | null,
  unitId: string | null,
  trailerId: string | null
): Promise<{ fuelTransactionId: string; postedAt: string; amountCents: number }> {
  const rowHash = `alwaystrack:${operatingCompanyId}:${loadId}:${line.date}:${line.vendor}:${line.invoice}`;
  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND source_row_hash = $2 LIMIT 1`,
    [operatingCompanyId, rowHash]
  );
  if (existing.rows[0]) return { fuelTransactionId: existing.rows[0].id, postedAt: line.date, amountCents: line.amountCents };

  const vendorId = await resolveByName(client, "mdata.vendors", "name", operatingCompanyId, line.vendor).catch(() => null);

  // ROUND 143.3 — linkage written at creation, not backfilled. Every fuel transaction carries
  // the load's driver, unit, and trailer, so a fuel purchase can be costed to a truck and a
  // driver without reconstructing it from memory later.
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO fuel.fuel_transactions (
       operating_company_id, transaction_at, purchased_at, load_id, vendor_id, fuel_type,
       gallons, total_cost, location_city, transaction_reference, source, source_row_hash,
       created_by_user_id, updated_by_user_id, driver_id, unit_id, trailer_id
     )
     VALUES ($1::uuid, $2::date, $2::date, $3::uuid, $4::uuid, 'diesel', $5, $6, $7, $8, 'import', $9, $10::uuid, $10::uuid, $11::uuid, $12::uuid, $13::uuid)
     RETURNING id::text`,
    [operatingCompanyId, line.date, loadId, vendorId, line.gallons, line.amountCents / 100, line.location, line.invoice, rowHash, actorUserId, driverId, unitId, trailerId]
  );
  return { fuelTransactionId: inserted.rows[0].id, postedAt: line.date, amountCents: line.amountCents };
}

// STEP 6a — driver_finance.driver_settlements row + settled_in_settlement_id stamp. Just the
// documents; no GL here. net_pay starts at 0 and is populated by the GL step below — writing a
// guessed net_pay from the truth JSON's total_due here would be exactly the kind of "priced
// twice" bug this whole seeder exists to avoid (the LIVE, posted net_pay is the only one that
// counts; the truth JSON's total_due is what verify-alwaystrack-parity.mjs compares it against
// AFTER the GL step runs, not a value this file writes directly).
async function seedDriverSettlement(
  client: QueryableClient,
  operatingCompanyId: string,
  actorUserId: string,
  plan: SeedPlan,
  driverBillIds: string[],
  isSampleData: boolean
): Promise<string> {
  const driverId = await resolveByName(client, "mdata.drivers", "full_name", operatingCompanyId, plan.driverName);

  const settlement = await client.query<{ id: string }>(
    `INSERT INTO driver_finance.driver_settlements (
       operating_company_id, display_id, driver_id, period_start, period_end, status,
       net_pay, source_document_ref, created_by_user_id, is_sample_data
     )
     VALUES ($1::uuid, $2, $3::uuid, $4::date, $5::date, 'approved', 0, $6, $7::uuid, $8)
     RETURNING id::text`,
    [operatingCompanyId, `S-${plan.documentNumber}`, driverId, plan.startDate, plan.endDate, plan.documentNumber, actorUserId, isSampleData]
  );
  const settlementId = settlement.rows[0].id;

  for (const billId of driverBillIds) {
    await client.query(
      `UPDATE driver_finance.driver_bills SET settled_in_settlement_id = $1::uuid WHERE id = $2::uuid AND settled_in_settlement_id IS NULL`,
      [settlementId, billId]
    );
  }

  return settlementId;
}

// STEP 7 — accounting.factoring_advances. Last, per spec — cannot start before the load and the
// rest of the chain exist. Intentionally minimal here: factoring submission needs a real
// factoring_company_vendor_id and a submitted invoice total this file does not yet resolve from
// the truth JSON alone (no factoring fields are present in settlements-truth-2026-09-13.json).
// Left as an explicit follow-on rather than guessed — postFactoringAdvanceEvent exists and is
// the call site once the submission inputs are sourced.
async function seedFactoringAdvancePlaceholder(): Promise<void> {
  // Intentionally not implemented against guessed inputs. See postFactoringAdvanceEvent in
  // apps/backend/src/accounting/factoring-posting/poster.service.ts for the real call shape.
}

export async function seedSettlementDocument(
  client: QueryableClient,
  input: SeedSettlementDocumentInput
): Promise<SeedSettlementDocumentResult> {
  const { operatingCompanyId, actorUserId, companyDoc, driverDoc } = input;
  const plan = parseSettlementDocumentPlan(companyDoc, driverDoc);

  const existingSettlementId = await findLiveSettlementByDocumentRef(client, operatingCompanyId, plan.documentNumber);
  if (existingSettlementId) {
    return {
      documentNumber: plan.documentNumber,
      alreadySeeded: true,
      settlementId: existingSettlementId,
      loadIds: {},
      invoiceIds: {},
      driverBillIds: {},
      expenseIds: [],
      fuelTransactions: [],
      loadsWithNoCharges: plan.loadsWithNoCharges,
      unattributedExpenses: plan.unattributedExpenses,
      warnings: [],
    };
  }

  const warnings: string[] = [];
  if (plan.unattributedExpenses.length) {
    warnings.push(`${plan.unattributedExpenses.length} expense line(s) could not be attributed to a load — not seeded, structural assertion D would otherwise fail on a guess`);
  }
  if (plan.loadsWithNoCharges.length) {
    warnings.push(`${plan.loadsWithNoCharges.length} load(s) listed in loads[] have no customer_charges (${plan.loadsWithNoCharges.join(", ")}) — not seeded, no customer to resolve without a guess`);
  }

  const loadIds: Record<string, string> = {};
  const invoiceIds: Record<string, string> = {};
  const driverBillIds: Record<string, string> = {};
  const expenseIds: string[] = [];
  const fuelTransactions: Array<{ fuelTransactionId: string; postedAt: string; amountCents: number }> = [];

  for (const planLoad of plan.loads) {
    const loadId = await seedLoad(client, operatingCompanyId, actorUserId, plan, planLoad);
    loadIds[planLoad.loadNumber] = loadId;

    // ROUND 143.3 — resolve the load's driver, unit, and trailer for fuel/expense linkage.
    const linkage = await client.query<{ driver_id: string | null; unit_id: string | null; trailer_id: string | null }>(
      `SELECT assigned_primary_driver_id::text AS driver_id, assigned_unit_id::text AS unit_id, assigned_trailer_id::text AS trailer_id
         FROM mdata.loads WHERE id = $1::uuid`,
      [loadId]
    );
    const driverId = linkage.rows[0]?.driver_id ?? null;
    const unitId = linkage.rows[0]?.unit_id ?? null;
    const trailerId = linkage.rows[0]?.trailer_id ?? null;

    const invoiceId = await seedInvoice(client, operatingCompanyId, actorUserId, loadId, planLoad);
    invoiceIds[planLoad.loadNumber] = invoiceId;

    const billId = await seedDriverBill(client, operatingCompanyId, actorUserId, plan.documentNumber, loadId, planLoad);
    driverBillIds[planLoad.loadNumber] = billId;

    const thisLoadExpenseIds: string[] = [];
    for (const expenseLine of planLoad.expenseLines) {
      const expenseId = await seedExpense(client, operatingCompanyId, actorUserId, loadId, planLoad.loadNumber, expenseLine);
      // ROUND 165 order 3 — null is a genuine, expected skip (a card fuel expense already covers
      // this exact load+amount), not an error; nothing to post, nothing to record as created.
      if (expenseId === null) {
        warnings.push(
          `skipped a regular expense for load ${planLoad.loadNumber} (${expenseLine.amountCents}c, "${expenseLine.description}") — a card fuel expense already exists for the same load and amount`
        );
        continue;
      }
      thisLoadExpenseIds.push(expenseId);
      expenseIds.push(expenseId);
    }
    for (const fuelLine of planLoad.fuelLines) {
      fuelTransactions.push(await seedFuel(client, operatingCompanyId, actorUserId, loadId, fuelLine, driverId, unitId, trailerId));
    }

    // GL — existing poster only, in-transaction (AP side of expenses). postSourceTransactionInClientTx
    // is the one poster that takes this transaction's own client, so it is safe to call here —
    // see the "TWO PHASES" note above for why the others are not.
    for (const expenseId of thisLoadExpenseIds) {
      await postSourceTransactionInClientTx(
        client as never,
        { operating_company_id: operatingCompanyId, source_transaction_type: "expense", source_transaction_id: expenseId },
        { userId: actorUserId }
      ).catch((err) => console.warn("seedSettlementDocument: expense AP posting did not post", expenseId, (err as Error)?.message));
    }
  }

  const settlementId = await seedDriverSettlement(client, operatingCompanyId, actorUserId, plan, Object.values(driverBillIds), input.is_sample_data ?? false);

  await seedFactoringAdvancePlaceholder();

  await appendCrudAudit(
    client,
    actorUserId,
    "driver_finance.settlement.alwaystrack_seed",
    { operating_company_id: operatingCompanyId, document_number: plan.documentNumber, settlement_id: settlementId, load_count: plan.loads.length },
    "info",
    "SEED-SETTLEMENT-DOCUMENT-06"
  );

  return {
    documentNumber: plan.documentNumber,
    alreadySeeded: false,
    settlementId,
    loadIds,
    invoiceIds,
    driverBillIds,
    expenseIds,
    fuelTransactions,
    loadsWithNoCharges: plan.loadsWithNoCharges,
    unattributedExpenses: plan.unattributedExpenses,
    warnings,
  };
}

export type GlPostingReport = {
  revrecEvent1: Record<string, boolean>; // loadNumber -> posted
  revrecEvent2: Record<string, boolean>;
  fuelPosted: Record<string, boolean>; // fuelTransactionId -> posted
  settlementPosted: boolean;
  settlementJournalEntryId: string | null;
  errors: string[];
};

/**
 * PHASE 2 — call this AFTER the caller has committed the transaction that ran
 * `seedSettlementDocument`. Posts the three GL legs that manage their own connection (revrec
 * two-event latch, fuel expense, settlement close) — the AP leg of expenses already posted
 * in-transaction, in phase 1. Never throws; every poster refusal is collected in `errors` and
 * returned, since a partial GL post on an already-committed document set is a report to act on,
 * not a reason to crash the caller.
 */
export async function postGlForSeededDocument(
  result: SeedSettlementDocumentResult,
  plan: Pick<SeedPlan, "endDate">,
  input: { operatingCompanyId: string; actorUserId: string }
): Promise<GlPostingReport> {
  const { operatingCompanyId, actorUserId } = input;
  const report: GlPostingReport = {
    revrecEvent1: {},
    revrecEvent2: {},
    fuelPosted: {},
    settlementPosted: false,
    settlementJournalEntryId: null,
    errors: [],
  };

  for (const [loadNumber, loadId] of Object.entries(result.loadIds)) {
    // Two-event latch — Event 1 at delivery, Event 2 at docs-received. This seeder treats the
    // settlement document itself as the docs-received evidence for historical backfill, so both
    // fire in the same pass rather than waiting on a separate live event.
    const event1 = await postLoadRevenueLatch({
      operating_company_id: operatingCompanyId,
      load_id: loadId,
      target_status: "delivered",
      entry_date_iso: plan.endDate,
      actor_user_id: actorUserId,
    }).catch((err) => {
      report.errors.push(`revrec Event 1 load ${loadNumber}: ${(err as Error)?.message}`);
      return null;
    });
    report.revrecEvent1[loadNumber] = Boolean(event1?.posted);

    const event2 = await postLoadRevenueLatch({
      operating_company_id: operatingCompanyId,
      load_id: loadId,
      target_status: "completed_docs_received",
      entry_date_iso: plan.endDate,
      actor_user_id: actorUserId,
    }).catch((err) => {
      report.errors.push(`revrec Event 2 load ${loadNumber}: ${(err as Error)?.message}`);
      return null;
    });
    report.revrecEvent2[loadNumber] = Boolean(event2?.posted);
  }

  for (const fuel of result.fuelTransactions) {
    const posted = await postFuelExpenseFromEvent({
      operating_company_id: operatingCompanyId,
      actor_user_id: actorUserId,
      fuel_event_id: fuel.fuelTransactionId,
      fuel_kind: "diesel",
      posted_at: fuel.postedAt,
      amount_cents: fuel.amountCents,
      posting_path: "company_direct",
    }).catch((err) => {
      report.errors.push(`fuel posting ${fuel.fuelTransactionId}: ${(err as Error)?.message}`);
      return null;
    });
    report.fuelPosted[fuel.fuelTransactionId] = posted?.result === "posted" || posted?.result === "already_posted";
  }

  if (result.settlementId) {
    // The canonical path — CC-3's wrapper (do not call closeSettlementPayRun directly here; see
    // the import comment above for why that would be a second path).
    const settled = await postLoadBookendedSettlementGlAfterClose({
      operatingCompanyId,
      settlementId: result.settlementId,
      actorUserId,
    }).catch((err: unknown) => {
      report.errors.push(`settlement close ${result.settlementId}: ${(err as Error)?.message}`);
      return null;
    });
    report.settlementPosted = Boolean(settled?.posted);
    report.settlementJournalEntryId = settled?.journal_entry_id ?? null;
    if (settled && !settled.posted && settled.error) report.errors.push(settled.error);
  }

  return report;
}

// GL — existing posters only, full list (no new GL math anywhere in this file):
//   postLoadRevenueLatch                    apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts
//   postFuelExpenseFromEvent                apps/backend/src/accounting/fuel-posting/poster.service.ts
//   postSourceTransactionInClientTx         apps/backend/src/accounting/posting-engine.service.ts (in-transaction, phase 1)
//   postLoadBookendedSettlementGlAfterClose apps/backend/src/driver-finance/settlement-payrun-close.service.ts (CC-3, ROUND 137 item 1 — see import comment)
//   postFactoringAdvanceEvent               apps/backend/src/accounting/factoring-posting/poster.service.ts (step 7, not yet wired — see above)
