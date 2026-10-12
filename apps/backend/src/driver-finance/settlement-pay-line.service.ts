/**
 * ROUND 326 (CC-1, CC-3 request) — ADD A PAY LINE TO A DRIVER'S OPEN SETTLEMENT. There was no way to add a single
 * detention, layover, bonus or other pay line to an open settlement (the driver page's "Add payment" could only open
 * the settlement creator). Owner rule 2026-10-02: reimbursement and extra pay ALWAYS belong to a load — the load the
 * user names, else the load of this settlement whose dates cover the transaction date (attributeToLoad).
 *
 * Writes ONE driver_finance.settlement_lines row (detention -> 'detention_pay', every other kind -> 'extra_pay',
 * category = the kind, load_id set) and re-totals the header through the canonical recomputeSettlementHeader.
 * Posting happens when the settlement is closed (the single settlement poster bills the line on its load's A/P bill).
 * Refuses by name: settlement not found / not open, no load on the settlement, a named load not on it, bad amount.
 */
// C6-MONEY-JE-EXEMPT: a settlement_lines row on an OPEN settlement is a pay-line draft, not a posted amount — the single
// settlement poster (settlement close: the per-load A/P bill via settlement-ap-chain) posts its balanced JE when the
// settlement closes; posting here would book the same pay twice.
import type pg from "pg";
import { attributeToLoad, loadSettlementLoadBills } from "./settlement-ap-chain.service.js";
import { recomputeSettlementHeader } from "./settlement-load-reassignment.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

export const PAY_LINE_KINDS = ["detention", "layover", "bonus", "stop_pay", "other"] as const;
export type PayLineKind = (typeof PAY_LINE_KINDS)[number];

export class SettlementPayLineError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message);
  }
}

/** Pure: the settlement_lines line_type a pay kind writes. */
export function payLineType(kind: PayLineKind): "detention_pay" | "extra_pay" {
  return kind === "detention" ? "detention_pay" : "extra_pay";
}

const OPEN_STATUSES = new Set(["open", "draft", "pending"]);

export async function addSettlementPayLineInClientTx(
  client: pg.PoolClient,
  input: { operatingCompanyId: string; settlementId: string; kind: PayLineKind; itemId: string; amountCents: number; description?: string | null; transactionDate: string; loadId?: string | null; actorUserId: string }
) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new SettlementPayLineError("PAY_LINE_AMOUNT_INVALID", "The pay amount must be a positive amount.", 400);
  if (!input.itemId) throw new SettlementPayLineError("PAY_LINE_ITEM_REQUIRED", "Choose the pay item for this line.", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transactionDate)) throw new SettlementPayLineError("PAY_LINE_DATE_REQUIRED", "Enter the date of the pay (it decides which load it belongs to).", 400);
  const st = (await client.query<{ id: string; driver_id: string; status: string; locked_at: string | null; display_id: string | null }>(
    `SELECT id::text, driver_id::text, status::text, locked_at::text, display_id FROM driver_finance.driver_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [input.settlementId, input.operatingCompanyId]
  )).rows[0];
  if (!st) throw new SettlementPayLineError("SETTLEMENT_NOT_FOUND", "Settlement not found.", 404);
  if (st.locked_at || !OPEN_STATUSES.has(st.status)) {
    throw new SettlementPayLineError("SETTLEMENT_NOT_OPEN", `Settlement ${st.display_id ?? st.id} is ${st.locked_at ? "locked" : st.status} — pay lines go on an open settlement.`);
  }
  const loads = await loadSettlementLoadBills(client, input.operatingCompanyId, input.settlementId, st.driver_id);
  if (!loads.length) throw new SettlementPayLineError("SETTLEMENT_HAS_NO_LOADS", "This settlement has no loads yet — pay always belongs to a load.");
  if (input.loadId && !loads.find((l) => l.loadId === input.loadId)) {
    throw new SettlementPayLineError("LOAD_NOT_ON_SETTLEMENT", "That load is not on this settlement.", 400);
  }
  const target = (input.loadId && loads.find((l) => l.loadId === input.loadId)) || attributeToLoad(loads, input.transactionDate)!;
  const lineType = payLineType(input.kind);
  const description = (input.description ?? "").trim() || `${input.kind.replace(/_/g, " ")} pay — load ${target.loadNumber}`;
  // BCF-09: the operator picks the pay item; its account is authoritative, never a generic role fallback.
  // The composite item FK requires this company's item (not a global/other-company item).
  const payItem = (await client.query<{ id: string; account_id: string }>(
    `SELECT i.id::text, a.id::text AS account_id
       FROM catalogs.items i
       JOIN catalogs.accounts a ON a.id = i.default_expense_account_id
         AND a.operating_company_id = i.operating_company_id
      WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid
        AND i.deactivated_at IS NULL AND a.deactivated_at IS NULL AND a.is_postable = true
      FOR SHARE OF i, a`,
    [input.itemId, input.operatingCompanyId]
  )).rows[0];
  if (!payItem) throw new SettlementPayLineError("PAY_LINE_ITEM_UNMAPPED", "The selected pay item must be active, belong to this company, and have an active postable expense account.");
  const postingAccountId = payItem.account_id;
  const line = (await client.query<{ id: string }>(
    `INSERT INTO driver_finance.settlement_lines
       (settlement_id, operating_company_id, line_type, description, amount, load_id, category, source_type, posting_account_id, item_id, quantity, rate_cents, unit_of_measure, is_active, is_sample_data)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7, 'manual_entry', $8::uuid, $9::uuid, 1, $10::bigint, 'each', true, false)
     RETURNING id::text`,
    [input.settlementId, input.operatingCompanyId, lineType, description, (input.amountCents / 100).toFixed(2), target.loadId, input.kind, postingAccountId, payItem.id, input.amountCents]
  )).rows[0];
  await recomputeSettlementHeader(client as never, input.settlementId, input.operatingCompanyId);
  await appendCrudAudit(client as never, input.actorUserId, "driver_finance.settlement.pay_line_added",
    { resource_type: "driver_finance.settlement_lines", resource_id: line.id, operating_company_id: input.operatingCompanyId, settlement_id: input.settlementId, load_id: target.loadId, load_number: target.loadNumber, kind: input.kind, line_type: lineType, item_id: payItem.id, posting_account_id: postingAccountId, amount_cents: input.amountCents, transaction_date: input.transactionDate, load_named: Boolean(input.loadId) },
    "info", "ROUND-326-PAY-LINE");
  return { settlement_line_id: line.id, line_type: lineType, load_id: target.loadId, load_number: target.loadNumber, amount_cents: input.amountCents, item_id: payItem.id, posting_account_id: postingAccountId };
}
