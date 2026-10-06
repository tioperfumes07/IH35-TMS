# LANE_CROSS — CC-3 — the money-cell ENGINE: MoneyCell + the ledger target (2026-10-06)

**Owner, 2026-10-06:** "find the root cause and find permanent fix to the engine so it does not occur anymore when creating those actions."

**Root cause:** every page hand-wrote `<td className="text-right tabular-nums">{money(x)}</td>`. The default way to show a figure was a figure you cannot click, and nothing at build time asked "what does this number open?". Totals could not be wired at all: AmountLink had no target for a set of accounts.

**Permanent fix:**
1. **`components/shared/MoneyCell`.** Its `drill` prop is REQUIRED and is one of:
   - `{ entity }`: the one record;
   - `{ amount }`: the exact list;
   - `{ none: "reason" }`: no transaction behind it.

   Rendering is uniform: right-aligned tabular numerals, an em dash for missing, never -$0.00.
2. **AmountLink target `ledger`** (a set of accounts plus a period). It opens the Reclassify ledger with `?account_ids&from_date&to_date`. That page now reads those parameters and proves "N accounts: opening + listed lines = closing — matches the total" (or says loudly that it doesn't). A cash-basis figure gets no drill.
3. **Guard** `verify-money-cells-click-through`:
   - every MoneyCell drill must be readable at the call site;
   - a `none` needs a reason of at least 20 characters and is listed on every run;
   - unwired + declared may never grow (combined ceiling), so relabelling a cell `none` does not "fix" it.

**This PR:**
- Balance Sheet Total Assets / Total Liabilities and the P&L section totals now drill.
- 3 computed Balance Sheet figures are declared no-drill with reasons: cash-basis adjustment, current-year earnings, total equity.
- Unwired 49 → 43, declared 3, combined 46.

**Files:**
- `MoneyCell.tsx` (new) and its test, `AmountLink.tsx`
- `ReclassifyTransactionsPage.tsx`, `BalanceSheetPage.tsx`, `ProfitLossPage.tsx`
- `verify-money-cells-click-through.mjs` (selftest 16/16)
- `verify-reclassify-list-sums-to-its-balance.mjs`: accepts `useState(urlFrom ?? firstOfFiscalYear())`, so the default is still fiscal year to date

**CC-1 / CC-2:** nothing to do. This note is the record of the crossing.
