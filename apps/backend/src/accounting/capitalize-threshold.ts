/** ND-FA-01 / A4-D6 / A4-D2 — owner-locked capitalize-vs-expense threshold. */
export const CAPITALIZE_REPAIR_THRESHOLD_CENTS = 700_000; // $7,000.00
export const CAPITALIZE_REPAIR_THRESHOLD_LABEL = "$7,000";
export const HEAVY_REPAIR_EXPENSE_COA_ROLE = "heavy_repair_expense" as const;
export const FIXED_ASSET_REPAIR_COA_ROLE = "fixed_asset_default" as const;
export type RepairBooksTreatment = "capitalize" | "expense";
export function decideRepairBooksTreatment(amountCents: number): RepairBooksTreatment {
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    throw new Error("decideRepairBooksTreatment: amountCents must be a non-negative finite number");
  }
  return amountCents >= CAPITALIZE_REPAIR_THRESHOLD_CENTS ? "capitalize" : "expense";
}
export function repairBooksExpenseCoaRole(treatment: RepairBooksTreatment): typeof HEAVY_REPAIR_EXPENSE_COA_ROLE | null {
  return treatment === "expense" ? HEAVY_REPAIR_EXPENSE_COA_ROLE : null;
}
export function repairBooksCoaRole(amountCents: number): typeof HEAVY_REPAIR_EXPENSE_COA_ROLE | typeof FIXED_ASSET_REPAIR_COA_ROLE {
  return decideRepairBooksTreatment(amountCents) === "expense" ? HEAVY_REPAIR_EXPENSE_COA_ROLE : FIXED_ASSET_REPAIR_COA_ROLE;
}
