/**
 * FAC-09a / Faro Aging "View by Invoice Date / Purchase Date / Fund Date".
 * Each basis is a real column from the recourse-pipeline join; missing values fall back to
 * factored_at (advance register date) so Age never goes blank.
 */
export type AgingDateBasis = "invoice" | "purchase" | "fund";

export const AGING_DATE_BASIS_OPTIONS: ReadonlyArray<{ id: AgingDateBasis; label: string }> = [
  { id: "invoice", label: "Invoice Date" },
  { id: "purchase", label: "Purchase Date" },
  { id: "fund", label: "Fund Date" },
];

export type AgingDateFields = {
  factored_at: string;
  invoice_date?: string | null;
  purchase_date?: string | null;
  fund_date?: string | null;
};

export function agingDateForBasis(row: AgingDateFields, basis: AgingDateBasis): string {
  const pick =
    basis === "invoice" ? row.invoice_date : basis === "purchase" ? row.purchase_date : row.fund_date;
  if (pick && String(pick).trim()) return String(pick);
  return row.factored_at;
}

export function agingDateColumnLabel(basis: AgingDateBasis): string {
  return AGING_DATE_BASIS_OPTIONS.find((o) => o.id === basis)?.label ?? "Inv Date";
}
