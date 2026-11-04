/**
 * driver-bill-reprice-to-settlement.service.ts — ACCT-F11102 (owner, load 13693: "the data you got from the settlement
 * directly is the correct data").
 *
 * The settlement is the document. When a per-load driver bill and the settlement earnings line minted from it
 * (settlement_lines.source_driver_bill_id) disagree, the bill is re-priced TO the settlement line — never the other way —
 * at the per-mile rate that reproduces the settlement amount on the bill's own miles (miles × rate, rounded to the cent,
 * must equal the line; a rate that does not reproduce it is refused, never back-solved). Precedent LEAD 443.253: "re-price to
 * the amount printed on 5816 (document-first)".
 *
 * Why a separate engine: the two existing re-price paths do not fit a bill whose settlement line is already right —
 *   Edit Load (book-load.service.ts) re-prices from the driver's ACTIVE pay rate (50¢ for 13693 → it would keep $979.45),
 *   the Creator restate (restateOpenDriverBillToSignedPay) refuses a bill settled in a live settlement and voids the
 *   settlement's lines (it would void the CORRECT line 541df926).
 * This engine changes only the driver bill (the same in-place UPDATE shape Edit Load uses: gross / rate / loaded pay), never
 * the settlement line, and never the driver's pay rate. Pay already accrued to A/P follows through THE restate engine
 * (releaseDriverPayAccrualInClientTx → reaccrueDriverPayInClientTx: reversal + re-accrual, no new GL math). An unaccrued bill
 * is picked up by the delivery-accrual sweep at the new amount (its skip reason settlement_pays_less_than_bill clears).
 * Refusals (fail-closed, nothing changes): voided / non-editable bill, team bill, a bill with deadhead pay, a line that is not
 * the bill's live earnings line on its settlement, a posted / GL-run settlement, a rate that does not reproduce the line.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isEditableDriverBillStatus } from "../lib/document-status-vocabulary.js";
import { liveSettlement } from "../accounting/live-document-predicates.sql.js";
import { releaseDriverPayAccrualInClientTx, reaccrueDriverPayInClientTx, type DeliveryAccrual } from "./driver-pay-restate.service.js";

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export class DriverBillRepriceRefused extends Error {
  constructor(readonly code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DriverBillRepriceRefused";
  }
}

/** Pure: the cents a per-mile rate pays on these miles (rounded to the cent, half up). */
export function perMilePayCents(miles: number, rateCents: number): number {
  return Math.round(Number(miles) * Number(rateCents) + 1e-9);
}

export type RepriceToSettlementResult = {
  driver_bill_id: string;
  load_number: string | null;
  old_gross_cents: number;
  new_gross_cents: number;
  old_rate_per_mile_cents: number | null;
  new_rate_per_mile_cents: number;
  miles_basis: number;
  settlement_line_id: string;
  accrual_released: number;
  reaccrued: number;
  unchanged?: true;
};

