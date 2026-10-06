// ROUND 433.2 — WHICH invoices are open A/R. One definition, used by every surface that sums open A/R and by the invoice
// list a figure drills to, so the clicked number and the list it opens are the same population.
// MEASURED 2026-10-06: the customer profile summed `status <> 'void'` (drafts INCLUDED) while the invoice list's
// has_balance excluded drafts — a profile aging bucket would have drilled to a list adding up to a different number.
// A draft is not a receivable: it has not been issued.
export const OPEN_AR_STATUS_EXCLUDED = ["draft", "void", "voided", "paid"] as const;

/** SQL conditions (AND-joined) for an open A/R invoice under the given alias. */
export function openArInvoiceConditions(alias: string): string[] {
  return [
    `COALESCE(${alias}.amount_open_cents, 0) > 0`,
    `${alias}.voided_at IS NULL`,
    `${alias}.status NOT IN (${OPEN_AR_STATUS_EXCLUDED.map((s) => `'${s}'`).join(", ")})`,
  ];
}
