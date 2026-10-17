/**
 * ROUND 180 / R-186 — Settlement Creator orchestration.
 *
 * EXISTING ENGINES ONLY — no second posting path. Caller owns the transaction.
 * Preview projects JE lines + control totals; Post is all-or-nothing inside the caller's client.
 *
 * Spec: docs/bus/09-25-2026-Devin-A-ROUND-180-SETTLEMENT-CREATOR-COMPANY-AND-DRIVER.md
 */

import { linkSettlementFuelRowToRelayFill } from "../fuel/relay-fill-link.service.js";
import { stampDocumentVoided } from "../accounting/void-document-stamp.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { createExpenseFromFuelTransaction, resolveFuelLineAccount, adoptRelayFillExpenseDocument, fillRelayFillExpenseSettlementRef } from "../fuel/fuel-expense-document.service.js";
import { enteredFuelRowHash, FuelProviderTransactionDuplicateError, refuseDuplicateProviderTransaction } from "../fuel/fuel-provider-reference.js";
import { findReceivedCardFillToAdopt } from "./creator-received-fill-adoption.js";
import { resolveLineItemAndAccount, type ResolvedLineAccount } from "../accounting/line-item-account.js";
import {
  createDriverCashAdvanceCore,
  reverseDriverAdvanceInClientTx,
} from "../cash-advances/cash-advance-create.js";
import type { TripType, DbClient } from "../dispatch/presettlement-link.service.js";
import { createBareSettlementForDocument, recomputeSettlementHeader } from "./settlement-load-reassignment.service.js";
import { closeSettlementPayRun, SettlementPayRunError, type SettlementPayRunResult } from "./settlement-payrun-close.service.js";
import {
  isAlwaysTrackSettlementNumber,
  isPresettlementPSeries,
} from "./settlement-display-id.js";
import { allocateNextSettlementSourceDocumentRef } from "./settlement-source-document-ref.service.js";
import { resolveRoleAccountOptional, type CoaRole } from "../accounting/coa-roles/resolver.service.js";
import { resolveDriverReimbursementParentAccount } from "../accounting/driver-subaccount-provision.service.js";
import { resolveCompanyDirectCreditAccount, postFuelExpenseOnClient, findPostedFuelReceipt, type FuelCategoryCode } from "../accounting/fuel-posting/poster.service.js";
import { creatorEmptyPayCents, creatorEmptyRateCents, creatorLoadedPayCents, creatorPayMiles } from "./settlement-creator-empty-pay.js";
import { resolveDriverPayItems } from "./settlement-creator-pay-item.js";
import { SettlementCreatorError } from "./settlement-creator-error.js";
import { resolveCreatorDeductionType } from "./settlement-creator-deduction-type.js";
import type { SettlementDeductionSourceType } from "./deductions.service.js";
import { milesTimesRateCents } from "./deadhead-rule.js";
import { EscrowResolverError, resolveDriverEscrowLiabilityAccount } from "./escrow-resolver.service.js";
import { createSettlementDeduction } from "./deductions.service.js";
import { SETTLEMENT_DEDUCTION_SOURCE_TABLE } from "./settlement-deduction-constants.js";
import { resolveDeductionPostingAccount } from "./settlement-lines-materialize.service.js";
import { stampCreatorExpenseSettlementNo } from "./settlement-creator-expense-settlement-no.js";
import { creatorPreflightRefusals } from "./settlement-creator-preflight.js";
import { buildInvoiceFromLoad } from "../accounting/from-load.js";
import { deliverLoadThroughDispatch, stampStopsFromTracking } from "./settlement-creator-deliver.js";
import { afterCommitMark, afterCommitRollbackTo } from "../lib/after-commit.js";
export { deliverLoadThroughDispatch } from "./settlement-creator-deliver.js";
import { DuplicateDocumentNumberError } from "../lib/qbo-custom-document-number.js";
import { assertCreatorDraftAdmissible } from "./settlement-creator-admission.js";
import { ensureDispatchedLoadsForCreator } from "./settlement-creator-seed-loads.js";
import { creatorTrailerChoice } from "./creator-trailer-choice.js";
import { setSettlementSourceDocumentRef } from "./settlement-source-document-ref.service.js";
import { attributeFuelLoadNumber, creatorLineLoadNumber, lineLoadNotFound } from "./settlement-creator-line-load.js";
import { resolveFuelLoadAtTime } from "../fuel/fuel-load-at-time.js";
import { sameEntityLoadUnitSql } from "../accounting/load-unit.sql.js";
import { isAuthorizedZeroRevenueLoad } from "./settlement-creator-zero-revenue.js";
import { sendDraftInvoice } from "../accounting/invoice-send.service.js";
import { voidDocument } from "../accounting/void-document.service.js";
import {
  reverseSettlementForVoid,
  reverseDeductionForVoid,
  SettlementVoidBlockedError,
} from "./void-document-callees.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { assertSubjectMayCloseOnClient } from "./feed-gate/feed-gate.service.js";
import type {
  SettlementCreatorCloseTotals,
  SettlementCreatorDraft,
  SettlementCreatorJeLine,
  SettlementCreatorLoadBlock,
  SettlementCreatorPostResult,
  SettlementCreatorPreview,
} from "./settlement-creator.types.js";
import { isReeferFuelItemName } from "../fuel/reefer-fuel.service.js";
import { voidCreatorOwedBills, writeCreatorOwedBill } from "./settlement-creator-owed-bill.js";
import { createExpenseInClientTx, postExpenseDocumentInClientTx, type CreateExpenseBody } from "../accounting/expense-writer.service.js";
import { applyCreatorMilesChoices, CreatorMilesChoiceError } from "./settlement-creator-miles-choice.js";

export type { DbClient };

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const AUDIT_TAG = "SETTLEMENT-CREATOR-R186";

async function accountByRole(
  client: DbClient,
  opco: string,
  role: CoaRole,
): Promise<{ id: string; account_number: string | null; account_name: string } | null> {
  // ROUND 365.1 — every account the creator previews or posts resolves by ROLE; there is no by-number lookup left here.
  const id = await resolveRoleAccountOptional(client, opco, role);
  if (!id) return null;
  const res = await client.query<{ id: string; account_number: string | null; account_name: string }>(
    `
      SELECT id::text, account_number, account_name
      FROM catalogs.accounts
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [id, opco],
  );
  return res.rows[0] ?? null;
}

/** RELAY-F442 — preview account for "Fuel Card Fee" (same resolve-by-name rule as the fee expense line). */
async function itemAccountByName(
  client: DbClient,
  opco: string,
  itemName: string,
): Promise<{ account_number: string | null; account_name: string | null } | null> {
  const res = await client.query<{ account_number: string | null; account_name: string | null }>(
    `
      SELECT a.account_number, a.account_name
        FROM catalogs.items i
        JOIN catalogs.accounts a ON a.id = i.default_expense_account_id AND a.operating_company_id = $1::uuid
       WHERE i.item_name = $2
         AND (i.operating_company_id = $1::uuid OR i.operating_company_id IS NULL)
         AND i.deactivated_at IS NULL
       ORDER BY (i.operating_company_id = $1::uuid) DESC
       LIMIT 1
    `,
    [opco, itemName],
  );
  return res.rows[0] ?? null;
}

/** The card rail's role — never its account number (2510 / 1295 on USMCA). Same roles the fuel poster resolves. */
function cardRailRole(card: "dreamline" | "relay"): CoaRole {
  return card === "dreamline" ? "fuel_card_payable_dreamline" : "fuel_wallet_relay";
}

function dollarsFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * RELAY-F442 / ROUND 192 — fuel net (total_cost) and card fee (fee_amount) stay separate.
 * receipt_cents / gallons×cpg−discount is the FUEL charge; fees_cents is the card fee, never folded in.
 */
/**
 * Rehearsal of 5769 on a prod fork (2026-10-11): postSourceTransactionInClientTx writes the expense's journal entry but
 * never stamps the expense header, so every Creator fuel / company expense read posting_status 'unposted' with no
 * journal_entry_id and the feed gate refused ("Expense 13508: not posted"). Same stamp the other expense posters write
 * (checks/check-create.service.ts, bank-line-expense.service.ts) — only on an unposted, unvoided expense of this company.
 */
/** RULING 443.66 D5 — the settlement's trailer by its equipment number: this company's (owned or leased), exactly one. */
export async function resolveCreatorTrailerId(client: DbClient, companyId: string, equipmentNumber: string | null | undefined): Promise<string | null> {
  const n = equipmentNumber?.trim();
  if (!n) return null;
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.equipment
      WHERE equipment_number = $2 AND (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid)
      LIMIT 2`,
    [companyId, n],
  );
  return r.rows.length === 1 ? r.rows[0]!.id : null;
}

// RULING 443.66 D4 — one status vocabulary: a posted expense reads status 'posted' AND posting_status 'posted'.
export async function stampExpensePosted(client: DbClient, companyId: string, expenseId: string, journalEntryId: string): Promise<void> {
  const r = await client.query(
    `UPDATE accounting.expenses
        SET posting_status = 'posted', status = 'posted', posted_at = COALESCE(posted_at, now()), journal_entry_id = $3::uuid, updated_at = now()
      WHERE id = $2::uuid AND operating_company_id = $1::uuid AND voided_at IS NULL AND posting_status <> 'reversed'`,
    [companyId, expenseId, journalEntryId],
  );
  if (r.rowCount !== 1) throw new SettlementCreatorError("expense_post_stamp_failed", `Expense ${expenseId}: posted but its header could not be stamped posted.`);
}

function fuelPurchaseNetAndFeeCents(fuel: {
  receipt_cents?: number | null;
  gallons?: number | null;
  cpg_cents?: number | null;
  fees_cents?: number | null;
  discount_cents?: number | null;
}): { netCents: number; feeCents: number } {
  const feeCents = Math.max(0, Math.round(Number(fuel.fees_cents || 0)));
  const netCents =
    fuel.receipt_cents != null
      ? Math.round(Number(fuel.receipt_cents))
      : Math.round(Number(fuel.gallons || 0) * Number(fuel.cpg_cents || 0)) -
        Math.round(Number(fuel.discount_cents || 0));
  return { netCents, feeCents };
}

/**
 * Delivered = has a delivery date on the AT PDF, or the operator cleared not_yet_delivered.
 * Matches settlement-creator-seed-loads (notDelivered = not_yet_delivered !== false && !delivery_date).
 * Not-delivered loads stay dispatched — no invoice / Faro until POD.
 */
function isDeliveredCreatorLoad(load: SettlementCreatorLoadBlock): boolean {
  return !(load.not_yet_delivered !== false && !load.delivery_date);
}

/**
 * Stamp stop actuals so sendDraftInvoice can evidence delivery (live stop departure OR
 * historical_backfill via closed settlement_lines.load_id). Never invent GL math.
 */

/**
 * LEAD RULING ROUND 443.7 (Option A) — write a load's driver-pay line on the adopted tour settlement. Booking already
 * wrote the same pay (unitemized) when the load joined the tour; that line is UPGRADED to the itemized Driver Pay item
 * (quantity, rate, unit, item) when the amounts agree, and the post refuses pay_mismatch when they do not — a second
 * line for the same pay is never written.
 */
/**
 * LEAD 443.167-R — the signed settlement restates an adopted load's open proforma driver bill. Only a live bill that is
 * status 'open', settled in no settlement, and priced differently from the signed pay is touched: it is voided
 * (void-not-delete) and ONE replacement bill "<load>-R" is minted at the signed miles x rate (same INSERT shape as
 * correctOpenDriverBillMileage / book-load). A bill already equal to the signed pay is left alone (a load booked by
 * this post).
 */
export async function restateOpenDriverBillToSignedPay(
  client: DbClient,
  input: {
    companyId: string; loadId: string; loadNumber: string; actorUserId: string; settlementNo: string;
    milesBasis: number; rateCents: number; loadedCents: number;
    emptyMiles: number | null; emptyRateCents: number | null; emptyCents: number;
  },
): Promise<void> {
  const bill = (await client.query<{ id: string; gross: string; driver_id: string; team_driver_id: string | null }>(
    `SELECT id::text, gross_amount_cents::text AS gross, driver_id::text, team_driver_id::text
       FROM driver_finance.driver_bills
      WHERE operating_company_id = $1::uuid AND load_id = $2::uuid AND voided_at IS NULL AND status <> 'void'
      ORDER BY created_at DESC`,
    [input.companyId, input.loadId],
  )).rows;
  if (bill.length !== 1) return;
  const b = bill[0]!;
  const signed = input.loadedCents + input.emptyCents;
  if (Number(b.gross) === signed) return;
  const state = (await client.query<{ status: string; settled: string | null; accrued: string | null }>(
    // A bill "settled" in a voided / cancelled settlement (a seed shell regrouped away) is settled in nothing.
    `SELECT b.status::text,
            (SELECT s.id::text FROM driver_finance.driver_settlements s
              WHERE s.id = b.settled_in_settlement_id AND s.voided_at IS NULL AND s.status <> 'cancelled') AS settled,
            b.accrued_bill_id::text AS accrued
       FROM driver_finance.driver_bills b WHERE b.id = $1::uuid`,
    [b.id],
  )).rows[0]!;
  if (state.status !== "open" || state.settled || state.accrued) {
    throw new SettlementCreatorError(
      "driver_bill_not_restatable",
      `Load ${input.loadNumber}: its driver bill (${dollarsFromCents(Number(b.gross))}) differs from the signed pay ${dollarsFromCents(signed)} and is ${state.settled ? "already settled" : state.accrued ? "accrued at delivery" : state.status} — restate it first.`,
    );
  }
  const reason = `443.167-R: restated to signed settlement ${input.settlementNo} pay ${dollarsFromCents(signed)} (was ${dollarsFromCents(Number(b.gross))})`;
  await client.query(
    `UPDATE driver_finance.driver_bills SET status = 'void', voided_at = now(), void_reason = $2, voided_by_user_id = $3::uuid, updated_at = now()
      WHERE id = $1::uuid AND status = 'open'`,
    [b.id, reason, input.actorUserId],
  );
  await client.query(
    `UPDATE driver_finance.settlement_lines SET is_active = false, voided_at = now(), void_reason = $2, voided_by_user_id = $3::uuid
      WHERE source_driver_bill_id = $1::uuid AND is_active = true`,
    [b.id, reason, input.actorUserId],
  );
  await client.query(
    `INSERT INTO driver_finance.driver_bills (
       operating_company_id, load_id, load_number, bill_number, driver_id, team_driver_id,
       gross_amount_cents, miles_basis, miles_basis_type, rate_per_mile_cents, status, notes,
       created_by_user_id, miles_deadhead, rate_empty_per_mile_cents, loaded_pay_cents, deadhead_pay_cents
     ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7, $8, 'short', $9, 'open', $10, $11::uuid, $12, $13, $14, $15)`,
    [input.companyId, input.loadId, input.loadNumber, `${input.loadNumber}-R`, b.driver_id, b.team_driver_id, signed, input.milesBasis,
      input.rateCents, reason, input.actorUserId, input.emptyMiles, input.emptyRateCents, input.loadedCents, input.emptyCents],
  );
  const { restampDriverBillUnitAndTrailer } = await import("./driver-bill-unit-trailer.js");
  await restampDriverBillUnitAndTrailer(client as never, { operatingCompanyId: input.companyId, loadId: input.loadId });
}

/**
 * OWNER STANDING RULING 443.167-R2 (2026-10-16 17:36 CT): "Transportation loads were settled here in usmca as 0 if they
 * are tied to usmca settlements." A seeded load adopted in faro_transportation $0 mode still carries the seed's USMCA
 * revenue: its rate, its line-haul charge and its Event 1 earn JE (Dr 1150 / Cr 4000). Before the $0 invoice it is
 * restated to $0: the earn JE is reversed through the JE reversal engine (reversed_by_je_id — the latch is then no longer
 * standing, standingLatchJePredicate), the charge lines go to $0, the rate to $0. Refused when the load already has a live
 * invoice (an issued document is never rewritten). No-op when the load is already $0.
 */