export async function repriceDriverBillToSettlementLineInClientTx(
  client: Db,
  input: {
    operatingCompanyId: string; driverBillId: string; settlementLineId: string; ratePerMileCents: number;
    actorUserId: string; reason: string; accrue: DeliveryAccrual;
  }
): Promise<RepriceToSettlementResult> {
  const opco = input.operatingCompanyId;
  if (!input.reason || input.reason.trim().length < 20) throw new DriverBillRepriceRefused("reason_required", "A real, specific reason (20+ characters) is required.");
  if (!Number.isInteger(input.ratePerMileCents) || input.ratePerMileCents <= 0) throw new DriverBillRepriceRefused("rate_invalid", "The per-mile rate must be a whole number of cents above 0.");
  const bill = (await client.query<{
    id: string; load_id: string; load_number: string | null; status: string; voided_at: string | null; team_driver_id: string | null;
    miles: string | null; rate: number | null; gross: string; deadhead: string | null; settlement_id: string | null; accrued: string | null; accrued_team: string | null;
  }>(
    `SELECT id::text, load_id::text, load_number, status::text, voided_at::text, team_driver_id::text, miles_basis::text AS miles,
            rate_per_mile_cents AS rate, gross_amount_cents::text AS gross, deadhead_pay_cents::text AS deadhead,
            settled_in_settlement_id::text AS settlement_id, accrued_bill_id::text AS accrued, accrued_team_bill_id::text AS accrued_team
       FROM driver_finance.driver_bills
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      FOR UPDATE`,
    [input.driverBillId, opco]
  )).rows[0];
  if (!bill) throw new DriverBillRepriceRefused("driver_bill_not_found", "Driver bill not found for this company.");
  if (bill.voided_at || !isEditableDriverBillStatus(bill.status)) throw new DriverBillRepriceRefused("driver_bill_not_editable", `Driver bill ${bill.load_number} is ${bill.status} — not re-priceable.`);
  if (bill.team_driver_id) throw new DriverBillRepriceRefused("team_bill", "A team bill is split at settlement close — not re-priced here.");
  if (Number(bill.deadhead ?? 0) !== 0) throw new DriverBillRepriceRefused("deadhead_pay_present", "A bill with empty-mile pay has two components — not re-priced from one settlement line here.");
  if (bill.miles == null || Number(bill.miles) <= 0) throw new DriverBillRepriceRefused("miles_missing", "The bill carries no pay miles.");

  const line = (await client.query<{ id: string; amount: string; settlement_id: string; posted: boolean }>(
    `SELECT sl.id::text, sl.amount::text, sl.settlement_id::text,
            (s.posted_at IS NOT NULL OR EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_runs g
                                                 WHERE g.settlement_id = s.id AND g.operating_company_id = s.operating_company_id)) AS posted
       FROM driver_finance.settlement_lines sl
       JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id AND s.operating_company_id = sl.operating_company_id
      WHERE sl.id = $1::uuid AND sl.operating_company_id = $2::uuid AND sl.source_driver_bill_id = $3::uuid
        AND sl.is_active AND sl.voided_at IS NULL AND sl.line_type = 'earnings' AND ${liveSettlement("s")}`,
    [input.settlementLineId, opco, bill.id]
  )).rows[0];
  if (!line) throw new DriverBillRepriceRefused("settlement_line_not_this_bill", "That line is not this bill's live earnings line on a live settlement.");
  if (bill.settlement_id && bill.settlement_id !== line.settlement_id) throw new DriverBillRepriceRefused("settlement_mismatch", "The line sits on a different settlement than the bill.");
  if (line.posted) throw new DriverBillRepriceRefused("settlement_posted", "The settlement has posted — the difference goes on the next settlement as an adjustment.");

  const target = Math.round(Number(line.amount) * 100);
  const miles = Number(bill.miles);
  const priced = perMilePayCents(miles, input.ratePerMileCents);
  if (priced !== target) {
    throw new DriverBillRepriceRefused("rate_does_not_reproduce_settlement", `${miles} mi × ${input.ratePerMileCents}¢ = ${priced} cents, not the settlement's ${target} cents.`, { miles, rate: input.ratePerMileCents, priced, target });
  }
  const oldGross = Number(bill.gross);
  const base: RepriceToSettlementResult = {
    driver_bill_id: bill.id, load_number: bill.load_number, old_gross_cents: oldGross, new_gross_cents: target,
    old_rate_per_mile_cents: bill.rate, new_rate_per_mile_cents: input.ratePerMileCents, miles_basis: miles,
    settlement_line_id: line.id, accrual_released: 0, reaccrued: 0,
  };
  if (oldGross === target && bill.rate === input.ratePerMileCents) return { ...base, unchanged: true };

  const reason = `ACCT-F11102: re-priced to settlement line ${line.id} ($${(target / 100).toFixed(2)} = ${miles} mi × ${input.ratePerMileCents}¢; was $${(oldGross / 100).toFixed(2)}) — ${input.reason.trim()}`;
  const release = bill.accrued || bill.accrued_team
    ? await releaseDriverPayAccrualInClientTx(client, { operatingCompanyId: opco, driverBillId: bill.id, actorUserId: input.actorUserId, reason })
    : { driver_bill_id: bill.id, released: [] };
  const upd = await client.query(
    `UPDATE driver_finance.driver_bills
        SET gross_amount_cents = $3, rate_per_mile_cents = $4, loaded_pay_cents = $3, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL`,
    [bill.id, opco, target, input.ratePerMileCents]
  );
  if ((upd.rowCount ?? 0) !== 1) throw new DriverBillRepriceRefused("driver_bill_raced", "Driver bill changed while it was re-priced.");
  const reaccrued = await reaccrueDriverPayInClientTx(client, {
    operatingCompanyId: opco, loadId: bill.load_id, actorUserId: input.actorUserId, release, reason, driverBillId: bill.id, accrue: input.accrue,
  });
  await appendCrudAudit(client as never, input.actorUserId, "driver_finance.driver_bill.repriced_to_settlement_line", {
    operating_company_id: opco, driver_bill_id: bill.id, load_id: bill.load_id, load_number: bill.load_number,
    settlement_id: line.settlement_id, settlement_line_id: line.id, miles_basis: miles,
    old_gross_cents: oldGross, new_gross_cents: target, old_rate_per_mile_cents: bill.rate, new_rate_per_mile_cents: input.ratePerMileCents,
    accrual_released: release.released, reason,
  }, "warning", "ACCT-F11102");
  return { ...base, accrual_released: release.released.length, reaccrued: reaccrued?.accrued.length ?? 0 };
}

