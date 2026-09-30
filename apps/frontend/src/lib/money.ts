// Canonical money + number formatting — QuickBooks Online style, used app-wide so every amount reads the
// SAME everywhere: "$1,234.56" (thousands separators, exactly two decimals).
// Plain counts get thousands separators too ("1,234"). This is the single source of truth — do NOT
// hand-roll `toFixed(2)`, `toLocaleString`, or per-file `Intl.NumberFormat` money variants; import from
// here so nothing drifts out of QBO format again.
//
// C-37 (Round 300 #3) — table display helpers use accounting parentheses for negatives and render
// missing as "—" (never fabricate $0.00). Non-table formatUsdCents/formatUsd keep legacy QBO minus
// sign and null→$0.00 for exports, KPIs, and existing callers outside ParityTable cells.
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

/** C-37 — missing numeric/money cells render em dash, never a fabricated zero. */
export const TABLE_MISSING = "—";

/** Tailwind class for C-37 accounting negatives in table cells (red parentheses). */
export const TABLE_MONEY_NEGATIVE_CLASS = "text-red-600";

function toNumber(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
}

function parseDisplayNumber(value: number | string): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

function isMissingDisplayValue(value: unknown): boolean {
  return value == null || value === "";
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

function formatAccountingDollars(dollars: number): string {
  if (!Number.isFinite(dollars) || Object.is(dollars, -0) || Math.abs(dollars) < 0.005) {
    return USD.format(0);
  }
  if (dollars < 0) {
    return `(${USD.format(Math.abs(dollars))})`;
  }
  return USD.format(dollars);
}

/** True when a cents value should render as a red accounting negative in a table cell. */
export function isNegativeMoneyCents(cents: number | string | null | undefined): boolean {
  if (isMissingDisplayValue(cents)) return false;
  const n = parseDisplayNumber(cents as number | string);
  return n != null && n < 0 && Math.abs(n) >= 0.5;
}

/** True when a dollar value should render as a red accounting negative in a table cell. */
export function isNegativeMoneyDollars(dollars: number | string | null | undefined): boolean {
  if (isMissingDisplayValue(dollars)) return false;
  const n = parseDisplayNumber(dollars as number | string);
  return n != null && n < -0.005;
}

/**
 * C-37 table money from integer CENTS — missing → "—"; negatives → "($1,234.56)" (no leading minus).
 * Zero → "$0.00". Prefer TableMoneyCell in JSX columns; this is the plain-text twin for CSV/export.
 */
export function formatUsdCentsTable(cents: number | string | null | undefined): string {
  if (isMissingDisplayValue(cents)) return TABLE_MISSING;
  const n = parseDisplayNumber(cents as number | string);
  if (n == null) return TABLE_MISSING;
  return formatAccountingDollars(n / 100);
}

/**
 * C-37 table money from DOLLARS — missing → "—"; negatives → accounting parentheses.
 */
export function formatUsdTable(dollars: number | string | null | undefined): string {
  if (isMissingDisplayValue(dollars)) return TABLE_MISSING;
  const n = parseDisplayNumber(dollars as number | string);
  if (n == null) return TABLE_MISSING;
  return formatAccountingDollars(n);
}

/**
 * C-37 plain numeric table cell — missing → "—", never "0" unless the value is a real zero.
 */
export function formatNumberTable(
  value: number | string | null | undefined,
  maxFractionDigits = 0,
): string {
  if (isMissingDisplayValue(value)) return TABLE_MISSING;
  const n = parseDisplayNumber(value as number | string);
  if (n == null) return TABLE_MISSING;
  if (maxFractionDigits <= 0) return INT.format(n);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(n);
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

// Guard + tests anchor — C-35 negative-zero scrubber stays the non-table money path.
export { usdFormatNoNegativeZero };
