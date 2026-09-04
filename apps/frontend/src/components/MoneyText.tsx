// GLB-05 (owner-ordered 2026-09-01/09-04) — "All money renders in QuickBooks number format
// ($1,234.56, right aligned, tabular numerals). ONE money component. No exceptions."
//
// lib/money.ts already carries the canonical formatting FUNCTIONS (formatUsdCents/formatUsd) —
// this is the canonical RENDERING component: the thing that guarantees every amount on screen also
// gets the same layout treatment (right-aligned, tabular numerals so columns of numbers line up),
// not just the same string. A bare `{formatUsdCents(x)}` still lets every callsite invent its own
// className (or none) — this component is the one place that decision lives.
//
// Do NOT hand-roll `toLocaleString(..., { style: "currency" })`, `toFixed(2)` with a manual "$"
// prefix, or a per-file `money()`/`fmt()` helper that reimplements this — import MoneyText (or
// formatUsdCents/formatUsd from lib/money.ts for a non-JSX context, e.g. a CSV export) instead.
// Guarded by scripts/verify-money-text-component-adoption-ratchet.mjs — the raw-currency-format
// count may not go up.
import type { HTMLAttributes } from "react";
import { formatUsd, formatUsdCents } from "../lib/money";

type MoneyTextProps = HTMLAttributes<HTMLSpanElement> & {
  /** Integer cents — the app's canonical money storage unit. Prefer this over `dollars`. */
  cents?: number | string | null;
  /** A value already in dollars (e.g. a pre-divided numeric column). Use only when cents isn't available. */
  dollars?: number | string | null;
  /** Negative amounts render in red, matching QBO's own convention for a negative balance/variance.
   *  Off by default — many screens (e.g. a debit/credit column that is negative by design, not by
   *  error) should NOT redden a normal negative value. Opt in explicitly per callsite. */
  negativeIsWarning?: boolean;
};

/** QBO-format money text: right-aligned, tabular numerals, "$1,234.56" / "-$1,234.56". Renders from
 *  either integer cents (preferred) or a dollar amount — pass exactly one. */
export function MoneyText({ cents, dollars, negativeIsWarning = false, className = "", ...rest }: MoneyTextProps) {
  const raw = cents !== undefined ? cents : dollars;
  const numeric = typeof raw === "string" ? Number(raw) : raw ?? 0;
  const isNegative = Number.isFinite(numeric) && Number(numeric) < 0;
  const text = cents !== undefined ? formatUsdCents(cents) : formatUsd(dollars);

  const classes = [
    "inline-block text-right tabular-nums",
    negativeIsWarning && isNegative ? "text-red-700" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {text}
    </span>
  );
}
