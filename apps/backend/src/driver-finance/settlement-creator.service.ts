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
import { createExpenseFromFuelTransaction, resolveFuelLineAccount } from "../fuel/fuel-expense-document.service.js";
import { enteredFuelRowHash, FuelProviderTransactionDuplicateError, refuseDuplicateProviderTransaction } from "../fuel/fuel-provider-reference.js";
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
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { resolveRoleAccountOptional, type CoaRole } from "../accounting/coa-roles/resolver.service.js";
import { resolveDriverReimbursementParentAccount } from "../accounting/driver-subaccount-provision.service.js";
import { resolveCompanyDirectCreditAccount } from "../accounting/fuel-posting/poster.service.js";
import { nextExpenseDisplayId } from "../accounting/display-id.js";
import { creatorEmptyPayCents, creatorEmptyRateCents, creatorLoadedPayCents, creatorPayMiles } from "./settlement-creator-empty-pay.js";
import { resolveDriverPayItems } from "./settlement-creator-pay-item.js";
import { EscrowResolverError, resolveDriverEscrowLiabilityAccount } from "./escrow-resolver.service.js";
import { createSettlementDeduction } from "./deductions.service.js";
import { buildInvoiceFromLoad } from "../accounting/from-load.js";
import { DuplicateDocumentNumberError } from "../lib/qbo-custom-document-number.js";
import { assertCreatorDraftAdmissible } from "./settlement-creator-admission.js";
import { isAuthorizedZeroRevenueLoad } from "./settlement-creator-zero-revenue.js";
import { sendDraftInvoice } from "../accounting/invoice-send.service.js";
import { voidDocument } from "../accounting/void-document.service.js";
import {
  reverseSettlementForVoid,
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
        JOIN catalogs.accounts a ON a.id = i.default_expense_account_id
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
async function stampDeliveryStopActuals(
  client: DbClient,
  loadId: string,
  deliveryDate: string | null | undefined,
): Promise<void> {
  const at = deliveryDate ? `${deliveryDate}T18:00:00.000Z` : new Date().toISOString();
  await client.query(
    `
      UPDATE mdata.load_stops
         SET actual_arrival_at = COALESCE(actual_arrival_at, $2::timestamptz),
             actual_departure_at = COALESCE(actual_departure_at, $2::timestamptz),
             updated_at = now()
       WHERE load_id = $1::uuid
         AND stop_type = 'delivery'
         AND soft_deleted_at IS NULL
    `,
    [loadId, at],
  );
}

type PriorCreatorPostPayload = {
  expense_ids?: string[];
  fuel_transaction_ids?: string[];
  advance_ids?: string[];
  invoice_ids?: string[];
};

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
): Promise<void> {
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
  if (postedRun.rows[0]) {
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

  // The one void writer (stampDocumentVoided): voided_at/void_reason/voided_by_user_id + archived_at liveness, idempotent
  // on an already-voided row — never a hand-rolled UPDATE (verify-void-stamp-columns, zero-tolerance on fuel).
  for (const fuelId of prior.fuel_transaction_ids ?? []) {
    await stampDocumentVoided(client as never, {
      operatingCompanyId: opco,
      family: "fuel_transaction",
      documentId: fuelId,
      voidReason: reason,
      voidedByUserId: actorUserId,
    });
  }

  for (const invoiceId of prior.invoice_ids ?? []) {
    try {
      await voidDocument(client as never, {
        operatingCompanyId: opco,
        type: "invoice",
        id: invoiceId,
        reason,
        actor: { userId: actorUserId },
        currentBusinessDate: businessDate,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already.?void|not found|VOID/i.test(msg)) throw err;
    }
    // Factoring purchase linked to this invoice (submit-only; voidDocument reverses if funded).
    const fa = await client.query<{ id: string }>(
      `
        SELECT fa.id::text
          FROM accounting.invoices i
          JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
         WHERE i.operating_company_id = $1::uuid
           AND i.id = $2::uuid
           AND fa.voided_at IS NULL
         LIMIT 1
      `,
      [opco, invoiceId],
    );
    for (const row of fa.rows) {
      try {
        await voidDocument(client as never, {
          operatingCompanyId: opco,
          type: "factoring_advance",
          id: row.id,
          reason,
          actor: { userId: actorUserId },
          currentBusinessDate: businessDate,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already.?void|not found|NOT YET WIRED/i.test(msg)) throw err;
      }
    }
  }

  for (const advanceId of prior.advance_ids ?? []) {
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
      prior_invoice_ids: prior.invoice_ids ?? [],
      prior_advance_ids: prior.advance_ids ?? [],
      prior_fuel_transaction_ids: prior.fuel_transaction_ids ?? [],
    },
    "warning",
    AUDIT_TAG,
  );
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
      const card = exp.card ?? "relay";
      const rail = await accountByRole(client, draft.operating_company_id, cardRailRole(card));
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
        memo: `Comp. Exp. Cr card (never A/P)`,
        section: "expense",
      });
      if (!rail) blockers.push(`Expense card rail role '${cardRailRole(card)}' is not bound — bind it on the CoA Roles page.`);
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
      account_number: income7200?.account_number ?? null,
      account_name: income7200?.account_name ?? "Driver Admin Fee & Chargeback Income",
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
export async function postSettlementCreatorInClientTx(
  client: DbClient,
  actorUserId: string,
  draft: SettlementCreatorDraft,
  opts: { dryRun?: boolean } = {},
): Promise<SettlementCreatorPostResult> {
  const preview = await previewSettlementCreator(client, draft);
  // A dry run (previewSettlementCreatorThroughClose) writes the settlement inside a savepoint the caller rolls
  // back, so the posting engine can compute the totals the owner checks — it never refuses on the preview.
  if (!preview.can_post && !opts.dryRun) {
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
      await voidPriorCreatorSettlementForEdit(
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
        await voidPriorCreatorSettlementForEdit(
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
    sourceDocumentRef = atRef;
  }

  const loadIds: string[] = [];
  const expenseIds: string[] = [];
  const fuelTxnIds: string[] = [];
  const advanceIds: string[] = [];
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
  for (const fuel of draft.fuel_purchases ?? []) {
    const { netCents, feeCents } = fuelPurchaseNetAndFeeCents(fuel);
    if (netCents + feeCents <= 0) continue;

    const loadId = await resolveLineLoadId(client, draft.operating_company_id, fuel);

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
    try {
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
    // U25 — a reefer fill records the trailer it fueled when this company owns or leases it (ROUND 373.5: a record never
    // references another company's equipment) and only a Reefer trailer (reefer fuel never goes to a dry van).
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO fuel.fuel_transactions (
          operating_company_id, vendor_id, load_id, driver_id, unit_id,
          fuel_type, gallons, price_per_gallon, total_cost, fee_amount,
          purchased_at, transaction_at, transaction_reference, location_city,
          source, load_required, load_exemption_reason, created_by_user_id, source_row_hash, trailer_id,
          source_doc_id
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
          $6, $7, $8, $9, $10,
          $11::timestamptz, $11::timestamptz, $12, $13,
          'manual', $14, $15, $16::uuid, $17,
          (SELECT eq.id FROM mdata.equipment eq WHERE eq.id = $18::uuid AND eq.equipment_type ~* 'reefer'
              AND (eq.owner_company_id = $1::uuid OR eq.currently_leased_to_company_id = $1::uuid)),
          $19::uuid
        )
        RETURNING id::text
      `,
      [
        draft.operating_company_id,
        vendor.id,
        loadId,
        draft.driver_id,
        draft.unit_id ?? null,
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
        enteredFuelRowHash(draft.operating_company_id, vendor.id, fuel.invoice),
        fuelType === "reefer_diesel" ? draft.trailer_id ?? null : null,
        // SETL-F444 — the receipt image, uploaded and confirmed before Post; null when none.
        fuel.source_doc_id ?? null,
      ],
    );
    const fuelId = inserted.rows[0]!.id;
    fuelTxnIds.push(fuelId);

    const doc = await createExpenseFromFuelTransaction(client, {
      operating_company_id: draft.operating_company_id,
      fuel_transaction_id: fuelId,
      requesting_user_uuid: actorUserId,
      item_id: fuel.item_id ?? null,
      account_id: fuel.account_id ?? null,
    });
    if (doc.outcome === "refused") {
      throw new SettlementCreatorError("fuel_expense_refused", doc.reason);
    }
    // ACCT-F403: outcome "relay_link" — a Relay-rail fill posts from its wallet line, so this row gets no document and no
    // posting here; it LINKS to its Relay fill (one rule, fuel/relay-fill-link.service.ts) when exactly one proves it.
    if (doc.outcome === "relay_link") await linkSettlementFuelRowToRelayFill(client as never, draft.operating_company_id, fuelId);
    if (doc.outcome === "created" || doc.outcome === "already_exists") {
      expenseIds.push(doc.expense_id);
      // Stamp Comp. Exp. card rail already set by fuel writer; post through existing engine.
      try {
        const posted = await postSourceTransactionInClientTx(
          client as never,
          {
            operating_company_id: draft.operating_company_id,
            source_transaction_type: "expense",
            source_transaction_id: doc.expense_id,
          },
          { userId: actorUserId },
        );
        if (posted.journal_entry_id) journalEntryIds.push(posted.journal_entry_id);
      } catch (err) {
        // Flag-off / not eligible → document stays; do not invent GL math.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/EXPENSE_POST_GL_REFUSED|not posting-eligible|FLAG/i.test(msg)) throw err;
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
  for (const adv of draft.advances ?? []) {
    if (adv.amount_cents <= 0) continue;
    const advanceLoadId =
      adv.load_id ?? (await resolveLoadIdByNumber(adv.load_number)) ?? null;
    const created = await createDriverCashAdvanceCore(client as never, actorUserId, draft.operating_company_id, {
      driver_id: draft.driver_id,
      amount: dollarsFromCents(adv.amount_cents),
      purpose: "other",
      disbursement_method: "historical_backfill",
      recipient_info: {
        recipient_type: "driver",
        notes: adv.description ?? `Settlement ${draft.settlement_no} advance`,
      },
      linked_driver_bill_id: adv.linked_driver_bill_id ?? null,
      load_id: advanceLoadId,
      unit_id: draft.unit_id ?? null,
      liability_type: "advance",
    });
    if (!created.ok) {
      throw new SettlementCreatorError("advance_failed", created.message ?? created.error);
    }
    advanceIds.push(created.advanceId);
  }

  for (const exp of draft.expenses ?? []) {
    if (!exp.is_company_expense || exp.amount_cents <= 0) continue;
    const card = exp.card ?? "relay";
    const preference = card === "dreamline" ? "dreamline_card_payable" : "relay_fuel_wallet";
    const { account_id: paymentAccountId } = await resolveCompanyDirectCreditAccount(
      client as never,
      draft.operating_company_id,
      preference,
    );
    const itemAcct = await resolveExpenseLineAccount(client, draft.operating_company_id, exp);
    if (!itemAcct) {
      throw new SettlementCreatorError("expense_account_missing", `No expense account for Comp. Exp. "${exp.item_name}".`);
    }
    const reeferRefusal = await reeferFuelExpenseRefusal(client, draft.operating_company_id, exp, itemAcct.item_id);
    if (reeferRefusal) throw new SettlementCreatorError("reefer_fuel_needs_gallons", reeferRefusal);
    const loadId = await resolveLineLoadId(client, draft.operating_company_id, exp);
    const expenseNumber = await nextExpenseDisplayId(
      client as never,
      draft.operating_company_id,
      new Date(`${exp.date}T12:00:00.000Z`),
    );
    const memo = `[SC ${draft.settlement_no}] ${exp.description ?? exp.item_name}`.slice(0, 500);
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.expenses (
          operating_company_id, status, transaction_date, total_amount_cents,
          memo, expense_number, load_id, is_sample_data, payment_account_uuid,
          is_company_expense, driver_uuid
        )
        VALUES ($1::uuid, 'draft', $2::date, $3::bigint, $4, $5, $6::uuid, false, $7::uuid, true, $8::uuid)
        RETURNING id::text
      `,
      [
        draft.operating_company_id,
        exp.date,
        exp.amount_cents,
        memo,
        expenseNumber,
        loadId,
        paymentAccountId,
        draft.driver_id,
      ],
    );
    const expenseId = inserted.rows[0]!.id;
    await client.query(
      `
        INSERT INTO accounting.expense_lines (
          operating_company_id, expense_id, line_sequence, amount, amount_cents, description,
          load_id, load_required, expense_account_uuid, quantity, rate_cents, unit_of_measure, item_id
        )
        VALUES ($1::uuid, $2::uuid, 1, $3, $4::bigint, $5, $6::uuid, $7, $8::uuid, 1, $4::bigint, 'each', $9::uuid)
      `,
      [
        draft.operating_company_id,
        expenseId,
        exp.amount_cents / 100,
        exp.amount_cents,
        memo,
        loadId,
        Boolean(loadId),
        itemAcct.id,
        itemAcct.item_id,
      ],
    );
    expenseIds.push(expenseId);
    try {
      const posted = await postSourceTransactionInClientTx(
        client as never,
        {
          operating_company_id: draft.operating_company_id,
          source_transaction_type: "expense",
          source_transaction_id: expenseId,
        },
        { userId: actorUserId },
      );
      if (posted.journal_entry_id) journalEntryIds.push(posted.journal_entry_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/EXPENSE_POST_GL_REFUSED|not posting-eligible|FLAG/i.test(msg)) throw err;
    }
  }

  // Reimbursable expenses + explicit reimbursements → settlement_lines (driver net; no cash Cr).
  for (const r of draft.reimbursements ?? []) {
    if (r.amount_cents <= 0) continue;
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id, operating_company_id, line_type, description, amount, is_active, is_sample_data
        )
        VALUES ($1::uuid, $2::uuid, 'reimbursement', $3, $4, true, false)
      `,
      [
        settlementId,
        draft.operating_company_id,
        r.description || `Settlement ${draft.settlement_no} reimbursement`,
        dollarsFromCents(r.amount_cents),
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
    const lineLoadId = await resolveLineLoadId(client, draft.operating_company_id, exp);
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id, operating_company_id, line_type, description, amount, is_active, is_sample_data,
          load_id, posting_account_id
        )
        VALUES ($1::uuid, $2::uuid, 'reimbursement', $3, $4, true, false, $5::uuid, $6::uuid)
      `,
      [
        settlementId,
        draft.operating_company_id,
        exp.description ?? exp.item_name,
        dollarsFromCents(exp.amount_cents),
        lineLoadId,
        acct.id,
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
    const loadId = await resolveLoadIdByNumber(p.load_number);
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id, operating_company_id, line_type, description, amount, load_id, is_active, is_sample_data
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, true, false)
      `,
      [
        settlementId,
        draft.operating_company_id,
        lineType,
        p.description || `${p.pay_kind ?? "other"} pay`,
        dollarsFromCents(p.amount_cents),
        loadId,
      ],
    );
  }

  // Deductions + admin fee → createSettlementDeduction (other → 7200 on close) + apply to this settlement.
  async function applyDeduction(amountCents: number, reason: string, sourceType: "other" | "fine" | "toll" = "other") {
    if (amountCents <= 0) return;
    const created = await createSettlementDeduction(client as never, {
      operatingCompanyId: draft.operating_company_id,
      driverId: draft.driver_id,
      amountCents,
      reason,
      sourceType,
      createdByUserId: actorUserId,
    });
    await client.query(
      `
        UPDATE driver_finance.driver_settlement_deductions
           SET applied_to_settlement_id = $1::uuid, status = 'pending', updated_at = now()
         WHERE id = $2::uuid
      `,
      [settlementId, created.id],
    );
  }

  for (const d of draft.deductions ?? []) {
    if (d.amount_cents <= 0) continue;
    const reason = d.description?.trim() || `Settlement ${draft.settlement_no} deduction`;
    const isAdmin = /admin\s*fee/i.test(reason);
    await applyDeduction(d.amount_cents, reason, "other");
    if (isAdmin) {
      // Already routed via other → 7200; no second row.
    }
  }
  const adminFeePost = Math.max(0, Math.round(Number(draft.admin_fee_cents || 0)));
  if (adminFeePost > 0) {
    await applyDeduction(
      adminFeePost,
      `AlwaysTrack settl ${draft.settlement_no || sourceDocumentRef || displayId}: Admin fee`,
      "other",
    );
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

    await stampDeliveryStopActuals(client, loadId, load.delivery_date);

    // ROUND 443.4 — driver pay = pay rate x short miles (loaded line) + empty rate x empty miles (empty line).
    // The customer's invoice amount and accessorials are never read here: they feed the invoice only.
    const payMiles = creatorPayMiles(load);
    const loadedCents = creatorLoadedPayCents(load);
    if (payMiles == null || loadedCents == null) {
      throw new SettlementCreatorError(
        "driver_pay_rate_missing",
        `Load ${load.load_number}: driver pay needs the short miles and the driver's pay rate per mile.`,
      );
    }
    const loadedDesc = `Load ${load.load_number} — Loaded Miles ${payMiles.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} @ $${(Number(load.line_haul_rate_cents) / 100).toFixed(2)}`;
    await client.query(
      `
        INSERT INTO driver_finance.settlement_lines (
          settlement_id, operating_company_id, line_type, description, amount, load_id,
          quantity, rate_cents, unit_of_measure, item_id, is_active, is_sample_data
        )
        SELECT $1::uuid, $2::uuid, 'earnings', $3, $4, $5::uuid, $6, $7, 'mi', $8::uuid, true, false
        WHERE NOT EXISTS (
          SELECT 1 FROM driver_finance.settlement_lines sl
           WHERE sl.settlement_id = $1::uuid
             AND sl.load_id = $5::uuid
             AND sl.line_type = 'earnings'
             AND sl.voided_at IS NULL
        )
      `,
      [settlementId, draft.operating_company_id, loadedDesc, dollarsFromCents(loadedCents), loadId, payMiles, Number(load.line_haul_rate_cents), payItems.loaded.id],
    );

    // Empty (deadhead) miles: empty rate when set, else the loaded rate (one deadhead rule, deadhead-rule.ts).
    const emptyRateCents = creatorEmptyRateCents(load);
    if (emptyRateCents != null && Number(load.empty_miles ?? 0) > 0) {
      const emptyCents = creatorEmptyPayCents(load);
      const emptyDesc = `Load ${load.load_number} — Empty Miles ${Number(load.empty_miles).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} @ $${(emptyRateCents / 100).toFixed(2)}`;
      await client.query(
        `
          INSERT INTO driver_finance.settlement_lines (
            settlement_id, operating_company_id, line_type, description, amount, load_id,
            quantity, rate_cents, unit_of_measure, item_id, is_active, is_sample_data
          )
          SELECT $1::uuid, $2::uuid, 'deadhead_pay', $3, $4, $5::uuid, $6, $7, 'mi', $8::uuid, true, false
          WHERE NOT EXISTS (
            SELECT 1 FROM driver_finance.settlement_lines sl
             WHERE sl.settlement_id = $1::uuid
               AND sl.load_id = $5::uuid
               AND sl.line_type = 'deadhead_pay'
               AND sl.voided_at IS NULL
          )
        `,
        [settlementId, draft.operating_company_id, emptyDesc, dollarsFromCents(emptyCents), loadId, Number(load.empty_miles), emptyRateCents, payItems.empty.id],
      );
    }

    // Invoices do not change driver pay; a dry run (rolled back) never mints or sends one.
    if (opts.dryRun) continue;
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
  if (postsThroughClose) {
    await recomputeSettlementHeader(client as never, settlementId, draft.operating_company_id);
    const closeInput = { operatingCompanyId: draft.operating_company_id, settlementId, onlyAdvanceIds: advanceIds };
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
    if (opts.dryRun) {
      return dryRunResult(settlementId, displayId, sourceDocumentRef, preview, closeTotals);
    }
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
  } else if (opts.dryRun) {
    return dryRunResult(settlementId, displayId, sourceDocumentRef, preview, null);
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
      fuel_transaction_ids: fuelTxnIds,
      advance_ids: advanceIds,
      invoice_ids: invoiceIds,
      company_expenses_cents: preview.company_expenses_cents,
      driver_net_cents: preview.driver_net_cents,
      close_totals: closeTotals,
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
    fuel_transaction_ids: fuelTxnIds,
    advance_ids: advanceIds,
    journal_entry_ids: journalEntryIds,
    invoice_ids: invoiceIds,
    preview,
    close_totals: closeTotals,
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

function dryRunResult(
  settlementId: string,
  displayId: string,
  sourceDocumentRef: string | null,
  preview: SettlementCreatorPreview,
  closeTotals: SettlementCreatorCloseTotals | null,
): SettlementCreatorPostResult {
  return {
    settlement_id: settlementId,
    source_document_ref: sourceDocumentRef ?? displayId,
    display_id: displayId,
    load_ids: [],
    expense_ids: [],
    fuel_transaction_ids: [],
    advance_ids: [],
    journal_entry_ids: [],
    invoice_ids: [],
    preview,
    close_totals: closeTotals,
  };
}

/**
 * ROUND 326 item 18 — the creator's preview, with its totals computed by the POSTING engine. Writes the settlement
 * exactly as Post would (same function, dryRun) inside a savepoint, asks the close engine for the breakdown, then
 * rolls the savepoint back: nothing persists, and the numbers the owner checks against AlwaysTrack are the numbers
 * Post writes. A refusal by either path comes back as a named blocker.
 */
export async function previewSettlementCreatorThroughClose(
  client: DbClient,
  actorUserId: string,
  draft: SettlementCreatorDraft,
): Promise<SettlementCreatorPreview> {
  const preview = await previewSettlementCreator(client, draft);
  await client.query("SAVEPOINT settlement_creator_dry_run");
  let closeTotals: SettlementCreatorCloseTotals | null = null;
  let refusal: string | null = null;
  try {
    const dry = await postSettlementCreatorInClientTx(client, actorUserId, draft, { dryRun: true });
    closeTotals = dry.close_totals ?? null;
  } catch (err) {
    refusal = err instanceof Error ? err.message : String(err);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT settlement_creator_dry_run");
    await client.query("RELEASE SAVEPOINT settlement_creator_dry_run");
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
  return { ...preview, close_totals: closeTotals, blockers, can_post: preview.can_post && blockers.length === preview.blockers.length };
}

/**
 * ROUND 363-CC2-D — a line's picked load: the id the user chose (must be this company's), else the typed load number.
 * Shared by the preview and the post.
 */
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
 * (resolveLineItemAndAccount — the one resolver), else the documented default 6100 / other_operating_expense.
 * A pick that does not resolve is refused, never silently replaced by the default.
 */
async function resolveExpenseLineAccount(
  client: DbClient,
  operatingCompanyId: string,
  line: { item_id?: string | null; account_id?: string | null; item_name: string },
): Promise<{ id: string; account_number: string | null; account_name: string | null; item_id: string | null } | null> {
  const picked = await resolveLineItemAndAccount(client as never, operatingCompanyId, line);
  if (picked && "refused" in picked) throw new SettlementCreatorError("line_account_refused", `"${line.item_name}": ${picked.refused}`);
  if (picked) return pickedAccount(picked);
  const fallback =
    await accountByRole(client, operatingCompanyId, "other_operating_expense");
  return fallback ? { id: fallback.id, account_number: fallback.account_number ?? null, account_name: fallback.account_name ?? null, item_id: null } : null;
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

export class SettlementCreatorError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SettlementCreatorError";
    this.code = code;
  }
}
