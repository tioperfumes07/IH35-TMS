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
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";

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
  input: { operatingCompanyId: string; settlementId: string; kind: PayLineKind; amountCents: number; description?: string | null; transactionDate: string; loadId?: string | null; actorUserId: string }
) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new SettlementPayLineError("PAY_LINE_AMOUNT_INVALID", "The pay amount must be a positive amount.", 400);
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
  // ROUND 288.3 item 3: the line carries its GL account at birth — the driver-pay role, the same account the
  // categorizer and the close engine use for extra / detention pay (never a hardcoded number).
  const postingAccountId = await resolveRoleAccountOptional(client as never, input.operatingCompanyId, "driver_pay_expense");
  if (!postingAccountId) throw new SettlementPayLineError("DRIVER_PAY_ACCOUNT_UNMAPPED", "The driver pay expense account (role driver_pay_expense) is not mapped for this company.");
  const line = (await client.query<{ id: string }>(
    `INSERT INTO driver_finance.settlement_lines
       (settlement_id, operating_company_id, line_type, description, amount, load_id, category, source_type, posting_account_id, is_active, is_sample_data)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7, 'settlement_pay_line', $8::uuid, true, false)
     RETURNING id::text`,
    [input.settlementId, input.operatingCompanyId, lineType, description, (input.amountCents / 100).toFixed(2), target.loadId, input.kind, postingAccountId]
  )).rows[0];
  await recomputeSettlementHeader(client as never, input.settlementId, input.operatingCompanyId);
  await appendCrudAudit(client as never, input.actorUserId, "driver_finance.settlement.pay_line_added",
    { resource_type: "driver_finance.settlement_lines", resource_id: line.id, operating_company_id: input.operatingCompanyId, settlement_id: input.settlementId, load_id: target.loadId, load_number: target.loadNumber, kind: input.kind, line_type: lineType, amount_cents: input.amountCents, transaction_date: input.transactionDate, load_named: Boolean(input.loadId) },
    "info", "ROUND-326-PAY-LINE");
  return { settlement_line_id: line.id, line_type: lineType, load_id: target.loadId, load_number: target.loadNumber, amount_cents: input.amountCents, posting_account_id: postingAccountId };
}
