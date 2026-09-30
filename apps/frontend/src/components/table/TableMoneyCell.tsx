/**
 * C-37 — canonical ParityTable money cell: accounting parentheses, red negatives, missing → "—".
 * Alignment lives on the <td> via ParityTable's default QBO_MONEY_CELL_CLASS merge.
 */
import type { HTMLAttributes } from "react";
import {
  TABLE_MONEY_NEGATIVE_CLASS,
  formatUsdCentsTable,
  formatUsdTable,
  isNegativeMoneyCents,
  isNegativeMoneyDollars,
} from "../../lib/money";

type TableMoneyCellProps = HTMLAttributes<HTMLSpanElement> & {
  /** Integer cents — preferred storage unit. */
  cents?: number | string | null;
  /** Value already in dollars (rare table columns). Pass exactly one of cents/dollars. */
  dollars?: number | string | null;
};

export function TableMoneyCell({ cents, dollars, className = "", ...rest }: TableMoneyCellProps) {
  const text = cents !== undefined ? formatUsdCentsTable(cents) : formatUsdTable(dollars);
  const isNegative = cents !== undefined ? isNegativeMoneyCents(cents) : isNegativeMoneyDollars(dollars);
  const classes = [isNegative ? TABLE_MONEY_NEGATIVE_CLASS : "", className].filter(Boolean).join(" ");
  return (
    <span className={classes} {...rest}>
      {text}
    </span>
  );
}
