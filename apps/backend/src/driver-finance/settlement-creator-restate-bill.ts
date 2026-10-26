/**
 * Settlement Creator — restate an adopted load's driver bill to the signed settlement pay.
 * Leaf module, moved VERBATIM out of settlement-creator.service.ts to break the import cycle
 * settlement-creator.service -> settlement-creator-seed-loads -> settlement-creator.service (the seed-loads
 * adoption path restates pay before delivery). No SQL, amount, posting or transaction-boundary change.
 * settlement-creator.service.ts re-exports both functions, so every existing caller is unchanged.
 */
import { notVoided } from "../accounting/live-document-predicates.sql.js";
import { stampDriverBillVoidedInClientTx } from "./driver-bill-void-state.service.js";
import { creatorEmptyPayCents, creatorEmptyRateCents, creatorLoadedPayCents, creatorPayMiles } from "./settlement-creator-empty-pay.js";
import { creatorAdditionalOnlyPay } from "./settlement-creator-pay-mode.js";
import { SettlementCreatorError } from "./settlement-creator-error.js";
import type { SettlementCreatorDraft } from "./settlement-creator.types.js";
import { isEditableDriverBillStatus } from "../lib/document-status-vocabulary.js";

/** Same structural client shape the service uses (dispatch/presettlement-link DbClient); kept local so this leaf imports no cycle member. */
type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function dollarsFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * LEAD 443.167-R — the signed settlement restates an adopted load's open proforma driver bill. Only a live bill that is
 * status 'open', settled in no settlement, and priced differently from the signed pay is touched: it is voided
 * (void-not-delete) and ONE replacement bill "<load>-R" is minted at the signed miles x rate (same INSERT shape as
 * correctOpenDriverBillMileage / book-load). A bill already equal to the signed pay is left alone (a load booked by
 * this post).
 */
