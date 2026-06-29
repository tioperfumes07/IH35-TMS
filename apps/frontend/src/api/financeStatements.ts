// FIN-19 — Financial-statements parity (P&L / Balance Sheet / Trial Balance).
// READ-ONLY. The page is gated behind this OFF-by-default flag; with no lib.feature_flags
// row the resolver returns false, so the Finance-Hub statements surface stays disabled.
// All data fetching reuses the existing accounting report endpoints in ./reports.ts —
// this module intentionally introduces NO new endpoint and NO second COA path.
export const FINANCE_STATEMENTS_UI_FLAG = "FINANCE_STATEMENTS_UI_ENABLED";