export async function restateAdoptedLoadToZeroRevenue(
  client: DbClient,
  input: { companyId: string; loadId: string; loadNumber: string; actorUserId: string; settlementNo: string },
): Promise<void> {
  const rate = Number((await client.query<{ r: string | null }>(
    `SELECT rate_total_cents::text AS r FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.loadId, input.companyId],
  )).rows[0]?.r ?? 0);
  if (!(rate > 0)) return;
  const inv = (await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM accounting.invoices WHERE source_load_id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL`,
    [input.loadId, input.companyId],
  )).rows[0]?.n ?? 0;
  if (inv > 0) {
    throw new SettlementCreatorError("zero_revenue_load_already_invoiced", `Load ${input.loadNumber}: a Transportation load settled at $0 in USMCA already has a live invoice — void it first.`);
  }
  const reason = `443.167-R2: Transportation load settled in USMCA at $0 on settlement ${input.settlementNo} (owner standing ruling)`;
  const earn = (await client.query<{ je: string }>(
    `SELECT DISTINCT p.journal_entry_uuid::text AS je
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE p.operating_company_id = $1::uuid AND p.load_id = $2::uuid AND p.source_transaction_type = 'load'
        AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`,
    [input.companyId, input.loadId],
  )).rows;
  const { reverseJournalEntryNoFlip } = await import("../accounting/journal-entries.service.js");
  for (const e of earn) {
    await reverseJournalEntryNoFlip(client as never, { operatingCompanyId: input.companyId, journalEntryId: e.je, reason, actorUserId: input.actorUserId });
  }
  await client.query(
    `UPDATE dispatch.load_charge_lines SET amount_cents = 0, updated_at = now()
      WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND COALESCE(is_active, true) AND amount_cents <> 0`,
    [input.loadId, input.companyId],
  );
  await client.query(
    `UPDATE mdata.loads SET rate_total_cents = 0, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.loadId, input.companyId],
  );
  await appendCrudAudit(client as never, input.actorUserId, "driver_finance.settlement_creator.load_restated_to_zero_revenue",
    { resource_type: "mdata.loads", resource_id: input.loadId, operating_company_id: input.companyId, prior_rate_cents: rate, reversed_journal_entries: earn.map((e) => e.je), reason },
    "warning", AUDIT_TAG);
}

async function writeDriverPayLine(
  client: DbClient,
  input: {
    settlementId: string; companyId: string; loadId: string; loadNumber: string;
    lineType: "earnings" | "deadhead_pay"; description: string; cents: number; quantity: number; rateCents: number; itemId: string;
  },
): Promise<void> {
  const existing = (
    await client.query<{ id: string; cents: string }>(
      `SELECT id::text, round(amount * 100)::bigint::text AS cents FROM driver_finance.settlement_lines
        WHERE settlement_id = $1::uuid AND load_id = $2::uuid AND line_type = $3 AND voided_at IS NULL
        ORDER BY created_at LIMIT 1`,
      [input.settlementId, input.loadId, input.lineType],
    )
  ).rows[0];
  if (existing) {
    if (Number(existing.cents) !== input.cents) {
      throw new SettlementCreatorError(
        "pay_mismatch",
        `Load ${input.loadNumber}: booking priced ${input.lineType === "earnings" ? "loaded" : "empty"} pay at ${dollarsFromCents(Number(existing.cents))} but the settlement says ${dollarsFromCents(input.cents)} — check the pay rate and miles.`,
      );
    }
    await client.query(
      `UPDATE driver_finance.settlement_lines
          SET description = $2, quantity = $3, rate_cents = $4, unit_of_measure = 'mi', item_id = $5::uuid
        WHERE id = $1::uuid`,
      [existing.id, input.description, input.quantity, input.rateCents, input.itemId],
    );
    return;
  }
  await client.query(
    `INSERT INTO driver_finance.settlement_lines (
       settlement_id, operating_company_id, line_type, description, amount, load_id,
       quantity, rate_cents, unit_of_measure, item_id, is_active, is_sample_data)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, 'mi', $9::uuid, true, false)`,
    [input.settlementId, input.companyId, input.lineType, input.description, dollarsFromCents(input.cents), input.loadId, input.quantity, input.rateCents, input.itemId],
  );
}


type PriorCreatorPostPayload = {
  expense_ids?: string[];
  owed_bill_ids?: string[];
  fuel_transaction_ids?: string[];
  advance_ids?: string[];
  /** 443.183 G9 — the loan the cash-advance engine books for the part of an advance above its bill's balance. */
  overflow_loan_ids?: string[];
  invoice_ids?: string[];
};

/** 443.183 G9 — the overflow loan createDriverCashAdvanceCore booked above the linked bill's balance (null when none). */
export function overflowLoanAdvanceId(data: Record<string, unknown> | undefined): string | null {
  const loan = (data as { overflow_loan?: { advance_id?: unknown } | null } | undefined)?.overflow_loan;
  return typeof loan?.advance_id === "string" && loan.advance_id ? loan.advance_id : null;
}

/** 443.183 G9 — every driver advance an Edit must reverse: the post's advances AND their overflow loans. */
export function advanceIdsUndoneOnEdit(prior: { advance_ids?: string[]; overflow_loan_ids?: string[] }): string[] {
  return [...new Set([...(prior.advance_ids ?? []), ...(prior.overflow_loan_ids ?? [])])];
}

/**
 * ROUND 180 §14 — Edit = void and repost. Existing engines only:
 * voidDocument (expense/invoice/factoring_advance) + reverseDriverAdvanceInClientTx +
 * reverseSettlementForVoid. Companion ids come from the prior settlement_creator.posted audit.
 */
async function voidPriorCreatorSettlementForEdit(
  client: DbClient,
  actorUserId: string,
  opco: string,
  settlementId: string,
  settlementLabel: string,
): Promise<string[]> {
  const reason = `Settlement Creator Edit = void and repost (${settlementLabel})`;
  const businessDate = companyBusinessDate();

  // ROUND 326 item 18 — a settlement the close engine posted (per-load A/P chain: bills, non-cash applications, net
  // pay bill payment) is not undone by the void cascade below, which reverses the retired bill-payment poster only.
  // Refuse by name rather than leave the chain's bills and payments standing under a cancelled settlement.
  const postedRun = await client.query<{ id: string }>(
    `SELECT id::text FROM driver_finance.payrun_gl_runs
      WHERE operating_company_id = $1::uuid AND settlement_id = $2::uuid AND status = 'posted' LIMIT 1`,
    [opco, settlementId],
  );
  // LEAD RULING 2026-10-11 (5769 repair, Option 1): a settlement posted through the close is replaced too — the engine
  // reverse at the end of this function (reverseSettlementForVoid) unwinds the pay run (bills, non-cash applications,
  // net-pay payments). Only a settlement whose post is NOT a Creator post still refuses.
  const creatorPosted = (await client.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM audit.audit_events WHERE event_class = 'driver_finance.settlement_creator.posted' AND payload->>'resource_id' = $1) AS ok`,
    [settlementId],
  )).rows[0]?.ok === true;
  if (postedRun.rows[0] && !creatorPosted) {
    throw new SettlementCreatorError(
      "settlement_posted_through_close",
      `Settlement ${settlementLabel} is posted (per-load A/P bills and payments, pay run ${postedRun.rows[0].id}). Undo that post first; Edit cannot replace a posted settlement.`,
    );
  }

  const audit = await client.query<{ payload: PriorCreatorPostPayload }>(
    `
      SELECT payload
        FROM audit.audit_events
       WHERE event_class = 'driver_finance.settlement_creator.posted'
         AND payload->>'resource_id' = $1
       ORDER BY created_at DESC
       LIMIT 1
    `,
    [settlementId],
  );
  const prior = audit.rows[0]?.payload ?? {};

  for (const expenseId of prior.expense_ids ?? []) {
    try {
      await voidDocument(client as never, {
        operatingCompanyId: opco,
        type: "expense",
        id: expenseId,
        reason,
        actor: { userId: actorUserId },
        currentBusinessDate: businessDate,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already.?void|not found|SOURCE_NOT_FOUND/i.test(msg)) throw err;
    }
  }

  // 443.110 G4 — the prior post's owed vendor bills are voided through the bill void engine (reversal JE).
  await voidCreatorOwedBills(client, { operatingCompanyId: opco, billIds: prior.owed_bill_ids ?? [], reason, actorUserId, currentBusinessDate: businessDate });

  // Option 1 (Lead ruling 2026-10-11, 5769 repair) — the prior fill rows are KEPT and re-used by the repost (a fill is one
  // provider transaction: voiding and re-inserting it collides on its provider hash), and the prior loads' sent invoices
  // (and any factoring advance on them) are KEPT: revenue never churns. Expenses, advances and the settlement are undone.

  // 443.183 G9 — an advance's overflow loan is a companion document of the post: it is undone with the advance.
  for (const advanceId of advanceIdsUndoneOnEdit(prior)) {
    const adv = await client.query<{
      id: string;
      liability_id: string | null;
      linked_bill_id: string | null;
      voided_at: string | null;
    }>(
      `
        SELECT id::text, liability_id::text, linked_bill_id::text, voided_at::text
          FROM driver_finance.driver_advances
         WHERE id = $1::uuid AND operating_company_id = $2::uuid
         LIMIT 1
      `,
      [advanceId, opco],
    );
    const row = adv.rows[0];
    if (!row || row.voided_at) continue;
    await reverseDriverAdvanceInClientTx(client as never, actorUserId, opco, {
      advanceId: row.id,
      liabilityId: row.liability_id,
      linkedBillId: row.linked_bill_id,
      reason,
    });
  }

  // 443.99 — the prior post's DEDUCTIONS are undone with it. reverseSettlementForVoid never touches deductions, so an Edit
  // left the old settlement's deductions live while the repost wrote new ones: the driver was deducted twice (measured:
  // load 13508, "Admin fee - GAS" $10.00 x2, 5769 posted 01:04 then reposted 03:52). Voided through the engine
  // (reverseDeductionForVoid -> voidSettlementDeduction; an already-collected deduction is a record-only void there):
  //   - every live deduction applied to this settlement (the Creator stamps applied_to_settlement_id since 443.32);
  //   - a legacy Creator post (before 443.32) left its deduction unlinked: the still-pending, unapplied deductions on this
  //     settlement's loads written in the SAME transaction as the settlement (created_at = the settlement's created_at).
  const priorDeductions = (await client.query<{ id: string }>(
    `SELECT d.id::text
       FROM driver_finance.driver_settlement_deductions d
       JOIN driver_finance.driver_settlements s ON s.id = $2::uuid AND s.operating_company_id = d.operating_company_id
      WHERE d.operating_company_id = $1::uuid AND d.voided_at IS NULL
        AND (d.applied_to_settlement_id = s.id
             OR (d.applied_to_settlement_id IS NULL AND d.status = 'pending' AND d.created_at = s.created_at
                 AND d.driver_id = s.driver_id
                 AND d.load_id IN (SELECT sl.load_id FROM driver_finance.settlement_lines sl
                                    WHERE sl.settlement_id = s.id AND sl.load_id IS NOT NULL)))`,
    [opco, settlementId],
  )).rows;
  for (const d of priorDeductions) {
    await reverseDeductionForVoid(client as never, { operatingCompanyId: opco, deductionId: d.id, reason, actor: { userId: actorUserId } });
  }

  try {
    await reverseSettlementForVoid(client, {
      operatingCompanyId: opco,
      settlementId,
      reason,
      actor: { userId: actorUserId },
    });
  } catch (err) {
    if (err instanceof SettlementVoidBlockedError) {
      throw new SettlementCreatorError(
        err.code,
        `Cannot Edit/void settlement ${settlementLabel}: ${err.code.replace(/_/g, " ")}.`,
      );
    }
    throw err;
  }

  await appendCrudAudit(
    client as never,
    actorUserId,
    "driver_finance.settlement_creator.edit_voided",
    {
      resource_type: "driver_finance.driver_settlements",
      resource_id: settlementId,
      operating_company_id: opco,
      settlement_label: settlementLabel,
      prior_expense_ids: prior.expense_ids ?? [],
      prior_owed_bill_ids: prior.owed_bill_ids ?? [],
      prior_invoice_ids: prior.invoice_ids ?? [],
      prior_advance_ids: prior.advance_ids ?? [],
      prior_overflow_loan_ids: prior.overflow_loan_ids ?? [],
      prior_fuel_transaction_ids: prior.fuel_transaction_ids ?? [],
      prior_deduction_ids: priorDeductions.map((d) => d.id),
    },
    "warning",
    AUDIT_TAG,
  );  return prior.fuel_transaction_ids ?? [];
}

/**
 * Project the JE the Post path will write. Resolves real account names from the live CoA.
 * Does not write. Post stays disabled until balanced + both PDF control totals match.
 */
