/**
 * The amount a Settlement Creator fuel line posts (the receipt, else gallons x cpg less the discount) and its card fee —
 * one rule for the post and its preflight (LEAD 443.202: the preflight asks the WEX shape match with the same amount).
 */
export function fuelPurchaseNetAndFeeCents(fuel: {
  receipt_cents?: number | null;
  gallons?: number | null;
  cpg_cents?: number | null;
  fees_cents?: number | null;
  discount_cents?: number | null;
}): { netCents: number; feeCents: number } {
  const feeCents = Math.max(0, Math.round(Number(fuel.fees_cents || 0)));
  const netCents =
    fuel.receipt_cents != null
      ? Math.round(Number(fuel.receipt_cents))
      : Math.round(Number(fuel.gallons || 0) * Number(fuel.cpg_cents || 0)) -
        Math.round(Number(fuel.discount_cents || 0));
  return { netCents, feeCents };
}
