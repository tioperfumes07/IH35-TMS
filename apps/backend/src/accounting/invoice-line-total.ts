/**
 * Cents for an invoice line, computed the way invoice_lines_qty_rate_amount_check computes it: on the
 * quantity as the column stores it (numeric(10,2)) and the unit as bigint cents, rounded half away from
 * zero. A plain Math.round(quantity * unit) disagrees on exact halves that binary floating point cannot
 * represent (0.29 x 50 = 14.4999... -> 14, where the stored row says 15), and the CHECK refuses that row.
 */
export function invoiceLineTotalCents(quantity: number, unitAmountCents: number): number {
  const hundredths = Math.round(quantity * 100);
  const unit = Math.round(unitAmountCents);
  return Math.round((hundredths * unit) / 100);
}
