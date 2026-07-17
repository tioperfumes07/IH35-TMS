/**
 * Format Relay fuel_items lines for Banking (QBO-style register detail).
 * Prod already stores diesel / reefer / DEF / fee on integrations.relay_fuel_transaction_lines —
 * this is display-only (no GL).
 */
export type RelayFuelLine = {
  line_index?: number | null;
  fuel_type?: string | null;
  fuel_type_description?: string | null;
  fuel_product_code?: string | null;
  volume?: string | number | null;
  volume_uom?: string | null;
  total_discounted_price_cents?: string | number | null;
  fee_type?: string | null;
  fee_amount_cents?: string | number | null;
};

export type RelayFuelBreakdownRow = {
  key: string;
  label: string;
  amount_cents: number;
  volume_label: string | null;
};

function cents(v: string | number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Human label for a Relay fuel_type (truck diesel vs reefer diesel vs DEF). */
export function relayFuelTypeLabel(line: RelayFuelLine): string {
  const t = (line.fuel_type ?? "").trim().toLowerCase();
  const desc = (line.fuel_type_description ?? "").trim();
  if (t === "diesel") return "Diesel (truck)";
  if (t === "reefer") return "Diesel (reefer)";
  if (t === "def") return "DEF";
  if (desc) return desc;
  if (t) return t.charAt(0).toUpperCase() + t.slice(1);
  return "Fuel";
}

/**
 * Expand stored lines into display rows: one per product + a separate Fuel fee row when fee_amount_cents > 0.
 * Matches how Relay reports a purchase (e.g. $600 diesel + $150 reefer + $48 DEF + $2 fee).
 */
export function buildRelayFuelBreakdown(lines: RelayFuelLine[] | null | undefined): RelayFuelBreakdownRow[] {
  if (!lines?.length) return [];
  const rows: RelayFuelBreakdownRow[] = [];
  let feeTotal = 0;
  let feeType: string | null = null;

  for (const line of lines) {
    const idx = line.line_index ?? rows.length;
    const productCents = cents(line.total_discounted_price_cents);
    if (productCents > 0) {
      const vol = line.volume != null && String(line.volume).trim() !== "" ? Number(line.volume) : NaN;
      const uom = (line.volume_uom ?? "gal").trim() || "gal";
      rows.push({
        key: `product-${idx}`,
        label: relayFuelTypeLabel(line),
        amount_cents: productCents,
        volume_label: Number.isFinite(vol) ? `${vol.toFixed(3)} ${uom}` : null,
      });
    }
    const fee = cents(line.fee_amount_cents);
    if (fee > 0) {
      feeTotal += fee;
      feeType = line.fee_type ?? feeType;
    }
  }

  if (feeTotal > 0) {
    const feeLabel =
      feeType && feeType !== "sender_fee"
        ? feeType.replace(/_/g, " ")
        : "Fuel fee";
    rows.push({
      key: "fee-total",
      label: feeLabel.charAt(0).toUpperCase() + feeLabel.slice(1),
      amount_cents: feeTotal,
      volume_label: null,
    });
  }

  return rows;
}

/** One-line summary under the bank description (e.g. "Diesel (truck) $600.00 · DEF $48.00 · Fuel fee $2.00"). */
export function formatRelayFuelBreakdownSummary(
  lines: RelayFuelLine[] | null | undefined,
  formatUsd: (cents: number) => string,
): string {
  return buildRelayFuelBreakdown(lines)
    .map((r) => `${r.label} ${formatUsd(r.amount_cents)}`)
    .join(" · ");
}
