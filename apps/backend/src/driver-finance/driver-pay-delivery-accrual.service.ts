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
 * row for two drivers) posts one A/P bill per driver for that driver's share of the load's team split (LEAD 443.128 C):
 * accrued_bill_id = driver_id's, accrued_team_bill_id = team_driver_id's; each driver's settlement applies to its own.
 */
import type pg from "pg";
import { createBillInClientTx, postBillDocumentInClientTx } from "../accounting/bills.service.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { resolveDriverVendorLink } from "../accounting/driver-vendor-link.service.js";
import { stampNewDriverBillTrailerFromLoad } from "../accounting/bill-trailer-stamp.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { resolvePayComponentItem } from "./pay-component-items.js";
import { resolveTeamSplitForLoad } from "../settlements/team-splits/apply.js";
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
  skipped: Array<{ driver_bill_id: string; reason: string }>;
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

/** Pure: a team bill's two shares — the driver's at its ratio (rounded to the cent), the co-driver's the remainder (no cent lost). */
export function teamShareCents(grossCents: number, driverRatio: number): { driverCents: number; teamDriverCents: number } {
  const ratio = Math.min(1, Math.max(0, Number.isFinite(driverRatio) ? driverRatio : 0));
  const driverCents = Math.round(grossCents * ratio);
  return { driverCents, teamDriverCents: grossCents - driverCents };
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
          AND db.settled_in_settlement_id IS NULL AND db.accrued_bill_id IS NULL AND db.accrued_team_bill_id IS NULL
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
    if (!b.driver_id) throw new DriverPayAccrualError("DRIVER_BILL_HAS_NO_DRIVER", `Driver bill for load ${b.load_number} names no driver`, { driver_bill_id: b.id });
    // LEAD 443.128 C — a team bill (one row for two drivers) is incurred at delivery too: one A/P bill per driver for that
    // driver's share of the load's team split (resolveTeamSplitForLoad — the split the settlement close itself uses).
    let shares: Array<{ driverId: string; cents: number; lines: ReturnType<typeof driverPayAccrualLines>; column: "accrued_bill_id" | "accrued_team_bill_id" }>;
    if (b.team_driver_id) {
      const split = await resolveTeamSplitForLoad(client as never, { operatingCompanyId: opco, loadId: input.loadId, assignedDriverId: b.driver_id });
      if (!split || ![split.primary_driver_id, split.secondary_driver_id].includes(b.team_driver_id)) {
        throw new DriverPayAccrualError("TEAM_SPLIT_UNRESOLVED", `Team driver bill for load ${b.load_number} has no team split naming both its drivers — its pay cannot be divided`, { driver_bill_id: b.id });
      }
      const driverRatio = split.primary_driver_id === b.driver_id ? split.primary_ratio : split.secondary_ratio;
      const parts = teamShareCents(b.gross, driverRatio);
      shares = [
        { driverId: b.driver_id, cents: parts.driverCents, lines: [{ component: null, cents: parts.driverCents }], column: "accrued_bill_id" },
        { driverId: b.team_driver_id, cents: parts.teamDriverCents, lines: [{ component: null, cents: parts.teamDriverCents }], column: "accrued_team_bill_id" },
      ].filter((x) => x.cents > 0) as typeof shares;
    } else {
      shares = [{ driverId: b.driver_id, cents: b.gross, lines: driverPayAccrualLines(b), column: "accrued_bill_id" }];
    }
    const posted: Array<{ column: "accrued_bill_id" | "accrued_team_bill_id"; billId: string; jeId: string; cents: number; driverId: string }> = [];
    for (const share of shares) {
      const vendorId = (await resolveDriverVendorLink(client as never, opco, share.driverId)).vendorId;
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
      for (const l of share.lines) {
        const itemId = l.component ? await resolvePayComponentItem(client as never, opco, l.component) : null;
        lines.push({
          accountId: payAccount, amountCents: l.cents, loadId: input.loadId,
          description: `Load ${b.load_number} — driver pay${l.component === "empty" ? " (empty miles)" : l.component === "loaded" ? " (loaded miles)" : ""}${b.team_driver_id ? " (team share)" : ""}, delivered ${deliveryDate}`,
          ...(itemId ? { itemId, quantity: 1, rateCents: l.cents, unitOfMeasure: "each" } : {}),
        });
      }
      const bill = await createBillInClientTx(client, {
        operatingCompanyId: opco,
        vendorId,
        driverId: share.driverId,
        // 443.106 (trg_refuse_driver_bill_without_links): vendor, driver, load and unit ride the INSERT row.
        loadId: input.loadId,
        unitId: b.unit_id,
        billNumber: b.load_number,
        autoDisplayId: spent.rows.length > 0,
        billDate: deliveryDate,
        dueDate: deliveryDate,
        amountCents: share.cents,
        memo: `Driver pay, load ${b.load_number}${b.team_driver_id ? " (team share)" : ""} — incurred at delivery ${deliveryDate}`,
        coaAccountId: payAccount,
        lines,
      } as never, input.actorUserId);
      const billId = String((bill as { id: string }).id);
      await stampNewDriverBillTrailerFromLoad(client, { operatingCompanyId: opco, billId, loadId: input.loadId });
      const p = await postBillDocumentInClientTx(
        client as never,
        { operating_company_id: opco, bill_id: billId, posting_purpose: "initial_post" } as never,
        { userId: input.actorUserId } as never
      );
      const jeId = (p as { journal_entry_id?: string | null })?.journal_entry_id ?? null;
      if (!jeId) throw new DriverPayAccrualError("BILL_JOURNAL_ENTRY_MISSING", `Load ${b.load_number}'s driver pay bill posted no journal entry`, { bill_id: billId });
      posted.push({ column: share.column, billId, jeId, cents: share.cents, driverId: share.driverId });
    }
    const primary = posted.find((x) => x.column === "accrued_bill_id")?.billId ?? null;
    const team = posted.find((x) => x.column === "accrued_team_bill_id")?.billId ?? null;
    const stamped = await client.query(
      `UPDATE driver_finance.driver_bills SET accrued_bill_id = $3::uuid, accrued_team_bill_id = $5::uuid, due_date = $4::date, due_date_basis = 'delivered'
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND accrued_bill_id IS NULL AND accrued_team_bill_id IS NULL AND settled_in_settlement_id IS NULL`,
      [b.id, opco, primary, deliveryDate, team]
    );
    if (stamped.rowCount !== 1) throw new DriverPayAccrualError("ACCRUAL_RACED", `Driver bill for load ${b.load_number} changed while its pay was accrued`, { driver_bill_id: b.id });
    for (const x of posted) {
      await appendCrudAudit(client as never, input.actorUserId, "driver_finance.driver_bill.pay_accrued_at_delivery", {
        operating_company_id: opco,
        driver_bill_id: b.id,
        load_id: input.loadId,
        load_number: b.load_number,
        driver_id: x.driverId,
        team_share: Boolean(b.team_driver_id),
        accounting_bill_id: x.billId,
        journal_entry_id: x.jeId,
        amount_cents: x.cents,
        delivery_date: deliveryDate,
      });
      out.accrued.push({ driver_bill_id: b.id, accounting_bill_id: x.billId, journal_entry_id: x.jeId, amount_cents: x.cents });
    }
  }
  return out;
}