export async function previewSettlementCreator(
  client: DbClient,
  draft: SettlementCreatorDraft,
): Promise<SettlementCreatorPreview> {
  const blockers: string[] = [];
  if (draft.operating_company_id !== USMCA) {
    blockers.push("Settlement Creator is USMCA-only.");
  }
  // R-186.1 — settlement_no may be empty (mint P-series on post), P-NNNN, or AlwaysTrack digits.
  if (!draft.driver_id) blockers.push("Driver is required.");
  // 443.110 G5 — the unit (truck) is required: the loads are booked on it and every line carries it.
  if (!draft.unit_id) blockers.push("Unit (truck) is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.period_end)) {
    blockers.push("Start and end dates are required (YYYY-MM-DD).");
  }
  if (!draft.loads?.length) blockers.push("At least one load block is required.");
  // ROUND 443.3 — full-Transportation settlement, Invoice no. shape / duplicates / already taken.
  try {
    await assertCreatorDraftAdmissible(client, draft);
  } catch (err) {
    if (err instanceof SettlementCreatorError) blockers.push(err.message);
    else throw err;
  }
  // Lead 443.38/443.39 — every known refusal of the draft, all in one pass (read-only), before the rehearsal post.
  blockers.push(...(await creatorPreflightRefusals(client as never, draft)));

  // ROUND 190/191 (2026-09-28) — the 09-25/09-24 fuel-feed gap root cause: this engine DOES seed
  // fuel.fuel_transactions from draft.fuel_purchases (below), but nothing ever verified the
  // caller actually populated it from the signed PDF. 5817/5818/5819 all posted with a period_end
  // (09-25/09-19) past the company's fuel-transaction frontier at the time (09-24) and zero
  // fuel_purchases declared — undetectable by the type system alone (an empty array is valid
  // syntax for "no fuel this period" AND for "caller forgot to check the PDF"). This gate refuses
  // to post a settlement whose period_end extends past the entity's current latest known fuel
  // transaction while fuel_purchases is empty, unless the caller explicitly confirms there is
  // genuinely no fuel on this settlement's PDF (confirmed_zero_fuel_purchases). A settlement whose
  // period stays within already-covered dates is unaffected (nothing new to seed).
  if (!draft.fuel_purchases?.length && !draft.confirmed_zero_fuel_purchases) {
    const frontier = await client.query<{ max_at: string | null }>(
      `SELECT MAX(transaction_at)::text AS max_at FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid`,
      [draft.operating_company_id],
    );
    const maxAt = frontier.rows[0]?.max_at ? frontier.rows[0].max_at.slice(0, 10) : null;
    if (!maxAt || draft.period_end > maxAt) {
      blockers.push(
        `This settlement's period_end (${draft.period_end}) extends past the last known fuel transaction (${maxAt ?? "none"}) with zero fuel_purchases declared. Check the signed PDF for card fuel lines and add them, or set confirmed_zero_fuel_purchases if this settlement genuinely has none.`,
      );
    }
  }

  const je_lines: SettlementCreatorJeLine[] = [];
  const push = (line: SettlementCreatorJeLine) => je_lines.push(line);

  // --- Fuel: Dr fuel item expense (+ Dr Fuel Card Fee when fees_cents > 0) / Cr card rail (2510 / 1295) ---
  for (const fuel of draft.fuel_purchases ?? []) {
    const { netCents, feeCents } = fuelPurchaseNetAndFeeCents(fuel);
    const amount = netCents + feeCents;
    if (amount <= 0) continue;
    const rail = await accountByRole(client, draft.operating_company_id, cardRailRole(fuel.card));
    // ROUND 363-CC2-D — the account the post will use (picked item / account, else the fuel-type item), not a guess.
    const fuelAcct = await resolveFuelLineAccount(client as never, draft.operating_company_id, fuel);
    const fuelExpense = "refused" in fuelAcct ? null : fuelAcct;
    if (!rail) blockers.push(`Card rail role '${cardRailRole(fuel.card)}' is not bound — bind it on the CoA Roles page.`);
    if ("refused" in fuelAcct) blockers.push(`Fuel line ${fuel.date}: ${fuelAcct.refused}`);
    if (netCents > 0) {
      push({
        load_number: fuel.load_number ?? null,
        account_number: fuelExpense?.account_number ?? null,
        account_name: fuelExpense?.account_name ?? "Fuel expense",
        debit_cents: netCents,
        credit_cents: 0,
        memo: `Fuel ${fuel.card} ${fuel.date}`,
        section: "fuel",
      });
    }
    if (feeCents > 0) {
      const feeAcct = await itemAccountByName(client, draft.operating_company_id, "Fuel Card Fee");
      if (!feeAcct) {
        blockers.push(`Fuel line ${fuel.date}: catalogs.items "Fuel Card Fee" missing or has no expense account — refusing rather than folding the fee into fuel.`);
      }
      push({
        load_number: fuel.load_number ?? null,
        account_number: feeAcct?.account_number ?? null,
        account_name: feeAcct?.account_name ?? "Fuel Card Fee",
        debit_cents: feeCents,
        credit_cents: 0,
        memo: `Fuel card fee ${fuel.card} ${fuel.date}`,
        section: "fuel",
      });
    }
    push({
      load_number: fuel.load_number ?? null,
      account_number: rail?.account_number ?? null,
      account_name: rail?.account_name ?? (fuel.card === "dreamline" ? "Dreamline" : "Relay"),
      debit_cents: 0,
      credit_cents: amount,
      memo: `Fuel card rail ${fuel.card}`,
      section: "fuel",
    });
  }

  // --- Expenses: Comp. Exp. → Cr card rail; Reimb. → settlement reimbursed path (no cash Cr) ---
  let companyExpensesCents = 0;
  for (const exp of draft.expenses ?? []) {
    if (exp.amount_cents <= 0) continue;
    if (exp.is_company_expense) {
      companyExpensesCents += exp.amount_cents;
      // ROUND 443.6 — paid now (relay / dreamline): Cr the card rail; owed: Cr Accounts Payable (a bill). No default.
      const card = exp.card ?? null;
      const rail = card === "owed"
        ? await accountByRole(client, draft.operating_company_id, "ap_control")
        : card
          ? await accountByRole(client, draft.operating_company_id, cardRailRole(card))
          : null;
      const itemAcct = await previewExpenseLineAccount(client, draft.operating_company_id, exp, blockers);
      const reeferRefusal = await reeferFuelExpenseRefusal(client, draft.operating_company_id, exp, (itemAcct as { item_id?: string | null } | null)?.item_id ?? null);
      if (reeferRefusal) blockers.push(reeferRefusal);
      push({
        load_number: exp.load_number ?? null,
        account_number: itemAcct?.account_number ?? null,
        account_name: itemAcct?.account_name ?? exp.item_name,
        debit_cents: exp.amount_cents,
        credit_cents: 0,
        memo: exp.description ?? exp.item_name,
        section: "expense",
      });
      push({
        load_number: exp.load_number ?? null,
        account_number: rail?.account_number ?? null,
        account_name: rail?.account_name ?? "Card rail",
        debit_cents: 0,
        credit_cents: exp.amount_cents,
        memo: card === "owed" ? `Comp. Exp. owed to ${exp.vendor_name ?? "vendor"} — bill (A/P)` : `Comp. Exp. Cr card`,
        section: "expense",
      });
      if (!card) blockers.push(`Company expense "${exp.item_name}": choose how it was paid — Relay, Dreamline, or Owed to the vendor.`);
      else if (!rail) blockers.push(card === "owed" ? "No A/P control account (ap_control) is bound." : `Expense card rail role '${cardRailRole(card)}' is not bound — bind it on the CoA Roles page.`);
    }
  }

  // Drv reimbursements (is_reimbursable) — Dr reimbursement expense / Cr 2175 (never card rail / never 6890/5310).
  const acct2175 = await resolveDriverReimbursementParentAccount(client as never, draft.operating_company_id);
  for (const exp of draft.expenses ?? []) {
    if (!exp.is_reimbursable || exp.amount_cents <= 0) continue;
    if (!acct2175) {
      blockers.push("Account 2175 Driver Reimbursements Payable missing — cannot post Drv reimbursements.");
      break;
    }
    const itemAcct = await previewExpenseLineAccount(client, draft.operating_company_id, exp, blockers);
    push({
      load_number: exp.load_number ?? null,
      account_number: itemAcct?.account_number ?? null,
      account_name: itemAcct?.account_name ?? exp.item_name,
      debit_cents: exp.amount_cents,
      credit_cents: 0,
      memo: exp.description ?? exp.item_name,
      section: "expense",
    });
    push({
      load_number: exp.load_number ?? null,
      account_number: acct2175.account_number ?? null,
      account_name: acct2175.account_name ?? "Driver Reimbursements Payable",
      debit_cents: 0,
      credit_cents: exp.amount_cents,
      memo: "Drv reimb Cr 2175 (never 6890/5310)",
      section: "expense",
    });
  }

  // Fuel also counts toward company expenses total on the AT company PDF (net + fee).
  for (const fuel of draft.fuel_purchases ?? []) {
    const { netCents, feeCents } = fuelPurchaseNetAndFeeCents(fuel);
    const amount = netCents + feeCents;
    if (amount > 0) companyExpensesCents += amount;
  }

  // --- Mileage pay (driver bill) — short miles × rate (company practical ≠ driver pay miles) ---
  let mileagePayCents = 0;
  for (const load of draft.loads ?? []) {
    // ROUND 443.4 — the same formula the post writes (pay rate x short miles); never the invoice amount.
    const loaded = creatorLoadedPayCents(load) ?? 0;
    // Empty miles × the empty rate, else the loaded per-mile rate (queue item 7, owner MILES SPEC).
    const empty = creatorEmptyPayCents(load);
    const pay = loaded + empty;
    if (pay <= 0) continue;
    mileagePayCents += pay;
    const drPay =
      await accountByRole(client, draft.operating_company_id, "driver_pay_expense");
    const crPay =
      await accountByRole(client, draft.operating_company_id, "driver_payroll_clearing");
    push({
      load_number: load.load_number,
      account_number: drPay?.account_number ?? null,
      account_name: drPay?.account_name ?? "Driver pay expense",
      debit_cents: pay,
      credit_cents: 0,
      memo: `Mileage pay load ${load.load_number}`,
      section: "mileage",
    });
    push({
      load_number: load.load_number,
      account_number: crPay?.account_number ?? null,
      account_name: crPay?.account_name ?? "Driver payable",
      debit_cents: 0,
      credit_cents: pay,
      memo: `Driver payable load ${load.load_number}`,
      section: "mileage",
    });
  }

  // Accessorials (customer charges) — projected on preview for JE completeness; invoice mint uses Book Load charges.
  for (const load of draft.loads ?? []) {
    for (const acc of load.accessorials ?? []) {
      if (acc.amount_cents <= 0) continue;
      const rev =
        await accountByRole(client, draft.operating_company_id, "accessorial_revenue");
      push({
        load_number: load.load_number,
        account_number: rev?.account_number ?? null,
        account_name: rev?.account_name ?? acc.item_name,
        debit_cents: 0,
        credit_cents: acc.amount_cents,
        memo: acc.description ?? acc.item_name,
        section: "accessorial",
      });
    }
  }

  // --- Extra reimbursements on driver net ---
  // ROUND 157-B fix: draft.reimbursements (distinct from draft.expenses is_reimbursable, which
  // already pushes a balanced Dr 6100 / Cr 2175 pair above) previously added straight to
  // reimbCents/driverNetCents with NO offsetting JE leg at all -- the same missing-debit class of
  // bug fixed for escrow above. A settlement whose only driver-net items are mileage pay + a bare
  // "reimbursements" line (settlement 5818's $15.25 LOVES/TPE scale-expense reimbursement, not
  // modeled as an is_reimbursable expense) would permanently fail the debit_total_cents ===
  // credit_total_cents check. Same account pair as the is_reimbursable path: Dr reimbursement
  // expense (other_operating_expense role -- never 6100 Telephone, ROUND 365.1) / Cr 2175 Driver Reimbursements Payable.
  let reimbCents = 0;
  const reimbItemAcct =
    await accountByRole(client, draft.operating_company_id, "other_operating_expense");
  const reimbAcct2175 = acct2175;
  for (const r of draft.reimbursements ?? []) {
    if (r.amount_cents <= 0) continue;
    reimbCents += r.amount_cents;
    if (!reimbAcct2175) {
      blockers.push("Account 2175 Driver Reimbursements Payable missing — cannot post reimbursements.");
      continue;
    }
    push({
      load_number: r.load_number ?? null,
      account_number: reimbItemAcct?.account_number ?? null,
      account_name: reimbItemAcct?.account_name ?? "Driver reimbursement expense",
      debit_cents: r.amount_cents,
      credit_cents: 0,
      memo: r.description || "Driver reimbursement",
      section: "reimbursement",
    });
    push({
      load_number: r.load_number ?? null,
      account_number: reimbAcct2175.account_number ?? null,
      account_name: reimbAcct2175.account_name ?? "Driver Reimbursements Payable",
      debit_cents: 0,
      credit_cents: r.amount_cents,
      memo: r.description || "Driver reimbursement",
      section: "reimbursement",
    });
  }
  for (const exp of draft.expenses ?? []) {
    if (exp.is_reimbursable && exp.amount_cents > 0) reimbCents += exp.amount_cents;
  }

  // Additional pay (detention / layover / bonus) — adds to driver net.
  // ROUND 157-B fix: previously summed into additionalPayCents with NO JE leg at all -- same
  // missing-leg class as escrow/reimbursements above. Mirrors the mileage-pay pair exactly (this
  // IS driver pay, just not mileage-based): Dr driver_pay_expense / Cr driver_payroll_clearing,
  // increasing what's payable to the driver (confirmed live need: settlement 5819's $50.00
  // Enlonada/Desenlonada additional pay, no other driver-net items besides mileage).
  let additionalPayCents = 0;
  const addPayExpenseAcct =
    await accountByRole(client, draft.operating_company_id, "driver_pay_expense");
  const addPayClearingAcct =
    await accountByRole(client, draft.operating_company_id, "driver_payroll_clearing");
  for (const p of draft.additional_pay ?? []) {
    if (p.amount_cents <= 0) continue;
    additionalPayCents += p.amount_cents;
    push({
      load_number: p.load_number ?? null,
      account_number: addPayExpenseAcct?.account_number ?? null,
      account_name: addPayExpenseAcct?.account_name ?? "Driver pay expense",
      debit_cents: p.amount_cents,
      credit_cents: 0,
      memo: p.description || "Additional pay",
      section: "mileage",
    });
    push({
      load_number: p.load_number ?? null,
      account_number: addPayClearingAcct?.account_number ?? null,
      account_name: addPayClearingAcct?.account_name ?? "Driver payable",
      debit_cents: 0,
      credit_cents: p.amount_cents,
      memo: p.description || "Additional pay",
      section: "mileage",
    });
  }

  // --- Deductions / escrow / advances / admin fee (driver net) ---
  // ROUND 157-B fix: both generic ("other") deductions and the admin fee previously had either no
  // JE leg (deductions) or a credit-only leg (admin fee) -- same missing/half-leg bug. Both route
  // to the SAME account at settlement-close time (createSettlementDeduction sourceType='other' ->
  // other_recovery role -> 7200, confirmed via deductions.service.ts), so both get the same pair
  // here: Dr driver_payroll_clearing (withheld from payable) / Cr 7200 income.
  const income7200 =
    await accountByRole(client, draft.operating_company_id, "other_recovery");
  const deductClearingAcct =
    await accountByRole(client, draft.operating_company_id, "driver_payroll_clearing");
  let deductionCents = 0;
  for (const d of draft.deductions ?? []) {
    if (d.amount_cents <= 0) continue;
    deductionCents += d.amount_cents;
    // LEAD 443.110 G14 — the credit leg is the account of the deduction's own type (its item), the account the close posts.
    let dedAcct: { account_number: string | null; account_name: string } | null = income7200;
    try {
      const t = await resolveCreatorDeductionType(client as never, draft.operating_company_id, d);
      dedAcct = (await client.query<{ account_number: string | null; account_name: string }>(
        `SELECT account_number, account_name FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [t.accountId, draft.operating_company_id])).rows[0] ?? null;
    } catch (err) {
      if (!(err instanceof SettlementCreatorError)) throw err;
      blockers.push(err.message);
    }
    push({
      load_number: d.load_number ?? null,
      account_number: deductClearingAcct?.account_number ?? null,
      account_name: deductClearingAcct?.account_name ?? "Driver payable",
      debit_cents: d.amount_cents,
      credit_cents: 0,
      memo: `${d.description || "Deduction"} (withheld from payable)`,
      section: "deduction",
    });
    push({
      load_number: d.load_number ?? null,
      account_number: dedAcct?.account_number ?? null,
      account_name: dedAcct?.account_name ?? "Driver Admin Fee & Chargeback Income",
      debit_cents: 0,
      credit_cents: d.amount_cents,
      memo: d.description || "Deduction",
      section: "deduction",
    });
  }
  const adminFeeCents = Math.max(0, Math.round(Number(draft.admin_fee_cents || 0)));
  if (adminFeeCents > 0) {
    push({
      load_number: null,
      account_number: deductClearingAcct?.account_number ?? null,
      account_name: deductClearingAcct?.account_name ?? "Driver payable",
      debit_cents: adminFeeCents,
      credit_cents: 0,
      memo: "Admin fee (withheld from payable)",
      section: "admin_fee",
    });
    push({
      load_number: null,
      account_number: income7200?.account_number ?? null,
      account_name: income7200?.account_name ?? "Driver Admin Fee & Chargeback Income",
      debit_cents: 0,
      credit_cents: adminFeeCents,
      memo: "Admin fee → 7200 income",
      section: "admin_fee",
    });
  }
  let escrowCents = 0;
  // Queue item 6 (2026-10-02): driver escrow is a liability owed to THIS driver, on the driver's own
  // 2100-00-0NN sub-account — the same account the close engine posts (resolveDriverEscrowLiabilityAccount).
  // Never the shared escrow default / 2400, never Faro, never a reserve. Unbound -> a blocker by name.
  let driverEscrow: { id: string; account_number: string | null; account_name: string } | null | undefined;
  for (const e of draft.escrow ?? []) {
    if (e.amount_cents <= 0) continue;
    escrowCents += e.amount_cents;
    if (driverEscrow === undefined) {
      driverEscrow = null;
      if (draft.driver_id) {
        try {
          const r = await resolveDriverEscrowLiabilityAccount(client as never, draft.operating_company_id, draft.driver_id);
          driverEscrow = (await client.query<{ id: string; account_number: string | null; account_name: string }>(
            `SELECT id::text, account_number, account_name FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
            [r.accountId, draft.operating_company_id],
          )).rows[0] ?? null;
        } catch (err) {
          if (!(err instanceof EscrowResolverError)) throw err;
          blockers.push(`Driver escrow: ${err.message}. Provision the driver's 2100-00-0NN escrow sub-account.`);
        }
      }
    }
    const liab = driverEscrow;
    // ROUND 157-B fix: the comment this replaced ("Balancing Dr comes from settlement net —
    // shown as reduction below") was wrong -- driverNetCents below is a control-total figure,
    // never its own JE leg, so an escrow credit with no debit left every settlement with escrow
    // but no fuel/company-expense activity permanently unbalanced (debit_total_cents !=
    // credit_total_cents at the full je_lines level -- confirmed live for settlement 5817, whose
    // preview had companyLegDebits=0 so the balanced-shortcut never applied). The mileage-pay
    // push above already credited driver_payroll_clearing (2100) for the FULL pay; withholding
    // escrow from that same payable is Dr 2100 / Cr escrow liability -- moving the liability from
    // "payable to driver" into "held in escrow", not creating money from nothing.
    const payClearing =
      await accountByRole(client, draft.operating_company_id, "driver_payroll_clearing");
    push({
      load_number: e.load_number ?? null,
      account_number: payClearing?.account_number ?? null,
      account_name: payClearing?.account_name ?? "Driver payable",
      debit_cents: e.amount_cents,
      credit_cents: 0,
      memo: `${e.description || "Escrow hold"} (withheld from payable)`,
      section: "escrow",
    });
    push({
      load_number: e.load_number ?? null,
      account_number: liab?.account_number ?? null,
      account_name: liab?.account_name ?? "Driver escrow (2100-00-0NN) — not provisioned",
      debit_cents: 0,
      credit_cents: e.amount_cents,
      memo: e.description || "Escrow hold",
      section: "escrow",
    });
  }
  let advanceCents = 0;
  for (const a of draft.advances ?? []) {
    if (a.amount_cents <= 0) continue;
    advanceCents += a.amount_cents;
  }

  const driverNetCents =
    mileagePayCents +
    reimbCents +
    additionalPayCents -
    deductionCents -
    adminFeeCents -
    escrowCents -
    advanceCents;

  const debit_total_cents = je_lines.reduce((s, l) => s + l.debit_cents, 0);
  const credit_total_cents = je_lines.reduce((s, l) => s + l.credit_cents, 0);
  // Escrow / advances / reimbursements affect net without always adding a balanced JE pair in this
  // preview pass — treat "balanced" as the projected company-expense legs (fuel+comp exp) being
  // Dr=Cr, which is the hard law for card-rail posts. Driver net is a separate control total.
  const companyLegDebits = je_lines
    .filter((l) => l.section === "fuel" || l.section === "expense")
    .reduce((s, l) => s + l.debit_cents, 0);
  const companyLegCredits = je_lines
    .filter((l) => l.section === "fuel" || l.section === "expense")
    .reduce((s, l) => s + l.credit_cents, 0);
  const balanced = companyLegDebits === companyLegCredits && companyLegDebits > 0
    ? true
    : debit_total_cents === credit_total_cents;

  if (companyLegDebits !== companyLegCredits) {
    blockers.push(`Company expense JE legs unbalanced (Dr ${companyLegDebits} ≠ Cr ${companyLegCredits}).`);
  }

  const company_expenses_matches_pdf = companyExpensesCents === Math.round(draft.pdf_company_expenses_cents);
  const driver_net_matches_pdf = driverNetCents === Math.round(draft.pdf_driver_net_cents);
  if (!company_expenses_matches_pdf) {
    blockers.push(
      `Company EXPENSES ${dollarsFromCents(companyExpensesCents)} ≠ PDF ${dollarsFromCents(draft.pdf_company_expenses_cents)}.`,
    );
  }
  if (!driver_net_matches_pdf) {
    blockers.push(
      `Driver net ${dollarsFromCents(driverNetCents)} ≠ PDF ${dollarsFromCents(draft.pdf_driver_net_cents)}.`,
    );
  }

  const can_post =
    blockers.length === 0 &&
    company_expenses_matches_pdf &&
    driver_net_matches_pdf &&
    balanced &&
    draft.operating_company_id === USMCA;

  return {
    je_lines,
    debit_total_cents,
    credit_total_cents,
    balanced,
    company_expenses_cents: companyExpensesCents,
    company_expenses_matches_pdf,
    driver_net_cents: driverNetCents,
    driver_net_matches_pdf,
    can_post,
    blockers,
  };
}

