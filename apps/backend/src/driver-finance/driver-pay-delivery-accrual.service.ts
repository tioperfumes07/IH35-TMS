/**
 * LEAD 443.116 (c), CORRECTION 16:50 UTC — driver pay is recognized ONCE, on the day it is incurred: the leg's delivery.
 * Locked design: claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md §3 ("Three dates, three columns" — "A cost is
 * recognized exactly once, on the day incurred"; due_date drives cash flow / A/P aging).
 *
 * At delivery (the same evidence the revenue earn uses: the final active delivery stop's actual departure,
 * driver_finance.load_driver_pay_due -> basis 'delivered') each open per-load driver bill becomes the load's A/P bill:
 *   Dr driver pay (role driver_pay_expense, e.g. 6890) per pay component item · Cr A/P (2000), vendor = the driver,
 *   bill_number = the load number, bill_date = due_date = the delivery date.
 * driver_bills.accrued_bill_id names it. Settlement close (settlement-ap-chain.service.ts) then APPLIES advances, deductions,
 * escrow and net pay to that same bill and never posts the pay again; pay above the accrual and reimbursements post at close
 * on a supplement. A settlement void reverses only what the close did — the delivery-accrued bill stays open on A/P.
 *
 * Idempotent: a bill already accrued, settled, voided or not yet delivered is skipped, never posted twice. A team bill (one
 * row for two drivers, split only at close) is skipped by name and keeps posting at close.
 */
import type pg from "pg";
import { createBillInClientTx } from "../accounting/bills.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { resolveDriverVendorLink } from "../accounting/driver-vendor-link.service.js";
import { stampNewDriverBillTrailerFromLoad } from "../accounting/bill-trailer-stamp.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { resolvePayComponentItem } from "./pay-component-items.js";
import { sameEntityLoadUnitSql } from "../accounting/load-unit.sql.js";

export class DriverPayAccrualError extends Error {
  constructor(public readonly code: string, message: string, public readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DriverPayAccrualError";
  }
}

export type DriverPayAccrualOutcome = {
  load_id: string;
  delivery_date: string | null;
  accrued: Array<{ driver_bill_id: string; accounting_bill_id: string; journal_entry_id: string; amount_cents: number }>;
  skipped: Array<{ driver_bill_id: string; reason: "team_bill_accrues_at_close" }>;
  reason?: "not_delivered";
};

/** The A/P bill lines of a driver bill: loaded + empty components when they tie to the gross, else one line. */
export function driverPayAccrualLines(bill: { gross: number; loaded: number | null; deadhead: number | null }): Array<{ component: "loaded" | "empty" | null; cents: number }> {
  const loaded = bill.loaded ?? 0;
  const deadhead = bill.deadhead ?? 0;
  if (bill.loaded != null && loaded + deadhead === bill.gross) {
    return [
      ...(loaded > 0 ? [{ component: "loaded" as const, cents: loaded }] : []),
      ...(deadhead > 0 ? [{ component: "empty" as const, cents: deadhead }] : []),
    ];
  }
  return [{ component: null, cents: bill.gross }];
}

