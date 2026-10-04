// ROUND 394 RULING 2 — damage, fines and negative settlement are DRIVER RECEIVABLES (the driver owes the
// company), each on its own account, bound through the role table: 1255 driver_damage_receivable,
// 1256 driver_fine_receivable, 1257 driver_negative_settlement_receivable (migration 202615380300).
//
// One map, used by every path that touches one of these liabilities, so they cannot drift:
//   - creation posts Dr the receivable / Cr the matching recovery account (posting-engine 'driver_liability');
//   - the settlement deduction that recovers it credits the receivable (settlement-payrun-close);
//   - an escrow forfeit applied to it credits the receivable (escrow-forfeit);
//   - a write-off is the reversing entry of the creation posting, never a zeroed stored balance.
//
// Credit side on creation (USMCA bindings, 2026-10-04): accident damage -> damage_recovery (6175 Driver
// Accident Damages & Repairs, the cost the driver is charged back for); civil fine -> civil_fines_expense
// (6170 Fines & Penalties, the fine the company paid); internal fine -> other_recovery (7200 Driver Admin Fee
// & Chargeback Income, a company-imposed charge). negative_settlement is NOT here yet: its credit side is the
// settlement itself (pay-run close refuses a negative net today), which the Lead rules on separately.
import type { CoaRole } from "../accounting/coa-roles/resolver.service.js";

export type DriverReceivableRoles = { receivable: CoaRole; credit: CoaRole };

export const DRIVER_RECEIVABLE_BY_LIABILITY_TYPE: Readonly<Record<string, DriverReceivableRoles>> = {
  accident_damage: { receivable: "driver_damage_receivable", credit: "damage_recovery" },
  civil_fine: { receivable: "driver_fine_receivable", credit: "civil_fines_expense" },
  internal_fine: { receivable: "driver_fine_receivable", credit: "other_recovery" },
};

/** The receivable roles for a driver_liabilities.type, or null when that type is not a posted receivable. */
export function driverReceivableFor(liabilityType: string | null | undefined): DriverReceivableRoles | null {
  return DRIVER_RECEIVABLE_BY_LIABILITY_TYPE[String(liabilityType ?? "").trim().toLowerCase()] ?? null;
}
