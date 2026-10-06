/**
 * ROUND 433-CUR #2 — ONE QBO format layer at apps/frontend/src/utils.
 *
 * Lead measured `utils/` empty and ordered a single module (date · number · money ·
 * tabular-nums). The real formatters already live under lib/money.ts + lib/formatDate.ts
 * and design/qbo-parity.ts (QBO_MONEY_CELL_CLASS). This barrel is the ONE import path for
 * pages that need them — do NOT invent a second money/date math module, and do NOT
 * hand-roll a per-page Intl currency formatter. Import from here instead.
 *
 * DatePicker year select is pinned separately (aria-label="Year" on the calendar popup).
 */

export {
  formatUsdCents,
  formatUsd,
  formatNumber,
  formatUsdCentsTable,
  formatUsdTable,
  formatNumberTable,
  formatUsdRateTable,
  formatQuantityTable,
  isNegativeMoneyCents,
  isNegativeMoneyDollars,
  TABLE_MISSING,
  TABLE_MONEY_NEGATIVE_CLASS,
  QBO_MONEY_CELL_CLASS,
} from "../lib/money";

export {
  formatDateUS,
  formatDateQboList,
  formatDateTimeUS,
  formatDateTimeLocalUS,
  parseDateUS,
  DATE_PLACEHOLDER_US,
  DATE_PLACEHOLDER_QBO_LIST,
  DATETIME_PLACEHOLDER_US,
  mmmDd,
  mmmDdTime,
  isoToDateTimeLocalValue,
} from "../lib/formatDate";

/** Alias — tabular-nums class for money cells (same token as QBO_MONEY_CELL_CLASS). */
export { QBO_MONEY_CELL_CLASS as TABULAR_NUMS_CLASS } from "../lib/money";