export async function accrueDriverPayAtDeliveryInClientTx(
  client: pg.PoolClient,
  input: { operatingCompanyId: string; loadId: string; actorUserId: string }
): Promise<DriverPayAccrualOutcome> {
  const opco = input.operatingCompanyId;
  const due = (
    await client.query<{ due_date: string | null; basis: string | null }>(
      `SELECT d.due_date::text, d.basis FROM driver_finance.load_driver_pay_due($1::uuid) d`,
      [input.loadId]
    )
  ).rows[0];
  if (!due?.due_date || due.basis !== "delivered") {
    return { load_id: input.loadId, delivery_date: null, accrued: [], skipped: [], reason: "not_delivered" };
  }
  const deliveryDate = due.due_date;

  const bills = (
    await client.query<{ id: string; load_number: string; driver_id: string | null; team_driver_id: string | null; gross: number; loaded: number | null; deadhead: number | null; unit_id: string | null }>(
      `SELECT db.id::text, COALESCE(l.load_number, db.load_number) AS load_number, db.driver_id::text, db.team_driver_id::text,
              db.gross_amount_cents::int AS gross, db.loaded_pay_cents::int AS loaded, db.deadhead_pay_cents::int AS deadhead,
              COALESCE(db.unit_id, ${sameEntityLoadUnitSql("l.id", "l.operating_company_id")})::text AS unit_id
         FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
        WHERE db.operating_company_id = $1::uuid AND db.load_id = $2::uuid
          AND db.voided_at IS NULL AND db.status <> 'void'
          AND db.settled_in_settlement_id IS NULL AND db.accrued_bill_id IS NULL
          AND COALESCE(db.gross_amount_cents, 0) > 0
        ORDER BY db.created_at, db.id
        FOR UPDATE OF db`,
      [opco, input.loadId]
    )
  ).rows;
  const out: DriverPayAccrualOutcome = { load_id: input.loadId, delivery_date: deliveryDate, accrued: [], skipped: [] };
  if (!bills.length) return out;

  const payAccount = await resolveRoleAccountOptional(client as never, opco, "driver_pay_expense");
  if (!payAccount) throw new DriverPayAccrualError("DRIVER_PAY_ACCOUNT_MISSING", "No driver pay account (driver_pay_expense) designated");
  const apAccount = await resolveRoleAccountOptional(client as never, opco, "ap_control");
  if (!apAccount) throw new DriverPayAccrualError("AP_ACCOUNT_MISSING", "No A/P control account (ap_control) designated");

  for (const b of bills) {
    if (b.team_driver_id) {
      out.skipped.push({ driver_bill_id: b.id, reason: "team_bill_accrues_at_close" });
      continue;
    }
    if (!b.driver_id) throw new DriverPayAccrualError("DRIVER_BILL_HAS_NO_DRIVER", `Driver bill for load ${b.load_number} names no driver`, { driver_bill_id: b.id });
    const vendorId = (await resolveDriverVendorLink(client as never, opco, b.driver_id)).vendorId;
    const dup = await client.query(
      `SELECT 1 FROM accounting.bills WHERE operating_company_id = $1::uuid AND mdata_vendor_id = $2::uuid AND bill_number = $3 AND voided_at IS NULL LIMIT 1`,
      [opco, vendorId, b.load_number]
    );
    if (dup.rows.length) {
      throw new DriverPayAccrualError("LOAD_BILL_ALREADY_EXISTS", `An A/P bill numbered ${b.load_number} already exists for this driver — a load is billed once`, { load_number: b.load_number });
    }
    // Lead ROUND 330.6 ruling 1 — a spent document number is never reused: bill_number stays the load number, display fresh.
    const spent = await client.query(`SELECT 1 FROM accounting.bills WHERE operating_company_id = $1::uuid AND display_id = $2 LIMIT 1`, [opco, b.load_number]);
    const lines = [];
    for (const l of driverPayAccrualLines(b)) {
      const itemId = l.component ? await resolvePayComponentItem(client as never, opco, l.component) : null;
      lines.push({
        accountId: payAccount, amountCents: l.cents, loadId: input.loadId,
        description: `Load ${b.load_number} — driver pay${l.component === "empty" ? " (empty miles)" : l.component === "loaded" ? " (loaded miles)" : ""}, delivered ${deliveryDate}`,
        ...(itemId ? { itemId, quantity: 1, rateCents: l.cents, unitOfMeasure: "each" } : {}),
      });
    }
    const bill = await createBillInClientTx(client, {
      operatingCompanyId: opco,
      vendorId,
      driverId: b.driver_id,
      // 443.106 (trg_refuse_driver_bill_without_links): vendor, driver, load and unit ride the INSERT row.
      loadId: input.loadId,
      unitId: b.unit_id,
      billNumber: b.load_number,
      autoDisplayId: spent.rows.length > 0,
      billDate: deliveryDate,
      dueDate: deliveryDate,
      amountCents: b.gross,
      memo: `Driver pay, load ${b.load_number} — incurred at delivery ${deliveryDate}`,
      coaAccountId: payAccount,
      lines,
    } as never, input.actorUserId);
    const billId = String((bill as { id: string }).id);
    await stampNewDriverBillTrailerFromLoad(client, { operatingCompanyId: opco, billId, loadId: input.loadId });
    const p = await postSourceTransactionInClientTx(
      client as never,
      { operating_company_id: opco, source_transaction_type: "bill", source_transaction_id: billId, posting_purpose: "initial_post" } as never,
      { userId: input.actorUserId } as never
    );
    const jeId = (p as { journal_entry_id?: string | null })?.journal_entry_id ?? null;
    if (!jeId) throw new DriverPayAccrualError("BILL_JOURNAL_ENTRY_MISSING", `Load ${b.load_number}'s driver pay bill posted no journal entry`, { bill_id: billId });
    const stamped = await client.query(
      `UPDATE driver_finance.driver_bills SET accrued_bill_id = $3::uuid, due_date = $4::date, due_date_basis = 'delivered'
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND accrued_bill_id IS NULL AND settled_in_settlement_id IS NULL`,
      [b.id, opco, billId, deliveryDate]
    );
    if (stamped.rowCount !== 1) throw new DriverPayAccrualError("ACCRUAL_RACED", `Driver bill for load ${b.load_number} changed while its pay was accrued`, { driver_bill_id: b.id });
    await appendCrudAudit(client as never, input.actorUserId, "driver_finance.driver_bill.pay_accrued_at_delivery", {
      operating_company_id: opco,
      driver_bill_id: b.id,
      load_id: input.loadId,
      load_number: b.load_number,
      accounting_bill_id: billId,
      journal_entry_id: jeId,
      amount_cents: b.gross,
      delivery_date: deliveryDate,
    });
    out.accrued.push({ driver_bill_id: b.id, accounting_bill_id: billId, journal_entry_id: jeId, amount_cents: b.gross });
  }
  return out;
}