/**
 * Post one settlement from the AlwaysTrack PDF draft — all or nothing on the caller's client.
 * Owner 2026-09-26: Creator follows AlwaysTrack numbers (source_document_ref digits). Empty or
 * bare digits → NEW AlwaysTrack settlement (never attach to a prior open). Edit may override to
 * a free AT number or optional P-NNNN. R-186.1 (no AT mint on Book Load open) is unchanged —
 * Creator Post allocate is the authorized mint path.
 */
/** Owner 9:46 PM CT 2026-10-10: the load the driver was on THE DAY OF THE ADVANCE — the one load of this settlement whose
 *  pickup..delivery covers the day (an undelivered load runs open-ended). None or several -> null (the row's own load). */
export function loadNumberOnAdvanceDay(
  loads: Array<{ load_number: string; pickup_date?: string | null; delivery_date?: string | null }>,
  day: string | null | undefined
): string | null {
  if (!day) return null;
  const hits = loads.filter((l) => l.pickup_date && l.pickup_date <= day && (!l.delivery_date || day <= l.delivery_date));
  return hits.length === 1 ? hits[0]!.load_number : null;
}

export async function postSettlementCreatorInClientTx(
  client: DbClient,
  actorUserId: string,
  draft: SettlementCreatorDraft,
  /** R14 — rehearsal: the preview runs THIS post (no other code path) in a savepoint it rolls back. Only the up-front
   *  can_post refusal is skipped, so every engine refusal is reached and reported. */
  opts: { rehearsal?: boolean } = {},
): Promise<SettlementCreatorPostResult> {
  // ROUND 443.7 a (Option A) — the Creator closes the settlement itself through the pay-run close; the load-bookended
  // settlement ping (open on in_transit, close on delivery) steps aside for the rest of this transaction.
  await client.query(`SELECT set_config('app.settlement_creator_post', 'on', true)`);
  // RULING 443.66 D5 — the trailer the settlement document names. A draft carrying only trailer_equipment_number (all
  // 68 posted on 2026-10-10/11) left every expense header and line with no trailer; resolve it once here to this
  // company's equipment (owned or leased to it, exactly one) so every document below carries it.
  // LEAD 443.109 — the same decision that recorded the load's trailer at birth (creator-trailer-choice.ts).
  const docTrailer = await creatorTrailerChoice(client as never, draft);
  draft = {
    ...draft,
    trailer_id: draft.trailer_id ?? (docTrailer?.kind === "company" ? docTrailer.equipment_id : await resolveCreatorTrailerId(client, draft.operating_company_id, draft.trailer_equipment_number)),
  };
  const preview = await previewSettlementCreator(client, draft);
  // A dry run (previewSettlementCreatorThroughClose) writes the settlement inside a savepoint the caller rolls
  // back, so the posting engine can compute the totals the owner checks — it never refuses on the preview.
  if (!preview.can_post && !opts.rehearsal) {
    throw new SettlementCreatorError("preview_blocked", preview.blockers.join(" · ") || "Post blocked");
  }

  // ROUND 215.2 (verify-settlement-sample-tag-wired): a settlement's is_sample_data must be
  // DERIVED, never a hardcoded literal -- LV-SAMPLE-TAG-DISPATCH-HOLE shipped exactly that way
  // (column named, guard green, every auto-opened settlement still hardcoded "not sample data").
  // Derived off the driver, per the guard's own prescribed pattern ("driver for the weekly close").
  const driverSampleRes = await client.query<{ is_sample_data: boolean | null }>(
    `SELECT is_sample_data FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [draft.driver_id, draft.operating_company_id],
  );
  const isSampleData = driverSampleRes.rows[0]?.is_sample_data ?? false;

  const typedNo = (draft.settlement_no ?? "").trim();
  // A P-series pre-settlement shell stays open (nothing posts); an AlwaysTrack settlement posts through the close
  // engine — the ONE settlement calculator and poster (per-load A/P chain).
  const postsThroughClose = !(typedNo && isPresettlementPSeries(typedNo));
  let settlementId: string;
  // Option 1 — fill rows of the settlement this Edit replaces, re-used (never re-inserted) by the fuel loop below.
  let priorFuelIds: string[] = [];
  let displayId: string;
  let sourceDocumentRef: string | null = null;

  if (typedNo && isPresettlementPSeries(typedNo)) {
    // Optional Edit override → P-series shell (never attach to an existing P).
    const targetDisplay = typedNo.toUpperCase();
    const found = await client.query<{ id: string; display_id: string; status: string }>(
      `
        SELECT id::text, display_id, status::text
        FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1::uuid
          AND display_id = $2
          AND voided_at IS NULL
        LIMIT 1
      `,
      [draft.operating_company_id, targetDisplay],
    );
    if (found.rows[0]) {
      if (!draft.edit_void_repost) {
        throw new SettlementCreatorError(
          "settlement_exists",
          `${targetDisplay} already exists. Confirm Edit = void and repost to replace it.`,
        );
      }
      priorFuelIds = await voidPriorCreatorSettlementForEdit(
        client,
        actorUserId,
        draft.operating_company_id,
        found.rows[0].id,
        targetDisplay,
      );
    }
    const ins = await client.query<{ id: string }>(
      `
          INSERT INTO driver_finance.driver_settlements (
            operating_company_id, driver_id, status, display_id, period_start, period_end,
            trip_started_at, settlement_model, created_by_user_id, is_sample_data
          )
          VALUES ($1::uuid, $2::uuid, 'open', $3, $4::date, $5::date, $4::date, 'load_bookended', $6::uuid, $7)
          RETURNING id
        `,
      [
        draft.operating_company_id,
        draft.driver_id,
        targetDisplay,
        draft.period_start,
        draft.period_end,
        actorUserId,
        isSampleData,
      ],
    );
    settlementId = ins.rows[0]!.id;
    displayId = targetDisplay;
    await appendCrudAudit(
      client as never,
      actorUserId,
      "driver_finance.presettlement.created",
      { settlement_id: settlementId, display_id: displayId, round: "R-186.1" },
      "info",
      AUDIT_TAG,
    );
  } else {
    // Empty or AlwaysTrack digits → NEW AlwaysTrack settlement (source_document_ref).
    // Never attach to driver's existing open. Empty allocates under advisory lock.
    let atRef: string;
    if (typedNo && isAlwaysTrackSettlementNumber(typedNo)) {
      const existing = await client.query<{ id: string; display_id: string }>(
        `
          SELECT id::text, display_id
          FROM driver_finance.driver_settlements
          WHERE operating_company_id = $1::uuid
            AND source_document_ref = $2
            AND voided_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [draft.operating_company_id, typedNo],
      );
      if (existing.rows[0]) {
        if (!draft.edit_void_repost) {
          throw new SettlementCreatorError(
            "settlement_exists",
            `Settlement ${typedNo} already exists (${existing.rows[0].display_id}). Confirm Edit = void and repost to replace it.`,
          );
        }
        priorFuelIds = await voidPriorCreatorSettlementForEdit(
          client,
          actorUserId,
          draft.operating_company_id,
          existing.rows[0].id,
          typedNo,
        );
      }
      atRef = typedNo;
    } else if (!typedNo) {
      // Empty → always mint next AlwaysTrack number (never attach to driver's existing open).
      atRef = await allocateNextSettlementSourceDocumentRef(client, draft.operating_company_id);
    } else {
      throw new SettlementCreatorError(
        "invalid_settlement_no",
        `Settlement No. must be AlwaysTrack digits or P-NNNN (got "${typedNo}").`,
      );
    }
    // LEAD RULING ROUND 443.7 (Option A): booking these loads in THIS post joined them to their tour settlement
    // (SET-01, owner 2026-09-03: "the instant a load is CREATED it joins a pre-settlement"). The Creator adopts that
    // shell — stamped with the AlwaysTrack number and period, closed by the pay-run close below — instead of opening a
    // second settlement for the same pay. Never a settlement from an earlier tour: only one born in this transaction.
    const shells = (
      await client.query<{ id: string; display_id: string }>(
        `SELECT DISTINCT s.id::text, s.display_id
           FROM mdata.loads l
           JOIN driver_finance.driver_settlements s ON s.id = l.presettlement_link_id
          WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) AND l.soft_deleted_at IS NULL
            AND s.operating_company_id = $1::uuid AND s.driver_id = $3::uuid AND s.voided_at IS NULL
            AND s.posted_at IS NULL AND s.created_at = now()`,
        [draft.operating_company_id, draft.loads.map((l) => l.load_number.trim()), draft.driver_id],
      )
    ).rows;
    if (shells.length > 1) {
      throw new SettlementCreatorError(
        "loads_on_two_tours",
        `These loads joined ${shells.length} different tour settlements (${shells.map((x) => x.display_id).join(", ")}) when booked — one AlwaysTrack settlement covers one tour.`,
      );
    }
    if (shells.length === 1) {
      settlementId = shells[0]!.id;
      displayId = shells[0]!.display_id;
      await client.query(
        // The tour is complete per the signed settlement: close its trip exactly as createBareSettlementForDocument
        // creates an AlwaysTrack settlement (status 'closed', trip_closed_at = period end); the pay-run close posts it.
        `UPDATE driver_finance.driver_settlements
            SET period_start = $2::date, period_end = $3::date, status = 'closed',
                trip_closed_at = COALESCE(trip_closed_at, $3::date), updated_at = now()
          WHERE id = $1::uuid`,
        [settlementId, draft.period_start, draft.period_end],
      );
      const ref = await setSettlementSourceDocumentRef(client as never, {
        operatingCompanyId: draft.operating_company_id,
        settlementId,
        sourceDocumentRef: atRef,
        actorUserId,
      });
      if (!ref) throw new SettlementCreatorError("source_document_ref_set_failed", `Could not stamp ${atRef} on ${displayId}.`);
    } else {
      const bare = await createBareSettlementForDocument(client, {
        operating_company_id: draft.operating_company_id,
        driver_id: draft.driver_id,
        period_start: draft.period_start,
        period_end: draft.period_end,
        source_document_ref: atRef,
        actor_user_id: actorUserId,
        is_sample_data: isSampleData,
        status: "closed",
      });
      settlementId = bare.settlement_id;
      displayId = bare.display_id;
    }
    sourceDocumentRef = atRef;
  }

  const loadIds: string[] = [];
  const expenseIds: string[] = [];
  const owedBillIds: string[] = [];
  const companyExpenseMemos = new Map<string, number>();
  const fuelTxnIds: string[] = [];
  const advanceIds: string[] = [];
  const overflowLoanIds: string[] = [];
  const journalEntryIds: string[] = [];

  // Resolve loads (seeded via ensureDispatchedLoadsForCreator before this tx when missing).
  for (const load of draft.loads) {
    const found = await client.query<{
      id: string;
      assigned_primary_driver_id: string | null;
      assigned_unit_id: string | null;
      trip_type: string | null;
      tour_id: string | null;
      presettlement_link_id: string | null;
    }>(
      `
        SELECT id::text, assigned_primary_driver_id::text, assigned_unit_id::text,
               trip_type::text, tour_id::text, presettlement_link_id::text
        FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number = $2
          AND soft_deleted_at IS NULL
          AND COALESCE(is_sample_data, false) IS NOT TRUE
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [draft.operating_company_id, load.load_number.trim()],
    );
    const row = found.rows[0];
    if (!row) {
      throw new SettlementCreatorError(
        "load_not_found",
        `Load ${load.load_number} not found in USMCA after seed. Book Load path failed.`,
      );
    }
    loadIds.push(row.id);

    if (!row.assigned_primary_driver_id || row.assigned_primary_driver_id !== draft.driver_id) {
      await client.query(
        `
          UPDATE mdata.loads
          SET assigned_primary_driver_id = $1::uuid,
              assigned_unit_id = COALESCE($2::uuid, assigned_unit_id),
              updated_at = now()
          WHERE id = $3::uuid AND operating_company_id = $4::uuid
        `,
        [draft.driver_id, draft.unit_id ?? null, row.id, draft.operating_company_id],
      );
    }

    // SB return: join outbound tour when join_outbound_load_number provided.
    let tourId = row.tour_id;
    const tripType = (load.trip_type as TripType | null) ?? (row.trip_type as TripType | null) ?? "NB";
    if ((tripType === "SB" || tripType === "TR") && load.join_outbound_load_number?.trim()) {
      const outbound = await client.query<{ tour_id: string | null }>(
        `SELECT tour_id::text FROM mdata.loads
          WHERE operating_company_id = $1::uuid AND load_number = $2 AND soft_deleted_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [draft.operating_company_id, load.join_outbound_load_number.trim()],
      );
      if (outbound.rows[0]?.tour_id) {
        tourId = outbound.rows[0].tour_id;
        await client.query(
          `UPDATE mdata.loads SET tour_id = $1::uuid, trip_type = $2, updated_at = now()
            WHERE id = $3::uuid AND operating_company_id = $4::uuid`,
          [tourId, tripType, row.id, draft.operating_company_id],
        );
      }
    }

    // Prefer linking directly onto the resolved open P-settlement (R-186.1 editable target).
    if (row.presettlement_link_id !== settlementId) {
      await client.query(
        `UPDATE mdata.loads SET presettlement_link_id = $1::uuid, updated_at = now()
          WHERE id = $2::uuid AND operating_company_id = $3::uuid`,
        [settlementId, row.id, draft.operating_company_id],
      );
      await appendCrudAudit(
        client as never,
        actorUserId,
        "load.presettlement_linked",
        {
          load_id: row.id,
          load_number: load.load_number,
          settlement_id: settlementId,
          display_id: displayId,
          round: "R-186.1",
        },
        "info",
        AUDIT_TAG,
      );
    }
  }

  // Fuel → fuel.fuel_transactions → createExpenseFromFuelTransaction → post expense
  // RELAY-F442: total_cost = fuel net; fee_amount = card fee (own expense line via createExpenseFromFuelTransaction).
  // Relay fills posted through their own fill by this post (one posting per fill, however many rows link to it).
  const postedRelayFills = new Set<string>();
  for (const fuel of draft.fuel_purchases ?? []) {
    const { netCents, feeCents } = fuelPurchaseNetAndFeeCents(fuel);
    if (netCents + feeCents <= 0) continue;

    // LEAD 443.113 BCF-04 / BCF-05 — the fill's load through THE one fuel-to-load rule (creatorFillLoad), one of THIS
    // settlement's loads, and the driver + unit the fill carries come from that load.
    const fillLoad = await creatorFillLoad(client, draft, {
      label: `Fuel ${[fuel.vendor_name, fuel.invoice].filter(Boolean).join(" ") || "fill"} ${fuel.date}`,
      date: fuel.date, load_id: fuel.load_id, load_number: fuel.load_number, vendor_name: fuel.vendor_name, invoice: fuel.invoice,
    });
    const loadId = fillLoad.loadId;

    // Vendor: match by name or leave null → createExpenseFromFuelTransaction refuses without vendor.
    const vendor = fuel.vendor_name
      ? (
          await client.query<{ id: string }>(
            `SELECT id::text FROM mdata.vendors
              WHERE operating_company_id = $1::uuid
                AND lower(trim(vendor_name)) = lower(trim($2))
                AND COALESCE(is_sample_data, false) IS NOT TRUE
              LIMIT 1`,
            [draft.operating_company_id, fuel.vendor_name],
          )
        ).rows[0]
      : null;
    if (!vendor) {
      throw new SettlementCreatorError(
        "fuel_vendor_required",
        `Fuel line ${fuel.date}: map vendor "${fuel.vendor_name ?? ""}" in Vendors first.`,
      );
    }

    // ROUND 367.2 — one provider transaction is one purchase: refused by name before the INSERT (the database refuses it
    // too, 202615370600). source_row_hash is NOT NULL since 202614220000 and this INSERT never set it (every Settlement
    // Creator fuel line failed with 23502); it is keyed on the provider ID when there is one.
    // Option 1 (5769 repair) — the replaced settlement's own fill for this ticket + product is re-used: stamped with the
    // card / note / gallons the draft names, then posted below like a new fill. Never a second row for one purchase.
    const priorReused = priorFuelIds.length && fuel.invoice
      ? (await client.query<{ id: string }>(
          `UPDATE fuel.fuel_transactions ft
              SET fuel_card_id = (SELECT ct.id FROM catalogs.fuel_card_types ct WHERE ct.operating_company_id = $1::uuid AND ct.code = upper($5) AND ct.is_active),
                  notes = COALESCE($6, ft.notes), gallons = COALESCE(ft.gallons, $7), price_per_gallon = COALESCE(ft.price_per_gallon, $8),
                  load_id = COALESCE($9::uuid, ft.load_id), driver_id = $11::uuid, unit_id = $12::uuid, updated_at = now()
            WHERE ft.id = ANY($2::uuid[]) AND ft.operating_company_id = $1::uuid AND btrim(ft.transaction_reference) = btrim($3)
              AND ft.fuel_type = $4 AND ft.voided_at IS NULL AND ft.vendor_id = $10::uuid
            RETURNING ft.id::text`,
          [draft.operating_company_id, priorFuelIds, fuel.invoice, fuel.fuel_type ?? "diesel", fuel.card, fuel.notes?.trim() || null,
            fuel.gallons ?? null, fuel.cpg_cents == null ? null : dollarsFromCents(fuel.cpg_cents), loadId, vendor.id,
            fillLoad.driverId, fillLoad.unitId],
        )).rows[0]?.id ?? null
      : null;
    // LEAD 443.116 #1 — a card fill that was already RECEIVED (imported and posted on receipt) is ADOPTED by this
    // settlement on the same load: no second fuel row, no second expense, no second posting.
    const adoptedReceipt = !priorReused && fuel.card !== "relay"
      ? await findReceivedCardFillToAdopt(client, {
          operatingCompanyId: draft.operating_company_id,
          vendorId: vendor.id,
          reference: fuel.invoice,
          fuelType: fuel.fuel_type ?? "diesel",
          loadId,
        })
      : null;
    const reused = priorReused ?? adoptedReceipt;
    if (!reused) try {
      await refuseDuplicateProviderTransaction(client, {
        operatingCompanyId: draft.operating_company_id,
        vendorId: vendor.id,
        reference: fuel.invoice,
        fuelType: fuel.fuel_type ?? "diesel",
      });
    } catch (err) {
      if (err instanceof FuelProviderTransactionDuplicateError) throw new SettlementCreatorError(err.code, `Fuel line ${fuel.date}: ${err.message}`);
      throw err;
    }

    const fuelType = fuel.fuel_type ?? "diesel";
    // ACCT-F403 + 5772 fork rehearsal: a Relay fill is consumed from the prepaid wallet ONLY by the ingested Relay fill
    // (trg_relay_wallet_consumed_only_by_relay_fill). The Creator row LINKS to that fill (relay_fuel_transaction_id) and
    // posts no fuel; the fill posts at Relay's charge when its wallet line is matched in Banking. A Relay line with no
    // known Relay transaction is refused by name — never a wallet credit, never a guess.
    let relayFillId: string | null = null;
    if (fuel.card === "relay") {
      if (!fuel.relay_transaction_id) {
        throw new SettlementCreatorError("relay_transaction_required", `Fuel line ${fuel.date}: a Relay fill must name its Relay transaction (txn_…) from the Relay file.`);
      }
      relayFillId = (await client.query<{ id: string }>(
        `SELECT id::text FROM integrations.relay_fuel_transactions
          WHERE operating_company_id = $1::uuid AND transaction_id = $2 AND voided_at IS NULL AND is_active
          ORDER BY created_at LIMIT 1`,
        [draft.operating_company_id, fuel.relay_transaction_id],
      )).rows[0]?.id ?? null;
      if (!relayFillId) {
        throw new SettlementCreatorError("relay_fill_not_ingested", `Fuel line ${fuel.date}: Relay transaction ${fuel.relay_transaction_id} is not in this company's Relay fills.`);
      }
      if (reused) {
        await client.query(`UPDATE fuel.fuel_transactions SET relay_fuel_transaction_id = $2::uuid, updated_at = now() WHERE id = $1::uuid`, [reused, relayFillId]);
      }
    } else if (fuel.relay_transaction_id) {
      throw new SettlementCreatorError("relay_transaction_on_non_relay_card", `Fuel line ${fuel.date}: names Relay transaction ${fuel.relay_transaction_id} but is paid by ${fuel.card}.`);
    }
    // U25 — a reefer fill records the trailer it fueled when this company owns or leases it (ROUND 373.5: a record never
    // references another company's equipment) and only a Reefer trailer (reefer fuel never goes to a dry van).
    const inserted = reused ? { rows: [{ id: reused }] } : await client.query<{ id: string }>(
      `
        INSERT INTO fuel.fuel_transactions (
          operating_company_id, vendor_id, load_id, driver_id, unit_id,
          fuel_type, gallons, price_per_gallon, total_cost, fee_amount,
          purchased_at, transaction_at, transaction_reference, location_city,
          source, load_required, load_exemption_reason, created_by_user_id, source_row_hash, trailer_id,
          source_doc_id, fuel_card_id, notes, relay_fuel_transaction_id
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
          $6, $7, $8, $9, $10,
          $11::timestamptz, $11::timestamptz, $12, $13,
          'manual', $14, $15, $16::uuid, $17,
          (SELECT eq.id FROM mdata.equipment eq WHERE eq.id = $18::uuid AND eq.equipment_type ~* 'reefer'
              AND (eq.owner_company_id = $1::uuid OR eq.currently_leased_to_company_id = $1::uuid)),
          $19::uuid,
          -- D1/D2 (Lead audit 2026-10-11) — the card the draft names, never NULL: a USMCA row with no card evidence is
          -- read as Relay (fuel-credit-preference.ts) and posts nothing; a Dreamline fill must post Dr fuel / Cr 2510.
          (SELECT ct.id FROM catalogs.fuel_card_types ct WHERE ct.operating_company_id = $1::uuid AND ct.code = upper($20) AND ct.is_active),
          $21, $22::uuid
        )
        RETURNING id::text
      `,
      [
        draft.operating_company_id,
        vendor.id,
        loadId,
        fillLoad.driverId,
        fillLoad.unitId,
        fuelType,
        fuel.gallons,
        dollarsFromCents(fuel.cpg_cents),
        dollarsFromCents(netCents),
        dollarsFromCents(feeCents),
        `${fuel.date}T12:00:00.000Z`,
        fuel.invoice ?? null,
        fuel.location ?? null,
        Boolean(loadId),
        loadId ? null : "Settlement Creator fuel line with no load number on the PDF row.",
        actorUserId,
        enteredFuelRowHash(draft.operating_company_id, vendor.id, fuel.invoice, fuel.fuel_type ?? "diesel"),
        fuelType === "reefer_diesel" ? draft.trailer_id ?? null : null,
        // SETL-F444 — the receipt image, uploaded and confirmed before Post; null when none.
        fuel.source_doc_id ?? null,
        fuel.card,
        fuel.notes?.trim() || null,
        relayFillId,
      ],
    );
    const fuelId = inserted.rows[0]!.id;
    const cardStamp = await client.query<{ ok: boolean }>(`SELECT fuel_card_id IS NOT NULL AS ok FROM fuel.fuel_transactions WHERE id = $1::uuid`, [fuelId]);
    if (!cardStamp.rows[0]?.ok) {
      throw new SettlementCreatorError("fuel_card_type_missing", `Fuel line ${fuel.date}: no active fuel card type '${fuel.card.toUpperCase()}' for this company — the fill cannot say how it was paid.`);
    }
    fuelTxnIds.push(fuelId);

    const doc = await createExpenseFromFuelTransaction(client, {
      operating_company_id: draft.operating_company_id,
      fuel_transaction_id: fuelId,
      requesting_user_uuid: actorUserId,
      item_id: fuel.item_id ?? null,
      account_id: fuel.account_id ?? null,
      // R13: Creator knows the card rail from the PDF; post immediately (Dr fuel / Cr rail). A Relay fill (Lead option a,
      // 2026-10-11) is NOT posted as an expense against the wallet — trg_relay_wallet_consumed_only_by_relay_fill refuses
      // that — it takes the relay_link outcome and posts THROUGH its linked Relay fill as source, below. 5772 fork:
      // with creator_manual_entry on a Relay row the expense credited 1295 and the post was refused.
      company_direct_credit: fuel.card === "dreamline" ? "dreamline_card_payable" : "relay_fuel_wallet",
      creator_manual_entry: fuel.card !== "relay",
      trailer_id: draft.trailer_id ?? null,
    });
    if (doc.outcome === "refused") {
      throw new SettlementCreatorError("fuel_expense_refused", doc.reason);
    }
    // ACCT-F44335 (Lead ruling 2026-10-10): a relay-matched settlement fuel row posts THROUGH its
    // Relay fill as source (Dr fuel per product + Dr Fuel Card Fees / Cr Relay Fuel Wallet = relay
    // total). trg_relay_wallet_consumed_only_by_relay_fill accepts source_transaction_type='fuel_event'
    // + the relay fill UUID; the fill can never post twice.
    if (doc.outcome === "relay_link") {
      const link = await linkSettlementFuelRowToRelayFill(client as never, draft.operating_company_id, fuelId);
      // 5772 fork (2026-10-11): the Creator links a Relay row to its fill at insert (relay_transaction_id), so the link
      // function finds nothing left to link and returned null — the fill never posted. Use the fill this row is linked to;
      // a fill that carries two products (diesel + DEF on one ticket) posts ONCE for the settlement.
      const linkedFill = link.linked ?? relayFillId;
      if (linkedFill && !postedRelayFills.has(linkedFill)) {
        postedRelayFills.add(linkedFill);
        const relayFillId = linkedFill;
        const linesRows = await client.query<{
          fuel_type: string | null;
          fuel_product_code: string | null;
          fuel_type_description: string | null;
          total_discounted_price_cents: string | null;
          fee_amount_cents: string | null;
          fee_type: string | null;
        }>(
          `SELECT fuel_type, fuel_product_code, fuel_type_description,
                  total_discounted_price_cents, fee_amount_cents, fee_type
             FROM integrations.relay_fuel_transaction_lines
            WHERE relay_fuel_transaction_id = $1::uuid AND voided_at IS NULL
            ORDER BY line_index`,
          [relayFillId]
        );
        const { relayLineKind } = await import("../fuel/relay-product-kind.js");
        // 5772 fork (2026-10-11): a Relay line carries its product amount AND its fee on the same row (txn_8ZrcFQqRVKG5Kd:
        // one line, diesel 533.48 + sender_fee 2.00). Splitting lines by fee_type dropped the product and posted the fee alone
        // (fuel_posting_fee_exceeds_total). Cost = every line's product amount; fee = every line's fee.
        const productLines = linesRows.rows.filter(l => Number(l.total_discounted_price_cents ?? 0) > 0);
        const feeLines = linesRows.rows.filter(l => Number(l.fee_amount_cents ?? 0) > 0);
        const costLines: Array<{ fuel_kind: FuelCategoryCode; amount_cents: number }> = productLines.map(l => {
          const k = relayLineKind(l);
          return { fuel_kind: (k === "other" ? "misc" : k) as FuelCategoryCode, amount_cents: Math.round(Number(l.total_discounted_price_cents ?? 0)) };
        });
        // 443.52 C (CC-2): THE one fee rule (relayFillFeeCents — Relay's fees[] first, line fees only when empty). A CSV-imported
        // fill carries its fee in fees[] only (no per-line fee), so reading lines alone posted 32 fills with no fee leg.
        const fillFees = await client.query<{ fees: unknown[] | null; transaction_id: string }>(
          `SELECT fees, transaction_id FROM integrations.relay_fuel_transactions WHERE id = $1::uuid`,
          [relayFillId]
        );
        const { relayFillFeeCents } = await import("../integrations/relay-payments/relay-sender-fee-cents.js");
        const feeCents = relayFillFeeCents({
          transaction_id: fillFees.rows[0]?.transaction_id ?? relayFillId,
          fees: fillFees.rows[0]?.fees ?? null,
          line_fee_amount_cents: feeLines.map((l) => Number(l.fee_amount_cents ?? 0)),
        });
        const totalCents = costLines.reduce((s, l) => s + l.amount_cents, 0) + feeCents;
        if (totalCents <= 0) throw new SettlementCreatorError("relay_fill_no_amount", `Fuel line: relay fill ${relayFillId} has zero charge`);
        const txnRow = await client.query<{ unit_id: string | null; driver_id: string | null; transaction_at: string; fuel_type: string | null }>(
          `SELECT unit_id::text, driver_id::text, transaction_at::text, fuel_type FROM fuel.fuel_transactions WHERE id = $1::uuid`,
          [fuelId]
        );
        const txn = txnRow.rows[0];
        const primaryKind: FuelCategoryCode = txn?.fuel_type === "def" ? "def" : txn?.fuel_type === "reefer_diesel" ? "reefer" : "diesel";
        const fillPosted = await postFuelExpenseOnClient(client as never, {
          operating_company_id: draft.operating_company_id,
          actor_user_id: actorUserId,
          fuel_event_id: relayFillId,
          fuel_kind: primaryKind,
          posted_at: txn?.transaction_at ?? new Date().toISOString(),
          amount_cents: totalCents,
          posting_path: "company_direct",
          company_direct_credit: "relay_fuel_wallet",
          cost_lines: costLines.length > 0 ? costLines : undefined,
          fee_amount_cents: feeCents > 0 ? feeCents : null,
          unit_id: txn?.unit_id ?? null,
          driver_id: txn?.driver_id ?? null,
        });
        if (!fillPosted.journal_entry_id) throw new SettlementCreatorError("relay_fill_post_refused", `Fuel line: relay fill posting returned no journal entry`);
        journalEntryIds.push(fillPosted.journal_entry_id);
        // Lead 443.41 A: the fill gets its expense DOCUMENT, adopting the SAME journal entry (one JE, never two).
        const fillDoc = await adoptRelayFillExpenseDocument(client as never, {
          operating_company_id: draft.operating_company_id,
          relay_fill_id: relayFillId,
          journal_entry_id: fillPosted.journal_entry_id,
          requesting_user_uuid: actorUserId,
          // Lead 443.51 #5: the document names this settlement at adoption (settlement_no + source_settlement_ref).
          settlement_no: sourceDocumentRef ?? displayId,
          trailer_id: draft.trailer_id ?? null,
        });
        if (fillDoc.outcome === "refused") throw new SettlementCreatorError("relay_fill_document_refused", `Fuel line: ${fillDoc.reason}`);
        expenseIds.push(fillDoc.expense_id);
      }
    }
    if (adoptedReceipt && doc.outcome === "already_exists") {
      // LEAD 443.116 #1 — the received fill's document already carries its posting: name this settlement on it and adopt.
      const receiptDoc = await client.query<{ journal_entry_id: string | null }>(
        `SELECT journal_entry_id::text FROM accounting.expenses
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL AND posting_status = 'posted'`,
        [doc.expense_id, draft.operating_company_id],
      );
      const receiptJe = receiptDoc.rows[0]?.journal_entry_id;
      if (!receiptJe) {
        throw new SettlementCreatorError("received_fill_not_posted", `Fuel line ${fuel.date}: the received fill ${adoptedReceipt} has no posted expense document to adopt.`);
      }
      await fillRelayFillExpenseSettlementRef(client as never, {
        operating_company_id: draft.operating_company_id,
        expense_id: doc.expense_id,
        settlement_no: sourceDocumentRef ?? displayId,
        actor_user_uuid: actorUserId,
      });
      expenseIds.push(doc.expense_id);
      journalEntryIds.push(receiptJe);
    } else if (doc.outcome === "created" || doc.outcome === "already_exists") {
      expenseIds.push(doc.expense_id);
      // LEAD 443.121 #1 — ONE fuel receipt identity: if this receipt already posted through any writer (received at
      // import, matched at the bank), the document adopts that entry; the Creator never posts the same receipt twice.
      const receiptPosted = await findPostedFuelReceipt(client as never, draft.operating_company_id, "expense", doc.expense_id);
      if (receiptPosted?.journal_entry_id) {
        await stampExpensePosted(client, draft.operating_company_id, doc.expense_id, receiptPosted.journal_entry_id);
        journalEntryIds.push(receiptPosted.journal_entry_id);
        continue;
      }
      // Stamp Comp. Exp. card rail already set by fuel writer; post through existing engine.
      try {
        // 443.182 C — the one expense engine posts it on this transaction; the Creator keeps its own posted stamp.
        const posted = await postExpenseDocumentInClientTx(client as never, {
          operatingCompanyId: draft.operating_company_id,
          expenseId: doc.expense_id,
          actorUserId,
          stamp: "none",
          verify: async (jeId) => {
            if (!jeId) throw new Error("posting engine returned no journal entry");
          },
        });
        if (!posted.posted) throw new Error("posting engine returned no journal entry");
        await stampExpensePosted(client, draft.operating_company_id, doc.expense_id, posted.journalEntryId);
        journalEntryIds.push(posted.journalEntryId);
      } catch (err) {
        // ROUND 443.6 f — a posting refusal fails the whole post: never a fuel expense without its ledger entry.
        throw new SettlementCreatorError("fuel_expense_post_refused", `Fuel line ${fuel.date}: the ledger refused it — ${err instanceof Error ? err.message : String(err)}. Nothing was posted.`);
      }
    }
  }

  // Comp. Exp. (Y) → accounting.expenses + Cr card rail (2510/1295), NEVER A/P — same engines as fuel.
  async function resolveLoadIdByNumber(loadNumber: string | null | undefined): Promise<string | null> {
    if (!loadNumber?.trim()) return null;
    const found = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads
        WHERE operating_company_id = $1::uuid AND load_number = $2 AND soft_deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [draft.operating_company_id, loadNumber.trim()],
    );
    return found.rows[0]?.id ?? null;
  }

  // Advances → createDriverCashAdvanceCore (bill-payment / loan overflow handled inside core).
  // Owner 2026-10-10: resolve load_id from load_number so the engine ties the driver bill payment to that load.
  // OWNER 9:44 / 9:46 PM CT 2026-10-10: "A CASH ADVANCE IS A BILL PAYMENT TO THAT LOAD" — "we already have the design in
  // place". One driver bill per load; the advance is a payment applied to the bill of the load the driver was on THE DAY
  // OF THE ADVANCE, a document he matches manually in Banking. The existing design is B5 in createDriverCashAdvanceCore
  // (cash-advances/cash-advance-create.ts: linked_driver_bill_id — the amount clears that bill, overflow becomes a loan),
  // recovered by the close engine (settlement-payrun-close.service.ts loadRecoverableAdvances). The Creator used to pass
  // NO linked bill, so the advance was never a payment on any bill.
  const loadOnAdvanceDay = (day: string | null | undefined) => loadNumberOnAdvanceDay(draft.loads ?? [], day);
  for (const adv of draft.advances ?? []) {
    if (adv.amount_cents <= 0) continue;
    const advanceLoadNumber = loadOnAdvanceDay(adv.date) ?? adv.load_number ?? null;
    const advanceLoadId =
      (advanceLoadNumber === adv.load_number ? adv.load_id : null) ?? (await resolveLoadIdByNumber(advanceLoadNumber)) ?? null;
    let advanceBillId = adv.linked_driver_bill_id ?? null;
    if (!advanceBillId && advanceLoadId) {
      const bills = (
        await client.query<{ id: string }>(
          `SELECT id::text FROM driver_finance.driver_bills
            WHERE operating_company_id = $1::uuid AND load_id = $2::uuid AND driver_id = $3::uuid AND voided_at IS NULL
            LIMIT 2`,
          [draft.operating_company_id, advanceLoadId, draft.driver_id],
        )
      ).rows;
      if (bills.length !== 1) {
        throw new SettlementCreatorError(
          "advance_bill_not_found",
          `Advance ${dollarsFromCents(adv.amount_cents)} on ${adv.date ?? "?"}: load ${advanceLoadNumber ?? "?"} has ${bills.length} driver bills for this driver — one is required.`,
        );
      }
      advanceBillId = bills[0]!.id;
    }
    const created = await createDriverCashAdvanceCore(client as never, actorUserId, draft.operating_company_id, {
      driver_id: draft.driver_id,
      amount: dollarsFromCents(adv.amount_cents),
      purpose: "other",
      disbursement_method: "historical_backfill",
      recipient_info: {
        recipient_type: "driver",
        notes: adv.description ?? `Settlement ${draft.settlement_no} advance`,
      },
      linked_driver_bill_id: advanceBillId,
      load_id: advanceLoadId,
      historical_posting_date: adv.date ?? null,
      unit_id: draft.unit_id ?? null,
      liability_type: "advance",
    });
    if (!created.ok) {
      throw new SettlementCreatorError("advance_failed", created.message ?? created.error);
    }
    advanceIds.push(created.advanceId);
    // 443.183 G9 — the part above the bill's balance is booked by the engine as a separate loan; keep its id so an Edit voids it.
    const overflowLoanId = overflowLoanAdvanceId(created.data);
    if (overflowLoanId) overflowLoanIds.push(overflowLoanId);
  }

  // ROUND 443.6 — COMPANY EXPENSE: real payment source, full stamp, bill when owed (owner 2026-10-10: "create bills,
  // bill expenses stamp"). Law doc §3: paid now = Dr expense / Cr bank-card; owed = Dr expense / Cr A/P via a bill.
  for (const exp of draft.expenses ?? []) {
    if (!exp.is_company_expense || exp.amount_cents <= 0) continue;
    const card = exp.card ?? null;
    if (!card) {
      throw new SettlementCreatorError("expense_payment_source_required", `Company expense "${exp.item_name}": choose how it was paid — Relay, Dreamline, or Owed to the vendor.`);
    }
    const vendor = exp.vendor_name?.trim()
      ? (
          await client.query<{ id: string }>(
            `SELECT id::text FROM mdata.vendors
              WHERE operating_company_id = $1::uuid AND lower(trim(vendor_name)) = lower(trim($2))
                AND COALESCE(is_sample_data, false) IS NOT TRUE
              LIMIT 1`,
            [draft.operating_company_id, exp.vendor_name],
          )
        ).rows[0]
      : null;
    if (!vendor) {
      throw new SettlementCreatorError("expense_vendor_required", `Company expense "${exp.item_name}": map vendor "${exp.vendor_name ?? ""}" in Vendors first.`);
    }
    const itemAcct = await resolveExpenseLineAccount(client, draft.operating_company_id, exp);
    if (!itemAcct?.item_id) {
      throw new SettlementCreatorError("expense_item_unresolved", `Company expense "${exp.item_name}": pick the item it posts to.`);
    }
    const reeferRefusal = await reeferFuelExpenseRefusal(client, draft.operating_company_id, exp, itemAcct.item_id);
    if (reeferRefusal) throw new SettlementCreatorError("reefer_fuel_needs_gallons", reeferRefusal);
    // Every settlement item belongs to a load (443.5). LEAD 443.113 BCF-04 / BCF-05 — the same one rule as a fuel fill
    // (creatorFillLoad): one of THIS settlement's loads, and the expense carries that load's driver + unit.
    const expLoad = await creatorFillLoad(client, draft, {
      label: `Company expense "${exp.item_name}"`,
      date: exp.date, load_id: exp.load_id, load_number: exp.load_number, vendor_name: exp.vendor_name, invoice: exp.vendor_document_number,
    });
    const loadId = expLoad.loadId;
    // Quantity / unit / rate as the source gave them (gallons of DEF); a flat charge is 1 each.
    const qty = exp.quantity != null && exp.quantity > 0 ? Number(exp.quantity) : 1;
    const uom = exp.quantity != null && exp.quantity > 0 ? (exp.unit_of_measure?.trim() || "each") : "each";
    const rateCents = qty === 1 ? exp.amount_cents : Number((exp.amount_cents / qty).toFixed(4));
    if (milesTimesRateCents(qty, rateCents) !== exp.amount_cents) {
      throw new SettlementCreatorError("expense_quantity_rate_mismatch", `Company expense "${exp.item_name}": ${qty} ${uom} does not price to ${dollarsFromCents(exp.amount_cents)}.`);
    }
    if (card === "owed") {
      // Owed -> a BILL in Accounts Payable. 443.110 G4: numbered on the load spine, GL-posted here (Dr item account /
      // Cr A/P with the vendor), id kept in the posted audit so Edit voids it (settlement-creator-owed-bill.ts).
      const owed = await writeCreatorOwedBill(client, {
        operatingCompanyId: draft.operating_company_id,
        actorUserId,
        vendorId: vendor.id,
        vendorDocumentNumber: exp.vendor_document_number,
        loadId,
        // ROUND 443.6 c / 443.113 BCF-04 — the bill carries its LOAD's driver and unit (and the settlement's trailer).
        driverId: expLoad.driverId,
        unitId: expLoad.unitId,
        trailerId: draft.trailer_id ?? null,
        billDate: exp.date,
        amountCents: exp.amount_cents,
        memo: `[SC ${draft.settlement_no}] ${exp.description ?? exp.item_name}`.slice(0, 500),
        itemId: itemAcct.item_id,
        accountId: itemAcct.id,
        quantity: qty,
        rateCents,
        unitOfMeasure: uom,
        description: exp.description ?? exp.item_name ?? null,
        label: exp.item_name,
      });
      owedBillIds.push(owed.billId);
      journalEntryIds.push(owed.journalEntryId);
      continue;
    }
    const preference = card === "dreamline" ? "dreamline_card_payable" : "relay_fuel_wallet";
    const { account_id: paymentAccountId } = await resolveCompanyDirectCreditAccount(client as never, draft.operating_company_id, preference);
    // 443.110 G13 — a paid-now company expense goes through THE shared expense writer (expenses.routes.ts
    // createExpenseInClientTx), like every other expense: load-spine number + expense_load_links row, the vendor-document
    // duplicate refusal, the unit from the load, item / quantity / rate / UoM and driver / unit / trailer on the line.
    // The memo is the writer's double-submit key, so a repeated description on this settlement gets its position.
    const baseMemo = `[SC ${draft.settlement_no}] ${exp.description ?? exp.item_name}`.slice(0, 480);
    const memoSeen = (companyExpenseMemos.get(baseMemo) ?? 0) + 1;
    companyExpenseMemos.set(baseMemo, memoSeen);
    const memo = memoSeen === 1 ? baseMemo : `${baseMemo} (${memoSeen})`;
    const written = await createExpenseInClientTx(
      client,
      {
        operating_company_id: draft.operating_company_id,
        driver_id: expLoad.driverId,
        category_account_id: itemAcct.id,
        expense_date: exp.date,
        amount_cents: exp.amount_cents,
        vendor_uuid: vendor.id,
        memo,
        is_company_expense: true,
        payment_account_uuid: paymentAccountId,
        load_id: loadId,
        unit_id: expLoad.unitId,
        trailer_id: draft.trailer_id ?? null,
        vendor_document_number: exp.vendor_document_number?.trim() || null,
        item_id: itemAcct.item_id,
        quantity: qty,
        rate_cents: rateCents,
        unit_of_measure: uom,
      } as CreateExpenseBody,
      actorUserId,
    );
    if (!("expense_id" in written) || !written.expense_id) {
      const refusal = Object.keys(written)[0] ?? "refused";
      throw new SettlementCreatorError(
        "expense_writer_refused",
        `Company expense "${exp.item_name}": the expense writer refused it (${refusal}${"existingExpenseId" in written && written.existingExpenseId ? ` — existing expense ${written.existingExpenseId}` : ""}). Nothing was posted.`,
      );
    }
    const expenseId: string = written.expense_id;
    expenseIds.push(expenseId);
    // ROUND 443.6 f — a posting refusal fails the whole post: never a document without its ledger entry. The writer posts
    // in this transaction when the company's expense-posting flag is on; otherwise the Creator posts it here.
    try {
      let journalEntryId = written.posted_journal_entry_id;
      if (!journalEntryId) {
        // 443.182 C — the one expense engine posts it on this transaction; the Creator keeps its own posted stamp.
        const posted = await postExpenseDocumentInClientTx(client as never, {
          operatingCompanyId: draft.operating_company_id,
          expenseId,
          actorUserId,
          stamp: "none",
        });
        journalEntryId = posted.posted ? posted.journalEntryId : null;
      }
      if (!journalEntryId) throw new Error("posting engine returned no journal entry");
      await stampExpensePosted(client, draft.operating_company_id, expenseId, journalEntryId);
      journalEntryIds.push(journalEntryId);
    } catch (err) {
      throw new SettlementCreatorError("expense_post_refused", `Company expense "${exp.item_name}": the ledger refused it — ${err instanceof Error ? err.message : String(err)}. Nothing was posted.`);
    }
  }

  // Reimbursable expenses + explicit reimbursements → settlement_lines (driver net; no cash Cr).
  // RULING 443.66 D1 — a reimbursement line carries its item (this company's), 1 x amount 'each', so the per-load A/P
  // bill line the close engine builds from it names the item too. No item on the document -> the line stays item-less.
  const companyItem = async (itemId: string | null | undefined): Promise<string | null> =>
    itemId
      ? (await client.query<{ id: string }>(
          `SELECT id::text FROM catalogs.items WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
          [itemId, draft.operating_company_id],
        )).rows[0]?.id ?? null
      : null;
  for (const r of draft.reimbursements ?? []) {
    if (r.amount_cents <= 0) continue;
    const rItem = await companyItem(r.item_id);
    // 443.110 G5 — the draft line names its load; it was dropped, so the reimbursement was written with no load.
    const rLoadId = await creatorLineLoadId(client, draft, { label: `Reimbursement "${r.description ?? ""}"`, load_number: r.load_number });
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id, operating_company_id, line_type, description, amount, is_active, is_sample_data,
          item_id, quantity, rate_cents, unit_of_measure, load_id
        )
        VALUES ($1::uuid, $2::uuid, 'reimbursement', $3, $4, true, false,
                $5::uuid, CASE WHEN $5::uuid IS NULL THEN NULL ELSE 1 END, CASE WHEN $5::uuid IS NULL THEN NULL ELSE $6::bigint END,
                CASE WHEN $5::uuid IS NULL THEN NULL ELSE 'each' END, $7::uuid)
      `,
      [
        settlementId,
        draft.operating_company_id,
        r.description || `Settlement ${draft.settlement_no} reimbursement`,
        dollarsFromCents(r.amount_cents),
        rItem,
        r.amount_cents,
        rLoadId,
      ],
    );
  }
  for (const exp of draft.expenses ?? []) {
    if (!exp.is_reimbursable || exp.amount_cents <= 0) continue;
    // ROUND 363-CC2-D — the line carries its own load and the account it posts to at close (posting_account_id,
    // read first by loadSettlementPayItems); it used to carry neither, so close assigned the load by date and the
    // account by a NULL reimbursement type.
    const acct = await resolveExpenseLineAccount(client, draft.operating_company_id, exp);
    if (!acct) throw new SettlementCreatorError("expense_account_missing", `No expense account for reimbursement "${exp.item_name}".`);
    // 443.110 G5 — typed load, else the settlement load covering the expense date; never written with no load.
    const lineLoadId = await creatorLineLoadId(client, draft, { label: `Reimbursable expense "${exp.item_name}"`, load_id: exp.load_id, load_number: exp.load_number, date: exp.date });
    const expItem = await companyItem(exp.item_id);
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id, operating_company_id, line_type, description, amount, is_active, is_sample_data,
          load_id, posting_account_id, item_id, quantity, rate_cents, unit_of_measure
        )
        VALUES ($1::uuid, $2::uuid, 'reimbursement', $3, $4, true, false, $5::uuid, $6::uuid,
                $7::uuid, CASE WHEN $7::uuid IS NULL THEN NULL ELSE 1 END, CASE WHEN $7::uuid IS NULL THEN NULL ELSE $8::bigint END,
                CASE WHEN $7::uuid IS NULL THEN NULL ELSE 'each' END)
      `,
      [
        settlementId,
        draft.operating_company_id,
        exp.description ?? exp.item_name,
        dollarsFromCents(exp.amount_cents),
        lineLoadId,
        acct.id,
        expItem,
        exp.amount_cents,
      ],
    );
  }

  // Escrow holds from the PDF → createHistoricalEscrowHold (sign from transaction_type; existing engine).
  for (const e of draft.escrow ?? []) {
    if (e.amount_cents <= 0) continue;
    // Owner rule 2026-10-02: every settlement item belongs to a load. The default $25 escrow line carries no
    // load number — it belongs to the settlement's first load.
    const loadId = await resolveLoadIdByNumber(e.load_number?.trim() || draft.loads?.[0]?.load_number);
    if (!loadId) {
      throw new SettlementCreatorError(
        "escrow_load_required",
        `Escrow "${e.description || "hold"}" needs a load number so it links to the tour.`,
      );
    }
    // ROUND 326 item 18 — escrow is a settlement line (escrow_contribution) the close engine reads, posts to the
    // driver's 2100-00-0NN escrow account and records in the escrow ledger ONCE. Writing the ledger hold here as
    // well (the former createHistoricalEscrowHold call) would hold the same $25 twice.
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id, operating_company_id, line_type, description, amount, load_id, is_active, is_sample_data
        )
        VALUES ($1::uuid, $2::uuid, 'escrow_contribution', $3, $4, $5::uuid, true, false)
      `,
      [
        settlementId,
        draft.operating_company_id,
        e.description || `Settlement ${draft.settlement_no} escrow`,
        dollarsFromCents(e.amount_cents),
        loadId,
      ],
    );
  }

  // Additional pay → settlement_lines (detention_pay / extra_pay). Never reimbursement.
  for (const p of draft.additional_pay ?? []) {
    if (p.amount_cents <= 0) continue;
    const lineType = p.pay_kind === "detention" ? "detention_pay" : "extra_pay";
    // 443.110 G5 — additional pay belongs to its load (typed, else the settlement's only load); never load-less.
    const loadId = await creatorLineLoadId(client, draft, { label: `Additional pay "${p.description ?? ""}"`, load_number: p.load_number });
    // Fork rehearsal of 5771 (2026-10-11): the insert dropped the draft's item_id, so every extra-pay line hit
    // settlement_lines_extra_pay_requires_item. The item (this company's, active) is written; a flat charge is 1 x amount.
    const itemId = p.item_id
      ? (await client.query<{ id: string }>(
          `SELECT id::text FROM catalogs.items WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
          [p.item_id, draft.operating_company_id],
        )).rows[0]?.id ?? null
      : null;
    if (lineType === "extra_pay" && !itemId) {
      throw new SettlementCreatorError("extra_pay_item_required", `Additional pay "${p.description}": pick its Driver Pay item (none, or not this company's).`);
    }
    const qty = p.quantity != null && Number(p.quantity) > 0 ? Number(p.quantity) : 1;
    const rateCents = qty === 1 ? p.amount_cents : Math.round(p.amount_cents / qty);
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id, operating_company_id, line_type, description, amount, load_id, item_id, quantity, rate_cents,
          unit_of_measure, is_active, is_sample_data
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::uuid, $8, $9, 'each', true, false)
      `,
      [
        settlementId,
        draft.operating_company_id,
        lineType,
        p.description || `${p.pay_kind ?? "other"} pay`,
        dollarsFromCents(p.amount_cents),
        loadId,
        itemId,
        itemId ? qty : null,
        itemId ? rateCents : null,
      ],
    );
  }

  // Deductions + admin fee → createSettlementDeduction (other → 7200 on close) + apply to this settlement.
  async function applyDeduction(amountCents: number, reason: string, loadNumber: string | null | undefined, sourceType: SettlementDeductionSourceType) {
    if (amountCents <= 0) return;
    // ROUND 443.5 — a deduction belongs to its load; missing or unknown refuses (never settlement-only).
    const loadId = loadNumber?.trim() ? await resolveLoadIdByNumber(loadNumber.trim()) : null;
    if (!loadId) {
      throw new SettlementCreatorError(
        "deduction_load_required",
        `Deduction "${reason}": ${loadNumber?.trim() ? `load ${loadNumber.trim()} is not a load of this company` : "needs its load number"}.`,
      );
    }
    const created = await createSettlementDeduction(client as never, {
      operatingCompanyId: draft.operating_company_id,
      driverId: draft.driver_id,
      amountCents,
      reason,
      sourceType,
      createdByUserId: actorUserId,
      loadId,
    });
    await client.query(
      `
        UPDATE driver_finance.driver_settlement_deductions
           SET applied_to_settlement_id = $1::uuid, status = 'pending', updated_at = now()
         WHERE id = $2::uuid
      `,
      [settlementId, created.id],
    );
    // ROUND 443.32 (CC-2 live finding on 5769, deduction 68041143) — the settlement LINE that applies the deduction, the
    // same row the canonical writer (settlement-deduction-cap.service.ts) writes: line_type 'deduction', source_table +
    // source_reference_id -> the deduction, on its load. Without it the close marked the deduction applied (remaining 0)
    // while v_settlement_deduction_balances, which derives "applied" from these lines, still read $10.00 open.
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines
          (settlement_id, operating_company_id, line_type, description, amount, load_id, source_table, source_reference_id,
           posting_account_id, approval_status, is_sample_data)
        VALUES ($1::uuid, $2::uuid, 'deduction', $3, $4, $5::uuid, $6, $7::uuid, $8::uuid, 'pending', false)
      `,
      [
        settlementId, draft.operating_company_id, reason.slice(0, 500), amountCents / 100, loadId,
        SETTLEMENT_DEDUCTION_SOURCE_TABLE, created.id,
        // Same account resolution as the materializer (settlement-lines-materialize.service.ts), never a guess.
        (await resolveDeductionPostingAccount(client as never, draft.operating_company_id, draft.driver_id, sourceType)).postingAccountId,
      ],
    );
  }

  for (const d of draft.deductions ?? []) {
    if (d.amount_cents <= 0) continue;
    const reason = d.description?.trim() || `Settlement ${draft.settlement_no} deduction`;
    // LEAD 443.110 G14 — each deduction posts by its own type (its item's account; the admin fee by name), never all "other".
    // A separate admin_fee_cents is refused at admission (ROUND 443.5); the admin fee arrives as a deduction line.
    const { deductionType } = await resolveCreatorDeductionType(client as never, draft.operating_company_id, d);
    await applyDeduction(d.amount_cents, reason, d.load_number, deductionType);
  }

  // Invoice mint + send (existing engines only). Delivered loads only — not_yet_delivered skips.
  // historical_backfill: closed settlement_lines.load_id OR stamped stop departure = evidence.
  // Faro auto-submit runs AFTER COMMIT (own connection) — see settlement-creator.routes.ts.
  // ROUND 443.4 b — the pay item comes from the driver's pay card; unresolved refuses (never a CDL default).
  const payItems = await resolveDriverPayItems(client, draft.operating_company_id, draft.driver_id);
  const invoiceIds: string[] = [];
  for (let i = 0; i < draft.loads.length; i++) {
    const load = draft.loads[i]!;
    if (!isDeliveredCreatorLoad(load)) continue;
    const loadId = loadIds[i];
    if (!loadId) {
      throw new SettlementCreatorError(
        "load_not_found",
        `Load ${load.load_number}: cannot mint invoice — load missing after seed.`,
      );
    }

    // ROUND 443.16 — tracked stop times (date only when no stop event matches); loads booked by this post were stamped
    // when the seeder delivered them, so a stop already stamped is left as it is.
    await stampStopsFromTracking(client, loadId, draft.operating_company_id, { pickupDate: load.pickup_date, deliveryDate: load.delivery_date });

    // ROUND 443.4 — driver pay = pay rate x short miles (loaded line) + empty rate x empty miles (empty line).
    // The customer's invoice amount and accessorials are never read here: they feed the invoice only.
    const payMiles = creatorPayMiles(load);
    const loadedCents = creatorLoadedPayCents(load);
    // Lead 443.36 — a salaried driver's load carries no per-load pay line (the salary is the settlement's own line).
    if (draft.salaried) {
      if (Number(load.line_haul_rate_cents ?? 0) > 0) {
        throw new SettlementCreatorError("salaried_load_has_pay_rate", `Load ${load.load_number}: a salaried settlement carries no per-load pay rate.`);
      }
    } else if (payMiles == null || loadedCents == null) {
      throw new SettlementCreatorError(
        "driver_pay_rate_missing",
        `Load ${load.load_number}: driver pay needs the short miles and the driver's pay rate per mile.`,
      );
    }
    if (!draft.salaried && payMiles != null && loadedCents != null) {
    // LEAD 443.167-R — an adopted seeded load carries the seed's proforma driver bill (priced from the seed's miles).
    // The signed settlement is the pay: an open, unsettled bill that differs is restated (void + one "-R" replacement).
    await restateOpenDriverBillToSignedPay(client, {
      companyId: draft.operating_company_id, loadId, loadNumber: load.load_number, actorUserId,
      milesBasis: payMiles, rateCents: Number(load.line_haul_rate_cents), loadedCents,
      emptyMiles: creatorEmptyRateCents(load) != null && Number(load.empty_miles ?? 0) > 0 ? Number(load.empty_miles) : null,
      emptyRateCents: creatorEmptyRateCents(load) != null && Number(load.empty_miles ?? 0) > 0 ? creatorEmptyRateCents(load) : null,
      emptyCents: creatorEmptyRateCents(load) != null && Number(load.empty_miles ?? 0) > 0 ? creatorEmptyPayCents(load) : 0,
      settlementNo: draft.settlement_no,
    });
    const loadedDesc = `Load ${load.load_number} — Loaded Miles ${payMiles.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} @ $${(Number(load.line_haul_rate_cents) / 100).toFixed(2)}`;
    await writeDriverPayLine(client, {
      settlementId, companyId: draft.operating_company_id, loadId, loadNumber: load.load_number, lineType: "earnings",
      description: loadedDesc, cents: loadedCents, quantity: payMiles, rateCents: Number(load.line_haul_rate_cents), itemId: payItems.loaded.id,
    });

    // Empty (deadhead) miles: empty rate when set, else the loaded rate (one deadhead rule, deadhead-rule.ts).
    const emptyRateCents = creatorEmptyRateCents(load);
    if (emptyRateCents != null && Number(load.empty_miles ?? 0) > 0) {
      const emptyCents = creatorEmptyPayCents(load);
      const emptyDesc = `Load ${load.load_number} — Empty Miles ${Number(load.empty_miles).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} @ $${(emptyRateCents / 100).toFixed(2)}`;
      await writeDriverPayLine(client, {
        settlementId, companyId: draft.operating_company_id, loadId, loadNumber: load.load_number, lineType: "deadhead_pay",
        description: emptyDesc, cents: emptyCents, quantity: Number(load.empty_miles), rateCents: emptyRateCents, itemId: payItems.empty.id,
      });
    }
    }

    // Invoices do not change driver pay; a dry run (rolled back) never mints or sends one.
    // The load is delivered per the signed settlement: move it there through dispatch's ONE transition engine (graph
    // check, departure stamp, driver-bill mint, revenue latch), never a status UPDATE. Real posts only: a dry run
    // rolls back, and dispatch queues its revenue latch after commit. Invoice send refuses an
    // invoice on a load that is still 'dispatched' (invoice_on_rolling_load_needs_authorization, since 09-30), so
    // without this no Creator invoice could be issued.
    // Option 1 — an adopted load (Edit of its own Creator settlement) is already delivered and invoiced: no transition.
    const loadStatus = (await client.query<{ status: string }>(
      `SELECT status::text FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [loadId, draft.operating_company_id],
    )).rows[0]?.status ?? "";
    // LEAD 443.167-R — the same holds for an adopted seeded load: a load already past delivery is never re-delivered.
    if (!["delivered", "delivered_pending_docs", "invoiced", "paid", "completed", "closed"].includes(loadStatus)) {
      await deliverLoadThroughDispatch(client, actorUserId, draft.operating_company_id, loadId, load.delivery_date);
    }
    // OWNER STANDING RULING 443.167-R2 — an adopted Transportation load settled in USMCA at $0 drops the revenue the seed
    // booked for it (rate, line haul, Event 1 earn) before its $0 invoice; no-op for a load booked at $0 by this post.
    if (isAuthorizedZeroRevenueLoad(load)) {
      await restateAdoptedLoadToZeroRevenue(client, { companyId: draft.operating_company_id, loadId, loadNumber: load.load_number, actorUserId, settlementNo: draft.settlement_no });
    }
    let built;
    try {
      built = await buildInvoiceFromLoad(client, {
        userId: actorUserId,
        operatingCompanyId: draft.operating_company_id,
        loadId,
        // ROUND 443.3 a — the typed digits; the invoice service (CC-1 443.8) builds <invoice>-<load>, blank -> <next>-<load>.
        requestedDisplayId: String(load.invoice_number ?? "").trim() || null,
        // ROUND 443.3 b — the owner-authorized $0 invoice: this load, and only this load (faro_transportation, no revenue).
        authorizedZeroRevenue: isAuthorizedZeroRevenueLoad(load),
      });
    } catch (err) {
      if (err instanceof DuplicateDocumentNumberError) {
        throw new SettlementCreatorError(
          "invoice_number_taken",
          `Load ${load.load_number}: invoice number ${String(load.invoice_number ?? "").trim() || "(assigned)"} is already used on this load. Nothing was written.`,
        );
      }
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      const msg = err instanceof Error ? err.message : String(err);
      if (code === "load_has_no_rate" || /load_has_no_rate/i.test(msg)) {
        throw new SettlementCreatorError(
          "invoice_load_has_no_rate",
          `Load ${load.load_number}: cannot mint invoice — rate is $0. Enter line haul on the load block.`,
        );
      }
      throw err;
    }
    const invoiceId = String((built.invoice as { id?: unknown }).id ?? "");
    if (!invoiceId) {
      throw new SettlementCreatorError(
        "invoice_mint_failed",
        `Load ${load.load_number}: buildInvoiceFromLoad returned no invoice id.`,
      );
    }
    invoiceIds.push(invoiceId);

    // Idempotent re-post may already be sent — only send drafts.
    const status = String((built.invoice as { status?: unknown }).status ?? "");
    if (status === "draft") {
      const sent = await sendDraftInvoice(client, {
        invoiceId,
        operatingCompanyId: draft.operating_company_id,
        userId: actorUserId,
        mode: "historical_backfill",
      });
      if (!sent.ok) {
        throw new SettlementCreatorError(
          "invoice_send_failed",
          `Load ${load.load_number}: sendDraftInvoice — ${sent.error}${
            "message" in sent && sent.message ? `: ${sent.message}` : ""
          }`,
        );
      }
    }
  }

  // ROUND 326 item 18 (owner: "the totals he verifies must come from the same code path the post writes — do not
  // create a second calculator"). The settlement just written is computed by the close engine — the one
  // settlement calculator and poster — on this same transaction. Its NET is the figure checked against the
  // AlwaysTrack TOTAL DUE; a difference refuses the post and names every term, never a silent second number.
  let closeTotals: SettlementCreatorCloseTotals | null = null;
  // Lead 443.36 — a SALARIED settlement with no pay at all (5816: $0, no pay lines, no deductions / escrow / advances)
  // has nothing for the pay run to post; it is closed as a $0 settlement (no journal entry, no A/P bill), never a refusal.
  const salariedZero = draft.salaried === true && Math.round(Number(draft.pdf_driver_net_cents)) === 0
    && !(draft.additional_pay ?? []).some((p) => p.amount_cents > 0) && !(draft.deductions ?? []).some((d) => d.amount_cents > 0)
    && !(draft.escrow ?? []).some((e) => e.amount_cents > 0) && !(draft.advances ?? []).some((a) => a.amount_cents > 0)
    && !(draft.expenses ?? []).some((e) => e.is_reimbursable && e.amount_cents > 0);
  if (postsThroughClose && salariedZero) {
    await recomputeSettlementHeader(client as never, settlementId, draft.operating_company_id);
    await client.query(
      `UPDATE driver_finance.driver_settlements
          SET status = 'closed', gross_pay = 0, deductions_total = 0, reimbursements_total = 0, net_pay = 0,
              pay_method = COALESCE(pay_method, 'no_net_pay'), posted_at = COALESCE(posted_at, now()),
              posted_by_user_id = COALESCE(posted_by_user_id, $3::uuid), updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [settlementId, draft.operating_company_id, actorUserId],
    );
  } else if (postsThroughClose) {
    await recomputeSettlementHeader(client as never, settlementId, draft.operating_company_id);
    // R12 — the Creator never pays: the net stays open on A/P until the owner matches a bank line in Banking.
    const closeInput = { operatingCompanyId: draft.operating_company_id, settlementId, onlyAdvanceIds: advanceIds, leaveNetOpen: true };
    const closeActor = { userId: actorUserId };
    let closePreview: SettlementPayRunResult;
    try {
      closePreview = await closeSettlementPayRun({ ...closeInput, previewOnly: true }, closeActor, { client: client as never });
    } catch (err) {
      if (err instanceof SettlementPayRunError) {
        throw new SettlementCreatorError(`close_${err.code.toLowerCase()}`, `The posting engine refuses this settlement: ${err.message}`);
      }
      throw err;
    }
    closeTotals = toCreatorCloseTotals(closePreview);
    const draftNet = Math.round(Number(draft.pdf_driver_net_cents));
    if (closeTotals.net_cents !== draftNet || closeTotals.net_cents !== preview.driver_net_cents) {
      throw new SettlementCreatorError(
        "totals_differ_from_posting_engine",
        `Posting engine NET ${dollarsFromCents(closeTotals.net_cents)} ≠ AlwaysTrack TOTAL DUE ${dollarsFromCents(draftNet)} ` +
          `(gross ${dollarsFromCents(closeTotals.gross_cents)} · additions ${dollarsFromCents(closeTotals.additions_cents)} · ` +
          `deductions ${dollarsFromCents(closeTotals.deductions_cents)} · escrow ${dollarsFromCents(closeTotals.escrow_cents)} · ` +
          `advances ${dollarsFromCents(closeTotals.advances_cents)} · chargebacks ${dollarsFromCents(closeTotals.chargebacks_cents)}). Nothing posted.`,
      );
    }
    let closed: SettlementPayRunResult;
    try {
      closed = await closeSettlementPayRun(closeInput, closeActor, { client: client as never });
    } catch (err) {
      if (err instanceof SettlementPayRunError) {
        throw new SettlementCreatorError(`close_${err.code.toLowerCase()}`, `The posting engine refused the post: ${err.message}`);
      }
      throw err;
    }
    if (closed.journal_entry_id) journalEntryIds.push(closed.journal_entry_id);
  }

  // Lead order 2026-10-11 — every expense of this post names its AlwaysTrack settlement (accounting.expenses.settlement_no).
  await stampCreatorExpenseSettlementNo(client as never, {
    operatingCompanyId: draft.operating_company_id, settlementId, settlementNo: sourceDocumentRef ?? displayId, expenseIds, actorUserId,
  });
  // 443.80 #1 — a trailer printed on the document that is not in the equipment master: kept as document text on every
  // expense of this post (trailer_id stays NULL; ownership is on no document, so no equipment row is created).
  if (!draft.trailer_id && draft.trailer_equipment_number?.trim() && expenseIds.length) {
    await client.query(
      `UPDATE accounting.expenses SET document_trailer_number = $3, updated_at = now()
        WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[]) AND trailer_id IS NULL AND document_trailer_number IS NULL`,
      [draft.operating_company_id, expenseIds, draft.trailer_equipment_number.trim()],
    );
    // LEAD 443.109 / 443.90 — that printed number is a customer / shipper trailer: the load recorded it at birth
    // (trailer_source 'customer'); every expense of this post on such a load points at the same non-owned trailer.
    await client.query(
      `UPDATE accounting.expenses e SET non_owned_trailer_id = l.non_owned_trailer_id, updated_at = now()
         FROM mdata.loads l
        WHERE e.operating_company_id = $1::uuid AND e.id = ANY($2::uuid[]) AND e.trailer_id IS NULL AND e.non_owned_trailer_id IS NULL
          AND l.id = e.load_id AND l.operating_company_id = e.operating_company_id
          AND l.trailer_source = 'customer' AND l.non_owned_trailer_id IS NOT NULL`,
      [draft.operating_company_id, expenseIds],
    );
  }

  // Lead 443.57 — the LOAD's saved operating miles per field (Document | Historical | Google | Manual), through CC-2's mileage
  // engine only. Last, after delivery + driver bills + A/P chain + close: pay (rate × the settlement's miles) is already written.
  let milesChoices;
  try {
    milesChoices = await applyCreatorMilesChoices(client as never, {
      operatingCompanyId: draft.operating_company_id,
      actorUserId,
      loads: draft.loads.map((l, i) => ({ loadId: loadIds[i]!, loadNumber: String(l.load_number), choice: l.miles_choice })),
    });
  } catch (err) {
    if (err instanceof CreatorMilesChoiceError) throw new SettlementCreatorError(`miles_choice_${err.code}`, err.message);
    throw err;
  }

  await appendCrudAudit(
    client as never,
    actorUserId,
    "driver_finance.settlement_creator.posted",
    {
      resource_type: "driver_finance.driver_settlements",
      resource_id: settlementId,
      operating_company_id: draft.operating_company_id,
      display_id: displayId,
      source_document_ref: sourceDocumentRef,
      load_ids: loadIds,
      expense_ids: expenseIds,
      owed_bill_ids: owedBillIds,
      fuel_transaction_ids: fuelTxnIds,
      advance_ids: advanceIds,
      overflow_loan_ids: overflowLoanIds,
      invoice_ids: invoiceIds,
      company_expenses_cents: preview.company_expenses_cents,
      driver_net_cents: preview.driver_net_cents,
      close_totals: closeTotals,
      miles_choices: milesChoices,
    },
    "info",
    AUDIT_TAG,
  );

  // FEED GATE (owner law 2026-10-01: "a settlement — all data input settlement by settlement before the next").
  // The creator (single and Batch Settlements grid) commits a settlement ONLY when every intake check is green:
  // loads (customer/driver/unit/trailer, trip type, geocoded + stamped stops, rate = invoice), invoice + A/R JE,
  // driver bills, deductions sourced, gross = Σ bills, net math, settlement JE, dates. Runs on this client inside
  // the creator's transaction; a red check throws FeedGateError('feed_gate_blocked') listing every red row and the
  // whole settlement (and its expenses/fuel/advances written above) rolls back. The one-settlement-at-a-time
  // trigger refuses a second open intake for the same driver.
  const gate = await assertSubjectMayCloseOnClient(client as never, draft.operating_company_id, "settlement", settlementId, actorUserId);

  return {
    settlement_id: settlementId,
    source_document_ref: sourceDocumentRef ?? displayId,
    display_id: displayId,
    load_ids: loadIds,
    expense_ids: expenseIds,
    owed_bill_ids: owedBillIds,
    fuel_transaction_ids: fuelTxnIds,
    advance_ids: advanceIds,
    overflow_loan_ids: overflowLoanIds,
    journal_entry_ids: journalEntryIds,
    invoice_ids: invoiceIds,
    preview,
    close_totals: closeTotals,
    miles_choices: milesChoices,
    feed_gate: { intake_id: gate.intake.id, status: gate.intake.status, checks_total: gate.intake.checks_total, checks_failed: gate.intake.checks_failed },
  };
}

