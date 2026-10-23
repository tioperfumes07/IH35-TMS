/**
 * ROUND 443.258-B — one shared money display helper (D002).
 * Always "$1,234.56" (two decimals). Prefer right-aligned tabular cells via QBO_MONEY_CELL_CLASS.
 */
export { formatUsd as formatMoney, formatUsdCents as formatMoneyCents } from "./money";
