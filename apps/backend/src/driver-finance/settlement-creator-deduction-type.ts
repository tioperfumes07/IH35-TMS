/**
 * LEAD 443.110 G14 — a Settlement Creator deduction posts by ITS type, not as "other" -> 7200 for every line.
 *
 * The type comes from the deduction ITEM the operator picked (catalogs.items -> its own account): the deduction type is the
 * one whose recovery role — through the SAME mapping the settlement close posts with (bucketRecoveryRoleKey in
 * settlement-bill-payment.math.ts -> chart_of_accounts_roles) — is bound to that item's account. So the close credits
 * exactly the account the item names: damage -> damage_recovery, wire / ACH fee -> bank_fee_recovery, company vehicle fuel
 * -> company_fuel_advance_expense, cash advance -> advance_recovery, the driver-deduction items on 7200 -> other_recovery.
 *
 *   - The admin fee line (sent with no item, description "Admin fee") is the admin-fee type: other_recovery (7200 Driver
 *     Admin Fee & Chargeback Income), by name — never by falling through.
 *   - An item whose account is the driver escrow liability (2100 or one of its sub-accounts) is refused: escrow is entered
 *     in the Escrow section, which credits the driver's own 2100-00-0NN account.
 *   - An item whose account no deduction type posts to (e.g. a toll EXPENSE item on 5300 while toll_recovery is unbound), or
 *     a non-admin-fee line with no item, is refused by name — never silently "other".
 */
import { resolveRoleAccountOptional, isCoaRole } from "../accounting/coa-roles/resolver.service.js";
import { bucketRecoveryRoleKey } from "../accounting/settlement-posting/settlement-bill-payment.math.js";
import type { SettlementDeductionSourceType } from "./deductions.service.js";
import { SettlementCreatorError } from "./settlement-creator-error.js";

type Queryable = { query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: R[] }> };

/** Deduction types a Creator line can carry, in preference order when two bind to the same account. */
export const CREATOR_DEDUCTION_TYPES: SettlementDeductionSourceType[] = [
  "other",
  "damage",
  "wire_fee",
  "company_vehicle_fuel",
  "cash_advance_repayment",
  "fuel",
  "toll",
  "fine",
  "citation",
  "equipment",
];

export const ADMIN_FEE_LINE_RE = /^\s*admin\s*fee\b/i;

export type CreatorDeductionType = { deductionType: SettlementDeductionSourceType; roleKey: string; accountId: string };

/** Pure: pick the type whose role account equals the item's account (first in CREATOR_DEDUCTION_TYPES order). */
export function pickDeductionTypeForAccount(
  itemAccountId: string,
  roleAccountByType: ReadonlyMap<SettlementDeductionSourceType, string | null>
): SettlementDeductionSourceType | null {
  for (const t of CREATOR_DEDUCTION_TYPES) {
    if (roleAccountByType.get(t) === itemAccountId) return t;
  }
  return null;
}

async function roleAccountsByType(client: Queryable, operatingCompanyId: string): Promise<Map<SettlementDeductionSourceType, string | null>> {
  const out = new Map<SettlementDeductionSourceType, string | null>();
  for (const t of CREATOR_DEDUCTION_TYPES) {
    const role = bucketRecoveryRoleKey(t);
    out.set(t, isCoaRole(role) ? await resolveRoleAccountOptional(client as never, operatingCompanyId, role) : null);
  }
  return out;
}

export async function resolveCreatorDeductionType(
  client: Queryable,
  operatingCompanyId: string,
  line: { item_id?: string | null; description?: string | null }
): Promise<CreatorDeductionType> {
  const label = line.description?.trim() || "Deduction";
  const byType = await roleAccountsByType(client, operatingCompanyId);
  if (!line.item_id) {
    if (ADMIN_FEE_LINE_RE.test(label)) {
      const accountId = byType.get("other") ?? null;
      if (!accountId) throw new SettlementCreatorError("deduction_account_unbound", `Deduction "${label}": the admin-fee account (role other_recovery) is not bound for this company.`);
      return { deductionType: "other", roleKey: bucketRecoveryRoleKey("other"), accountId };
    }
    throw new SettlementCreatorError("deduction_item_required", `Deduction "${label}": pick the deduction item — the item decides which account the deduction credits.`);
  }
  const item = (
    await client.query<{ name: string; account_id: string | null; account_label: string | null; is_escrow: boolean }>(
      `SELECT i.item_name AS name, a.id::text AS account_id,
              trim(coalesce(a.account_number, '') || ' ' || coalesce(a.account_name, '')) AS account_label,
              EXISTS (
                SELECT 1 FROM accounting.chart_of_accounts_roles r
                 WHERE r.operating_company_id = i.operating_company_id AND r.is_active AND r.role = 'escrow_liability_default'
                   AND (r.account_id = a.id OR r.account_id = a.parent_account_id)
              ) AS is_escrow
         FROM catalogs.items i
         LEFT JOIN catalogs.accounts a ON a.id = COALESCE(i.default_income_account_id, i.default_expense_account_id)
        WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid`,
      [line.item_id, operatingCompanyId]
    )
  ).rows[0];
  if (!item) throw new SettlementCreatorError("deduction_item_not_found", `Deduction "${label}": the item is not one of this company's items.`);
  if (!item.account_id) throw new SettlementCreatorError("deduction_item_account_missing", `Deduction "${label}": item "${item.name}" names no account.`);
  if (item.is_escrow) {
    throw new SettlementCreatorError("deduction_is_escrow", `Deduction "${label}": item "${item.name}" is driver escrow — enter it in the Escrow section (it credits the driver's own escrow account).`);
  }
  const deductionType = pickDeductionTypeForAccount(item.account_id, byType);
  if (!deductionType) {
    throw new SettlementCreatorError(
      "deduction_type_unmapped",
      `Deduction "${label}": item "${item.name}" posts to ${item.account_label}, but no settlement deduction type credits that account — pick a driver deduction item, or bind the recovery role for that account.`
    );
  }
  return { deductionType, roleKey: bucketRecoveryRoleKey(deductionType), accountId: item.account_id };
}
