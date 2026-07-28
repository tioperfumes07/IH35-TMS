/**
 * ND-FA-01 / A4-D6 — owner-locked capitalize-vs-expense threshold for repairs.
 *
 * OWNER-DECISIONS-FINAL 2026-07-26:
 *   A4-D6 — $7,000 capitalize-vs-expense threshold
 *   A4-D1 — capitalized repairs → "Fixed Asset – Trucks"
 *   A4-D2 — big expensed repairs → "Heavy Repair Expense"
 *   A4-D5 — require a Work Order
 *
 * NO new GL math here — only the decision boundary. Posters reuse createJournalEntry /
 * existing maintenance posters and resolve CoA roles for the chosen path.
 */
export const CAPITALIZE_REPAIR_THRESHOLD_CENTS = 700_000; // $7,000.00

export const CAPITALIZE_REPAIR_THRESHOLD_LABEL = "$7,000";

/** CoA role for the expense path (A4-D2). Resolve via coa-roles resolver — never name-match. */
export const HEAVY_REPAIR_EXPENSE_COA_ROLE = "heavy_repair_expense" as const;

export type RepairBooksTreatment = "capitalize" | "expense";

/**
 * Owner lock: repairs at or above $7,000 capitalize; below expense → Heavy Repair Expense role.
 * Callers must still enforce A4-D5 (Work Order required) before posting either path.
 */
export function decideRepairBooksTreatment(amountCents: number): RepairBooksTreatment {
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    throw new Error("decideRepairBooksTreatment: amountCents must be a non-negative finite number");
  }
  return amountCents >= CAPITALIZE_REPAIR_THRESHOLD_CENTS ? "capitalize" : "expense";
}

/** CoA role key for the chosen books treatment (null for capitalize — uses fixed-asset register). */
export function repairBooksExpenseCoaRole(
  treatment: RepairBooksTreatment
): typeof HEAVY_REPAIR_EXPENSE_COA_ROLE | null {
  return treatment === "expense" ? HEAVY_REPAIR_EXPENSE_COA_ROLE : null;
}
