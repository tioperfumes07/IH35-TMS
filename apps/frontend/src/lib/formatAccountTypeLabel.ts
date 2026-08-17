import { humanizeEnumLabel } from "./humanizeEnumLabel";

/**
 * LV-REPORTS-ACCOUNT-TYPE-RAW-ENUM-LABELS — Trial Balance / P&L / Cash Flow Statement
 * must never paint raw COA enum tokens (e.g. CostOfGoodsSold) in the Type column.
 * Sorting / API / exports keep the raw value; display only goes through this formatter.
 */
export function formatAccountTypeLabel(value: unknown): string {
  const human = humanizeEnumLabel(value);
  return human || "—";
}