export async function restateCreatorDriverBillFromSignedLoad(
  client: DbClient, draft: SettlementCreatorDraft, load: SettlementCreatorDraft["loads"][number], loadId: string, actorUserId: string,
): Promise<void> {
  const additionalOnly = creatorAdditionalOnlyPay(draft, load);
  if (additionalOnly) {
    const { setAdditionalOnlyDriverPayForLoad } = await import("../dispatch/book-load.service.js");
    await setAdditionalOnlyDriverPayForLoad(client, { loadId, operatingCompanyId: draft.operating_company_id, actorUserId, plan: additionalOnly });
    const bills = (await client.query<{ gross: string }>(`SELECT gross_amount_cents::text AS gross FROM driver_finance.driver_bills
      WHERE operating_company_id = $1::uuid AND load_id = $2::uuid AND voided_at IS NULL AND status <> 'void'`, [draft.operating_company_id, loadId])).rows;
    if (bills.length !== 1 || Number(bills[0]?.gross) !== additionalOnly.amount_cents) throw new SettlementCreatorError("additional_only_bill_mismatch", `Load ${load.load_number}: additional-only bill must equal its itemized pay.`);
    return;
  }
  if (draft.salaried) {
    if (Number(load.line_haul_rate_cents ?? 0) > 0) throw new SettlementCreatorError("salaried_load_has_pay_rate", `Load ${load.load_number}: a salaried settlement carries no per-load pay rate.`);
    return;
  }
  const payMiles = creatorPayMiles(load);
  const loadedCents = creatorLoadedPayCents(load);
  if (payMiles == null || loadedCents == null) throw new SettlementCreatorError("driver_pay_rate_missing", `Load ${load.load_number}: driver pay needs the short miles and the driver's pay rate per mile.`);
  await restateOpenDriverBillToSignedPay(client, {
    companyId: draft.operating_company_id, loadId, loadNumber: load.load_number, actorUserId,
    milesBasis: payMiles, rateCents: Number(load.line_haul_rate_cents), loadedCents,
    emptyMiles: creatorEmptyRateCents(load) != null && Number(load.empty_miles ?? 0) > 0 ? Number(load.empty_miles) : null,
    emptyRateCents: creatorEmptyRateCents(load) != null && Number(load.empty_miles ?? 0) > 0 ? creatorEmptyRateCents(load) : null,
    emptyCents: creatorEmptyRateCents(load) != null && Number(load.empty_miles ?? 0) > 0 ? creatorEmptyPayCents(load) : 0,
    settlementNo: draft.settlement_no,
  });
}

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
  const signed = input.loadedCents + input.emptyCents;
  // LEAD 443.203 (17:05Z, settlement 5849 / load 13684): an adopted load can carry NO live driver bill (booked before its
  // short miles existed — the mint refused, 443.192). Returning here left the invoice gate red ("no live driver bill for
  // this load") and the signed settlement could never post. The signed settlement IS the pay: mint the ONE bill at the
  // signed miles x rate for the load's own driver (same INSERT shape as the restate below), audited by its notes.
  if (bill.length === 0) {
    const ld = (await client.query<{ driver: string | null; team: string | null }>(
      `SELECT assigned_primary_driver_id::text AS driver, assigned_secondary_driver_id::text AS team
         FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [input.loadId, input.companyId],
    )).rows[0];
    if (!ld?.driver) {
      throw new SettlementCreatorError("driver_bill_no_driver", `Load ${input.loadNumber}: no driver on the load — cannot mint its driver bill from the signed settlement.`);
    }
    const reason = `443.203: minted from signed settlement ${input.settlementNo} pay ${dollarsFromCents(signed)} (adopted load had no live driver bill)`;
    await client.query(
      `INSERT INTO driver_finance.driver_bills (
         operating_company_id, load_id, load_number, bill_number, driver_id, team_driver_id,
         gross_amount_cents, miles_basis, miles_basis_type, rate_per_mile_cents, status, notes,
         created_by_user_id, miles_deadhead, rate_empty_per_mile_cents, loaded_pay_cents, deadhead_pay_cents
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7, $8, 'short', $9, 'open', $10, $11::uuid, $12, $13, $14, $15)`,
      [input.companyId, input.loadId, input.loadNumber, input.loadNumber, ld.driver, ld.team, signed, input.milesBasis,
        input.rateCents, reason, input.actorUserId, input.emptyMiles, input.emptyRateCents, input.loadedCents, input.emptyCents],
    );
    const { restampDriverBillUnitAndTrailer } = await import("./driver-bill-unit-trailer.js");
    await restampDriverBillUnitAndTrailer(client as never, { operatingCompanyId: input.companyId, loadId: input.loadId });
    return;
  }
  if (bill.length !== 1) return;
  const b = bill[0]!;
  if (Number(b.gross) === signed) return;
  const state = (await client.query<{ status: string; settled: string | null; accrued: string | null }>(
    // A bill "settled" in a voided / cancelled settlement (a seed shell regrouped away) is settled in nothing.
    `SELECT b.status::text,
            (SELECT s.id::text FROM driver_finance.driver_settlements s
              WHERE s.id = b.settled_in_settlement_id AND s.operating_company_id = b.operating_company_id
                AND s.voided_at IS NULL AND s.status <> 'cancelled') AS settled,
            b.accrued_bill_id::text AS accrued
       FROM driver_finance.driver_bills b WHERE b.id = $1::uuid`,
    [b.id],
  )).rows[0]!;
  // LEAD 443.269-B: an ACCRUED bill is restatable through THE restate engine (reverse its A/P bill, re-accrue the -R
  // bill below) — before, it was refused ("restate it first") with no restate path in existence.
  if (!isEditableDriverBillStatus(state.status) || state.settled) {
    throw new SettlementCreatorError(
      "driver_bill_not_restatable",
      `Load ${input.loadNumber}: its driver bill (${dollarsFromCents(Number(b.gross))}) differs from the signed pay ${dollarsFromCents(signed)} and is ${state.settled ? "already settled — the difference goes on the next settlement as an adjustment" : state.status}.`,
    );
  }
  const reason = `443.167-R: restated to signed settlement ${input.settlementNo} pay ${dollarsFromCents(signed)} (was ${dollarsFromCents(Number(b.gross))})`;
  const { releaseDriverPayAccrualInClientTx, reaccrueDriverPayInClientTx } = await import("./driver-pay-restate.service.js");
  const { accrueDriverPayAtDeliveryInClientTx } = await import("./driver-pay-delivery-accrual.service.js");
  const release = state.accrued
    ? await releaseDriverPayAccrualInClientTx(client as never, { operatingCompanyId: input.companyId, driverBillId: b.id, actorUserId: input.actorUserId, reason })
    : { driver_bill_id: b.id, released: [] };
  const stamped = await stampDriverBillVoidedInClientTx(client, {
    driverBillId: b.id, operatingCompanyId: input.companyId,
    reason, userId: input.actorUserId, openOnly: true,
  });
  if (!stamped) throw new SettlementCreatorError("driver_bill_not_restatable", "Driver bill changed while restating signed pay.");
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
  if (release.released.length) {
    const rBill = (await client.query<{ id: string }>(
      `SELECT id::text FROM driver_finance.driver_bills WHERE operating_company_id = $1::uuid AND load_id = $2::uuid AND bill_number = $3 AND ${notVoided()}`,
      [input.companyId, input.loadId, `${input.loadNumber}-R`],
    )).rows[0];
    if (!rBill) throw new SettlementCreatorError("driver_bill_not_restatable", "Restated driver bill not found for re-accrual.");
    await reaccrueDriverPayInClientTx(client as never, { operatingCompanyId: input.companyId, loadId: input.loadId, actorUserId: input.actorUserId, release, reason, driverBillId: rBill.id, accrue: accrueDriverPayAtDeliveryInClientTx });
  }
}
