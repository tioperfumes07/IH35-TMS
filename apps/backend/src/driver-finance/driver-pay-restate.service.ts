// C6-MONEY-JE-EXEMPT: the driver_finance.settlement_lines INSERTs in restateOpenSettlementPayLinesInClientTx re-mint the
// earnings / deadhead LINE items of an OPEN pre-settlement at the re-priced amount — not cash movements. The pay's GL moves
// only through the A/P bill this engine reverses (voidBillInClientTx) and re-accrues (the delivery accrual's balanced JE);
// the settlement header posts its own aggregate JE at close (same class as settlement-lines-materialize.service.ts).
/**
 * driver-pay-restate.service.ts — LEAD 443.269-B (owner order 10-23 7:52 AM CT): "if ... when closing the settlement the
 * mileage is adjusted, the bills are automatically adjusted fully and completely everywhere in the app and tables and
 * chart of accounts".
 *
 * Before this file, a miles change re-priced driver_finance.driver_bills (Edit Load: in-place re-price; Settlement
 * Creator: void + "-R" re-mint) but a bill whose pay was ALREADY ACCRUED AT DELIVERY (driver_bills.accrued_bill_id ->
 * accounting.bills, Dr driver pay / Cr A/P, driver-pay-delivery-accrual.service.ts) kept its A/P bill and journal entry
 * at the OLD amount: Edit Load never looked at the accrual, and the Creator refused ("accrued at delivery — restate it
 * first") with no restate path in existence. Cash Flow reads the A/P bill, so it stayed stale too.
 *
 * THE ONE accrual restate, called by every miles re-price path:
 *   releaseDriverPayAccrualInClientTx — void each accrued A/P bill through THE bill void engine (voidBillInClientTx:
 *     a reversal journal entry, never an edit in place), clear the accrual link, audit old amount + reversal ids;
 *   reaccrueDriverPayInClientTx — re-run THE delivery accrual (accrueDriverPayAtDeliveryInClientTx), which posts a new
 *     A/P bill + journal entry at the driver bill's CURRENT amount.
 * Refusals (no silent change): a bill already SETTLED, or an accrued A/P bill with a payment applied — those move on
 * the next settlement as an adjustment, never by rewriting paid history.
 */
import type pg from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { voidBillInClientTx, type BillMutationClient } from "../accounting/bills.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { liveSettlement, notVoided } from "../accounting/live-document-predicates.sql.js";

/** THE delivery accrual (accrueDriverPayAtDeliveryInClientTx), passed in by the caller: this engine stays a leaf so the
 *  booking / settlement-close callers never close an import cycle through it (verify-no-circular-dependencies). */
export type DeliveryAccrual = (
  client: pg.PoolClient,
  input: { operatingCompanyId: string; loadId: string; actorUserId: string; restateDriverBillId?: string },
) => Promise<{ accrued: Array<{ driver_bill_id: string }>; skipped?: unknown[]; reason?: string }>;

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export class DriverPayRestateRefused extends Error {
  constructor(readonly code: "driver_bill_settled" | "accrued_bill_paid" | "accrual_release_raced", message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "DriverPayRestateRefused";
  }
}

export type AccrualRelease = {
  driver_bill_id: string;
  released: Array<{ accounting_bill_id: string; amount_cents: number; reversal_journal_entry_id: string | null }>;
};