/** The close engine's breakdown as the QuickBooks subtotal chain the creator shows (all positive magnitudes). */
function toCreatorCloseTotals(r: SettlementPayRunResult): SettlementCreatorCloseTotals {
  const b = r.breakdown;
  return {
    gross_cents: b.gross_cents,
    additions_cents: b.reimbursements_cents + b.detention_pay_cents,
    reimbursements_cents: b.reimbursements_cents,
    detention_pay_cents: b.detention_pay_cents,
    deductions_cents: b.deductions_cents,
    escrow_cents: b.escrow_contribution_cents,
    advances_cents: b.advance_recoveries_cents,
    chargebacks_cents: b.chargebacks_cents,
    net_cents: b.net_cents,
    je_preview: r.je_preview,
  };
}

/**
 * ROUND 326 item 18 — the creator's preview, with its totals computed by the POSTING engine. Writes the settlement
 * exactly as Post would (R14: the SAME post, rehearsal) inside a savepoint, asks the close engine for the breakdown, then
 * rolls the savepoint back: nothing persists, and the numbers the owner checks against AlwaysTrack are the numbers
 * Post writes. A refusal by either path comes back as a named blocker.
 */
export async function previewSettlementCreatorThroughClose(
  client: DbClient,
  actorUserId: string,
  draft: SettlementCreatorDraft,
  actorRole = "Owner",
): Promise<SettlementCreatorPreview> {
  const preview = await previewSettlementCreator(client, draft);
  // The dry run books and delivers loads; dispatch queues money side effects (revenue latch) for after COMMIT. They
  // are discarded with the savepoint so a preview never fires anything for loads it rolled back.
  const afterCommitMarkAt = afterCommitMark(client);
  await client.query("SAVEPOINT settlement_creator_dry_run");
  let closeTotals: SettlementCreatorCloseTotals | null = null;
  let milesChoices: SettlementCreatorPostResult["miles_choices"] | null = null;
  let refusal: string | null = null;
  let postedLines: SettlementCreatorJeLine[] | null = null;
  // R14 — the rehearsal runs the real post, invoice send included; its customer email is queued on this transaction
  // only when the transaction is scoped to the company (invoice-send.service.ts), so refuse to rehearse otherwise.
  const scope = (await client.query<{ c: string | null }>(`SELECT current_setting('app.operating_company_id', true) AS c`)).rows[0]?.c;
  if (scope !== draft.operating_company_id) {
    return { ...preview, blockers: [...preview.blockers, "Preview is not scoped to this company — the rehearsal did not run."], can_post: false };
  }
  try {
    // ROUND 443.7 a — the dry run books the draft's loads exactly as the post does (bookLoadOnClient, same checks),
    // inside this savepoint, which is rolled back: before this the preview looked up loads that did not exist yet,
    // so a new settlement could never show can_post. Nothing here survives; no after-book extra runs.
    await ensureDispatchedLoadsForCreator(client, { uuid: actorUserId, role: actorRole }, draft);
    const posted = await postSettlementCreatorInClientTx(client, actorUserId, draft, { rehearsal: true });
    closeTotals = posted.close_totals ?? null;
    milesChoices = posted.miles_choices ?? null;
    // R14 — report exactly what the post wrote: every journal line created in this transaction for the company,
    // by account, read back before the rollback (never a projection that can drift from the post).
    const written = await client.query<{ je: string; memo: string | null; account_number: string | null; account_name: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT je.id::text AS je, je.memo, a.account_number, a.account_name, p.debit_or_credit, p.amount_cents::text
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = p.account_id AND a.operating_company_id = p.operating_company_id
        WHERE je.operating_company_id = $1::uuid AND je.created_at = now()
        ORDER BY je.created_at, je.id, p.debit_or_credit DESC`,
      [draft.operating_company_id],
    );
    postedLines = written.rows.map((r) => ({
      load_number: null,
      account_number: r.account_number,
      account_name: r.account_name,
      debit_cents: r.debit_or_credit === "debit" ? Number(r.amount_cents) : 0,
      credit_cents: r.debit_or_credit === "credit" ? Number(r.amount_cents) : 0,
      memo: r.memo ?? "",
      section: "posted",
    }));
  } catch (err) {
    refusal = err instanceof Error ? err.message : String(err);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT settlement_creator_dry_run");
    await client.query("RELEASE SAVEPOINT settlement_creator_dry_run");
    afterCommitRollbackTo(client, afterCommitMarkAt);
  }
  const blockers = [...preview.blockers];
  if (refusal) blockers.push(`Posting engine: ${refusal}`);
  if (closeTotals) {
    const pdfNet = Math.round(Number(draft.pdf_driver_net_cents));
    if (closeTotals.net_cents !== pdfNet) {
      blockers.push(`Posting engine NET ${dollarsFromCents(closeTotals.net_cents)} ≠ AlwaysTrack TOTAL DUE ${dollarsFromCents(pdfNet)}.`);
    }
    if (closeTotals.net_cents !== preview.driver_net_cents) {
      blockers.push(`Posting engine NET ${dollarsFromCents(closeTotals.net_cents)} ≠ the creator's sections ${dollarsFromCents(preview.driver_net_cents)}.`);
    }
  }
  const lines = postedLines ?? preview.je_lines;
  const debit = lines.reduce((n, l) => n + l.debit_cents, 0);
  const credit = lines.reduce((n, l) => n + l.credit_cents, 0);
  if (postedLines && debit !== credit) blockers.push(`Posting engine wrote unbalanced lines (Dr ${debit} ≠ Cr ${credit}).`);
  return {
    ...preview,
    je_lines: lines,
    debit_total_cents: debit,
    credit_total_cents: credit,
    balanced: debit === credit,
    close_totals: closeTotals,
    miles_choices: milesChoices,
    blockers,
    can_post: preview.can_post && blockers.length === preview.blockers.length,
  };
}

