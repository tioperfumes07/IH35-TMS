// Canonical money + number formatting — QuickBooks Online style, used app-wide so every amount reads the
// SAME everywhere: "$1,234.56" (thousands separators, exactly two decimals; negatives "-$1,234.56").
// Plain counts get thousands separators too ("1,234"). This is the single source of truth — do NOT
// hand-roll `toFixed(2)`, `toLocaleString`, or per-file `Intl.NumberFormat` money variants; import from
// here so nothing drifts out of QBO format again.

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

/** Money from integer CENTS → QBO "$1,234.56". The app stores money as integer cents, so this is the
 *  common one. Null/undefined/NaN → "$0.00". Negatives render "-$1,234.56". */
export function formatUsdCents(cents: number | string | null | undefined): string {
  return USD.format(toNumber(cents) / 100);
}

/** Money from a DOLLAR amount → QBO "$1,234.56". Use only when the value is already in dollars (e.g. a
 *  numeric column already divided). Prefer formatUsdCents whenever the source is integer cents. */
export function formatUsd(dollars: number | string | null | undefined): string {
  return USD.format(toNumber(dollars));
}

/** Plain number/count with QBO thousands separators → "1,234". Pass maxFractionDigits for decimals
 *  (e.g. miles to one place). Non-money — never prefixes "$". */
export function formatNumber(value: number | string | null | undefined, maxFractionDigits = 0): string {
  if (maxFractionDigits <= 0) return INT.format(toNumber(value));
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(toNumber(value));
}