/** Void the driver bill's accrued A/P bill(s) by reversal and clear the link. A bill never accrued returns released: []. */
export async function releaseDriverPayAccrualInClientTx(
  client: Db,
  input: { operatingCompanyId: string; driverBillId: string; actorUserId: string; reason: string }
): Promise<AccrualRelease> {
  const opco = input.operatingCompanyId;
  const bill = (await client.query<{ id: string; load_number: string | null; gross: string; accrued: string | null; accrued_team: string | null; settled: string | null }>(
    `SELECT b.id::text, b.load_number, b.gross_amount_cents::text AS gross, b.accrued_bill_id::text AS accrued,
            b.accrued_team_bill_id::text AS accrued_team,
            (SELECT s.id::text FROM driver_finance.driver_settlements s
              WHERE s.id = b.settled_in_settlement_id AND s.operating_company_id = b.operating_company_id
                AND ${liveSettlement("s")}
                AND (s.status <> 'open' OR s.trip_closed_at IS NOT NULL OR s.posted_at IS NOT NULL)) AS settled
       FROM driver_finance.driver_bills b
      WHERE b.id = $1::uuid AND b.operating_company_id = $2::uuid
      FOR UPDATE OF b`,
    [input.driverBillId, opco]
  )).rows[0];
  if (!bill) throw new Error(`driver_bill_not_found:${input.driverBillId}`);
  const accrued = [bill.accrued, bill.accrued_team].filter((x): x is string => Boolean(x));
  if (!accrued.length) return { driver_bill_id: bill.id, released: [] };
  if (bill.settled) {
    throw new DriverPayRestateRefused("driver_bill_settled", `Load ${bill.load_number}: its driver bill is already settled — the change goes on the next settlement as an adjustment.`, { driver_bill_id: bill.id, settlement_id: bill.settled });
  }
  const released: AccrualRelease["released"] = [];
  for (const apBillId of accrued) {
    const ap = (await client.query<{ amount: string; paid: string }>(
      `SELECT amount_cents::text AS amount,
              COALESCE((SELECT sum(p.amount_cents) FROM accounting.bill_payments p
                         WHERE p.bill_id = ab.id AND p.operating_company_id = ab.operating_company_id AND p.revoked_at IS NULL), 0)::text AS paid
         FROM accounting.bills ab WHERE ab.id = $1::uuid AND ab.operating_company_id = $2::uuid FOR UPDATE OF ab`,
      [apBillId, opco]
    )).rows[0];
    if (!ap) continue;
    if (Number(ap.paid) > 0) {
      throw new DriverPayRestateRefused("accrued_bill_paid", `Load ${bill.load_number}: the driver pay bill already has a payment — the change goes on the next settlement as an adjustment.`, { accounting_bill_id: apBillId, paid_cents: Number(ap.paid) });
    }
    const voided = await voidBillInClientTx(client as unknown as BillMutationClient, {
      operatingCompanyId: opco, billId: apBillId, reason: input.reason, userId: input.actorUserId, currentBusinessDate: companyBusinessDate(),
    });
    released.push({ accounting_bill_id: apBillId, amount_cents: Number(ap.amount), reversal_journal_entry_id: (voided as { reversal_journal_entry_id?: string | null }).reversal_journal_entry_id ?? null });
  }
  const cleared = await client.query(
    `UPDATE driver_finance.driver_bills SET accrued_bill_id = NULL, accrued_team_bill_id = NULL, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [bill.id, opco]
  );
  if ((cleared.rowCount ?? 0) !== 1) throw new DriverPayRestateRefused("accrual_release_raced", "Driver bill changed while its accrual was released.");
  await appendCrudAudit(client as never, input.actorUserId, "driver_finance.driver_bill.accrual_released_for_restate", {
    operating_company_id: opco, driver_bill_id: bill.id, load_number: bill.load_number, old_gross_cents: Number(bill.gross), reason: input.reason, released,
  }, "info", "443.269-B");
  return { driver_bill_id: bill.id, released };
}

/** Post the load's driver pay A/P again at the CURRENT driver bill amount (THE delivery accrual). */
export async function reaccrueDriverPayInClientTx(
  client: Db,
  input: { operatingCompanyId: string; loadId: string; actorUserId: string; release: AccrualRelease; reason: string; driverBillId: string; accrue: DeliveryAccrual }
) {
  if (!input.release.released.length) return null;
  const out = await input.accrue(client as unknown as pg.PoolClient, {
    operatingCompanyId: input.operatingCompanyId, loadId: input.loadId, actorUserId: input.actorUserId, restateDriverBillId: input.driverBillId,
  });
  // The reversal already posted: a re-accrual that posts nothing would leave the pay off the books. Refuse (rolls back).
  if (!out.accrued.some((a) => a.driver_bill_id === input.driverBillId)) {
    throw new DriverPayRestateRefused("accrual_release_raced", `Load driver pay was reversed but could not be re-accrued (${out.reason ?? "no eligible bill"}) — nothing changed.`, { driver_bill_id: input.driverBillId, skipped: out.skipped });
  }
  await appendCrudAudit(client as never, input.actorUserId, "driver_finance.driver_bill.pay_restated", {
    operating_company_id: input.operatingCompanyId, load_id: input.loadId, reason: input.reason,
    old: input.release.released, new: out.accrued,
  }, "info", "443.269-B");
  return out;
}

/**
 * LEAD 443.269-B: the driver bill's pay lines on its OPEN, unposted pre-settlement follow the new price — void-not-delete
 * (is_active false, voided_at, void_reason) and ONE replacement line per component at the bill's current amounts, so the
 * header (aggregated from lines) moves too. A posted / closed settlement is never touched here.
 */
export async function restateOpenSettlementPayLinesInClientTx(
  client: Db,
  input: { operatingCompanyId: string; driverBillId: string; settlementId: string; actorUserId: string; reason: string }
): Promise<{ voided: number; minted: number }> {
  const open = (await client.query(
    `SELECT 1 FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid
        AND status = 'open' AND trip_closed_at IS NULL AND posted_at IS NULL AND ${notVoided()}`,
    [input.settlementId, input.operatingCompanyId]
  )).rows.length > 0;
  if (!open) return { voided: 0, minted: 0 };
  const bill = (await client.query<{ gross: number; loaded: number | null; deadhead: number | null }>(
    `SELECT gross_amount_cents::int AS gross, loaded_pay_cents::int AS loaded, deadhead_pay_cents::int AS deadhead
       FROM driver_finance.driver_bills WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.driverBillId, input.operatingCompanyId]
  )).rows[0];
  if (!bill) return { voided: 0, minted: 0 };
  const old = (await client.query<{ id: string; line_type: string; load_id: string | null; description: string | null; driver_visible: boolean | null; is_sample_data: boolean | null }>(
    `UPDATE driver_finance.settlement_lines
        SET is_active = false, voided_at = now(), void_reason = $4, voided_by_user_id = $5::uuid, updated_at = now()
      WHERE settlement_id = $1::uuid AND operating_company_id = $2::uuid AND source_driver_bill_id = $3::uuid AND is_active
        AND line_type IN ('earnings', 'deadhead_pay')
      RETURNING id::text, line_type, load_id::text, description, driver_visible, is_sample_data`,
    [input.settlementId, input.operatingCompanyId, input.driverBillId, input.reason, input.actorUserId]
  )).rows;
  if (!old.length) return { voided: 0, minted: 0 };
  const hasDeadheadLine = old.some((l) => l.line_type === "deadhead_pay");
  const parts = hasDeadheadLine
    ? [{ type: "earnings", cents: Number(bill.loaded ?? bill.gross - (bill.deadhead ?? 0)) }, { type: "deadhead_pay", cents: Number(bill.deadhead ?? 0) }]
    : [{ type: "earnings", cents: Number(bill.gross) }];
  const tmpl = old.find((l) => l.line_type === "earnings") ?? old[0]!;
  let minted = 0;
  for (const p of parts) {
    if (p.cents <= 0) continue;
    await client.query(
      `INSERT INTO driver_finance.settlement_lines (operating_company_id, settlement_id, line_type, description, amount, load_id, source_driver_bill_id, driver_visible, is_sample_data)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::numeric, $6::uuid, $7::uuid, $8, $9)`,
      [input.operatingCompanyId, input.settlementId, p.type, (old.find((l) => l.line_type === p.type) ?? tmpl).description, (p.cents / 100).toFixed(2), tmpl.load_id, input.driverBillId, tmpl.driver_visible ?? true, tmpl.is_sample_data ?? false]
    );
    minted += 1;
  }
  await appendCrudAudit(client as never, input.actorUserId, "driver_finance.settlement_lines.restated_for_reprice", {
    operating_company_id: input.operatingCompanyId, settlement_id: input.settlementId, driver_bill_id: input.driverBillId,
    voided_line_ids: old.map((l) => l.id), new_gross_cents: Number(bill.gross), reason: input.reason,
  }, "info", "443.269-B");
  return { voided: old.length, minted };
}