/**
 * ROUND 363-CC2-D — a line's picked load: the id the user chose (must be this company's), else the typed load number.
 * Shared by the preview and the post.
 */
/**
 * LEAD 443.113 BCF-04 / BCF-05 — the load a Creator fuel fill or paid company expense belongs to, and the driver + unit
 * it carries. ONE rule, the same one the fuel-card import and the Relay fill post use:
 *   1. the load picked by id, or the load number the document prints on the line (it wins — it IS the document);
 *   2. else THE fuel-to-load rule (fuel/fuel-load-at-time.ts resolveFuelLoadAtTime): the load the settlement's truck
 *      (else its driver) was running at the fill time — actual stamps first, date-only stamps to the end of their day;
 *   3. else, when no stop of the truck is stamped yet, the explicit historical evidence of THIS document: the single
 *      settlement load whose pickup..delivery dates cover the date (attributeFuelLoadNumber — ambiguity is refused).
 * The load must be one of THIS settlement's loads (a fill / expense is never attached to another trip), and its driver
 * and unit are the LOAD's (the unit through the same-entity rule, accounting/load-unit.sql.ts) — never the draft's
 * independently. Anything else is refused by name, before anything is written.
 */
export async function creatorFillLoad(
  client: DbClient,
  draft: SettlementCreatorDraft,
  fill: { label: string; date: string; load_id?: string | null; load_number?: string | null; vendor_name?: string | null; invoice?: string | null },
): Promise<{ loadId: string; loadNumber: string; driverId: string; unitId: string }> {
  const opco = draft.operating_company_id;
  const settlementLoads = (await client.query<{ id: string; load_number: string }>(
    `SELECT id::text, load_number::text FROM mdata.loads
      WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[]) AND soft_deleted_at IS NULL`,
    [opco, (draft.loads ?? []).map((l) => l.load_number.trim())],
  )).rows;
  let loadId: string | null = null;
  const typed = fill.load_number?.trim() || null;
  if (fill.load_id || typed) {
    loadId = await resolveLineLoadId(client, opco, { load_id: fill.load_id, load_number: typed });
    if (!loadId) throw lineLoadNotFound(fill.label, typed);
  } else {
    const atTime = await resolveFuelLoadAtTime(client as never, {
      operatingCompanyId: opco,
      unitId: draft.unit_id ?? null,
      driverId: draft.driver_id ?? null,
      at: `${fill.date}T17:00:00.000Z`,
    });
    if (atTime) {
      loadId = atTime.load_id;
    } else {
      const n = attributeFuelLoadNumber(draft.loads ?? [], { date: fill.date, vendor_name: fill.vendor_name, invoice: fill.invoice });
      loadId = settlementLoads.find((l) => l.load_number === n)?.id ?? null;
      if (!loadId) throw lineLoadNotFound(fill.label, n);
    }
  }
  if (!settlementLoads.some((l) => l.id === loadId)) {
    throw new SettlementCreatorError(
      "line_load_not_on_settlement",
      `${fill.label}: the load it belongs to is not one of this settlement's loads (${settlementLoads.map((l) => l.load_number).join(", ") || "none"}) — type which of them it belongs to.`,
    );
  }
  const row = (await client.query<{ load_number: string; driver_id: string | null; unit_id: string | null }>(
    `SELECT l.load_number::text, l.assigned_primary_driver_id::text AS driver_id,
            ${sameEntityLoadUnitSql("l.id", "l.operating_company_id")}::text AS unit_id
       FROM mdata.loads l WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid`,
    [loadId, opco],
  )).rows[0];
  if (!row?.unit_id) {
    throw new SettlementCreatorError("line_load_has_no_unit", `${fill.label}: load ${row?.load_number ?? ""} has no truck of this company assigned — assign it on the load first.`);
  }
  if (draft.driver_id && row.driver_id && row.driver_id !== draft.driver_id) {
    throw new SettlementCreatorError("line_load_other_driver", `${fill.label}: load ${row.load_number} is driven by another driver — not this settlement's.`);
  }
  const driverId = row.driver_id ?? draft.driver_id;
  if (!driverId) throw new SettlementCreatorError("line_load_has_no_driver", `${fill.label}: load ${row.load_number} has no driver.`);
  return { loadId: loadId!, loadNumber: row.load_number, driverId, unitId: row.unit_id };
}

