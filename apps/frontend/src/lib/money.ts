// Canonical money + number formatting — QuickBooks Online style, used app-wide so every amount reads the
// SAME everywhere: "$1,234.56" (thousands separators, exactly two decimals; negatives "-$1,234.56").
// Plain counts get thousands separators too ("1,234"). This is the single source of truth — do NOT
// hand-roll `toFixed(2)`, `toLocaleString`, or per-file `Intl.NumberFormat` money variants; import from
// here so nothing drifts out of QBO format again.
//
// D48 — every money COLUMN also uses QBO_MONEY_CELL_CLASS (right-align + tabular-nums) from
// design/qbo-parity.ts so alignment matches QuickBooks, not just the string shape.

export { QBO_MONEY_CELL_CLASS } from "../design/qbo-parity";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function toNumber(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
}

/**
 * C-35 — never emit "-$0.00". IEEE -0, tiny float noise, and rounded-to-zero amounts all print
 * as "$0.00". Real negatives keep the leading minus from Intl (e.g. "-$1.00").
 */
function usdFormatNoNegativeZero(dollars: number): string {
  if (!Number.isFinite(dollars) || Object.is(dollars, -0) || Math.abs(dollars) < 0.005) {
    return USD.format(0);
  }
  return USD.format(dollars);
}

/** Money from integer CENTS → QBO "$1,234.56". The app stores money as integer cents, so this is the
 *  common one. Null/undefined/NaN → "$0.00". Negatives render "-$1,234.56" (never "-$0.00"). */
export function formatUsdCents(cents: number | string | null | undefined): string {
  return usdFormatNoNegativeZero(toNumber(cents) / 100);
}

/** Money from a DOLLAR amount → QBO "$1,234.56". Use only when the value is already in dollars (e.g. a
 *  numeric column already divided). Prefer formatUsdCents whenever the source is integer cents.
 *  C-35 — never "-$0.00". */
export function formatUsd(dollars: number | string | null | undefined): string {
  return usdFormatNoNegativeZero(toNumber(dollars));
}

/** Plain number/count with QBO thousands separators → "1,234". Pass maxFractionDigits for decimals
 *  (e.g. miles to one place). Non-money — never prefixes "$". */
export function formatNumber(value: number | string | null | undefined, maxFractionDigits = 0): string {
  if (maxFractionDigits <= 0) return INT.format(toNumber(value));
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(toNumber(value));
}