/** 443.110 G5 — the load id a Creator line is written with (creatorLineLoadNumber rules); refuses, never null. */
async function creatorLineLoadId(
  client: DbClient,
  draft: SettlementCreatorDraft,
  line: { label: string; load_id?: string | null; load_number?: string | null; date?: string | null },
): Promise<string> {
  const n = creatorLineLoadNumber(draft.loads ?? [], line);
  const id = await resolveLineLoadId(client, draft.operating_company_id, { load_id: line.load_id, load_number: n });
  if (!id) throw lineLoadNotFound(line.label, n);
  return id;
}

async function resolveLineLoadId(
  client: DbClient,
  operatingCompanyId: string,
  line: { load_id?: string | null; load_number?: string | null },
): Promise<string | null> {
  if (line.load_id) {
    const r = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.loads WHERE id = $2::uuid AND operating_company_id = $1::uuid AND soft_deleted_at IS NULL`,
      [operatingCompanyId, line.load_id],
    );
    if (!r.rows[0]) throw new SettlementCreatorError("line_load_not_found", `Load ${line.load_id} is not a load of this company.`);
    return r.rows[0].id;
  }
  if (!line.load_number?.trim()) return null;
  const found = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.loads
      WHERE operating_company_id = $1::uuid AND load_number = $2 AND soft_deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [operatingCompanyId, line.load_number.trim()],
  );
  return found.rows[0]?.id ?? null;
}

/**
 * ROUND 363-CC2-D — the account an expense / reimbursement line posts to: the item or account the user picked
 * (resolveLineItemAndAccount — the one resolver). Nothing picked, or a pick that does not resolve, is refused —
 * never silently replaced by a default account (ROUND 443.6 e).
 */
async function resolveExpenseLineAccount(
  client: DbClient,
  operatingCompanyId: string,
  line: { item_id?: string | null; account_id?: string | null; item_name: string },
): Promise<{ id: string; account_number: string | null; account_name: string | null; item_id: string | null } | null> {
  const picked = await resolveLineItemAndAccount(client as never, operatingCompanyId, line);
  if (picked && "refused" in picked) throw new SettlementCreatorError("line_account_refused", `"${line.item_name}": ${picked.refused}`);
  if (picked) return pickedAccount(picked);
  // ROUND 443.6 e — an unresolved item or account refuses; never a fallback "other operating expense" with no item.
  throw new SettlementCreatorError("expense_item_unresolved", `"${line.item_name}": pick the item (or account) this line posts to.`);
}

/** Preview: same resolver as the post; a refused pick is a blocker on the preview, not a thrown error. */
async function previewExpenseLineAccount(
  client: DbClient,
  operatingCompanyId: string,
  line: { item_id?: string | null; account_id?: string | null; item_name: string },
  blockers: string[],
): Promise<{ id: string; account_number: string | null; account_name: string | null } | null> {
  try {
    return await resolveExpenseLineAccount(client, operatingCompanyId, line);
  } catch (err) {
    if (err instanceof SettlementCreatorError) { blockers.push(err.message); return null; }
    throw err;
  }
}

function pickedAccount(p: ResolvedLineAccount) {
  return { id: p.account_id, account_number: p.account_number, account_name: p.account_name, item_id: p.item_id };
}

/**
 * U25 — reefer fuel is entered as a FUEL purchase (Fuel: Reefer diesel) with its gallons and the trailer, never as a
 * company expense with no gallons: the federal reefer-fuel credit (Form 4136) counts gallons.
 */
const REEFER_FUEL_AS_EXPENSE_MESSAGE =
  "is reefer fuel: enter it under Fuel purchases with Fuel = Reefer diesel, its gallons and the trailer (the reefer-fuel tax credit counts gallons)";
async function reeferFuelExpenseRefusal(client: DbClient, operatingCompanyId: string, exp: { item_id?: string | null; item_name: string }, resolvedItemId: string | null): Promise<string | null> {
  const itemId = resolvedItemId ?? exp.item_id ?? null;
  let name = exp.item_name ?? "";
  if (itemId) {
    const r = await client.query<{ item_name: string }>(`SELECT item_name FROM catalogs.items WHERE id = $1::uuid AND (operating_company_id = $2::uuid OR operating_company_id IS NULL)`, [itemId, operatingCompanyId]);
    name = r.rows[0]?.item_name ?? name;
  }
  return isReeferFuelItemName(name) ? `"${exp.item_name}" ${REEFER_FUEL_AS_EXPENSE_MESSAGE}` : null;
}

// The class lives in its own leaf module (breaks the helper -> service import cycle); re-exported for every importer.
export { SettlementCreatorError };
