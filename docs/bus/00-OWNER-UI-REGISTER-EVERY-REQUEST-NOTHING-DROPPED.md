# OWNER UI REGISTER — EVERY REQUEST FROM 2026-10-03, WITH AN OWNER AND A STATE
Lead · 2026-10-03 · **this is the inventory. Nothing is closed until it is live and the owner has seen it.**
**CC-2 owns Accounting surfaces. CURSOR owns the app-wide sweeps. Neither hands off (standing order).**

| # | What the owner said | Owner | State |
|---|---|---|---|
| U1 | Nothing in Accounting resizes — full screen or any width | CC-2 | OPEN |
| U2 | Accounting tab bar runs off screen, cut at `BILL PAYM…` | CC-2 | OPEN |
| U3 | `Load costs` does not belong in Accounting; Dispatch surface renders the LIVE load set + current cost from the ledger | CC-2 | OPEN |
| U4 | Two expense tabs — `Expenses` and `Expenses List` | CC-2 | OPEN |
| U5 | Receipt creator must BE the expense creator, one writer | CC-2 | OPEN |
| U6 | Checks list must show all checks with full filters | CC-2 | OPEN |
| U7 | Create Check is out of proportion — a modal, QBO size | CC-2 | OPEN |
| U8 | **Create Check offers no open bills — a check paying a bill IS a bill payment, else the cost is DOUBLE-COUNTED** | CC-2 + CC-1 | OPEN · money |
| U9 | Print checks lists only created-and-not-printed; number proposed at print, **editable**, sequence continues from what he types, duplicate warns, gaps recorded with a reason | CC-2 | OPEN |
| U10 | Every bills sub-tab renders only its own type | CC-2 | OPEN |
| U11 | Measure whether `Vendor bill` = `Bill` before removing | CC-2 | OPEN |
| U12 | Status is a multi-selector everywhere — "right now it looks dirty" | CC-2 · CURSOR | OPEN |
| U13 | Accounting's Vendors and Customers tabs are pure redirects — remove both | CC-2 | OPEN |
| U14 | `Maintenance & shop` kept, renamed **Work orders & bills** | CC-2 | OPEN |
| U15 | A tab in Accounting must render accounting data | ALL | STANDING |
| U16 | Work order number, unit and trailer on every bill/expense list, and **a stored copy of the work order opens from the document** | CC-2 + CC-3 | OPEN |
| U17 | Expenses is read-only; reclassify must work from it | CC-2 | OPEN |
| U18 | **`← Back` is browser history — becomes a breadcrumb, parent always the module home. App-wide. Some screens have NO back at all** | CURSOR · CC-2 | OPEN |
| U19 | Reclassify: register never loaded; zero accounts hidden; default window too narrow | LEAD | **FIXED, awaiting merge** |
| U20 | Reclassify: P&L / Balance Sheet toggle, every account incl. 0.00, sortable headers, wider pane | LEAD | **FIXED, awaiting merge** |
| U21 | Reclassify: **calendars cannot change the YEAR** | CC-2 | OPEN |
| U22 | Reclassify: the **expense number is missing** from Num (service resolves it — find why it renders empty) | CC-2 | OPEN |
| U23 | Reclassify: **no filters for Load, Truck, Driver, Unit, Trailer, Vendor** + a column chooser to add them | CC-2 | OPEN |
| U24 | Reclassify: three selectors — by account, **by item**, by load | CC-2 | OPEN |
| U25 | Diesel → Reefer Diesel moves item + account + **IFTA flag** + trailer linkage, hour-based | CC-2 | OPEN |
| U26 | **Banking filters do not filter correctly** | CC-2 | OPEN · NEW |
| U27 | **P&L and Balance Sheet must render like QuickBooks — no negative income or liabilities.** Backend sign math is CORRECT; the SURFACE renders a raw ledger balance | CC-2 · CURSOR | OPEN · the one he is looking at |
| U28 | Multi-select account filters **everywhere in the app** | CURSOR | OPEN |
| U29 | Everything clickable — every cell naming a record opens it | CURSOR | OPEN |
| U30 | Every column header sorts, ascending and descending | CURSOR | OPEN |
| U31 | Cleared / uncleared on every balance and both agings, with the uncleared warning | CURSOR | OPEN |

## THE RULE FOR ALL OF IT — LAW 368.3
**Every screen is honest.** Empty is a question, not an answer. A failure never renders as `0`. Two readers of
the same data on one page agree or the page does not ship. Default filters are declared on screen.

## U27 IS THE ONE TO DO FIRST
Measured: `profit-loss.service.ts` emits revenue as `credits − debits` and expenses as `debits − credits`, so
**the backend already returns income and expenses POSITIVE, exactly as QBO presents them.** Where the owner
sees a negative Freight Income or a negative A/P, the **surface** is rendering a raw ledger balance instead of
the statement's natural sign. **Find every surface that prints a balance and make it present by natural sign:**
income and liabilities positive, assets and expenses positive, and only a genuine contra balance negative.
The reclassify account tree is one of those surfaces, and so is anything showing `period_activity_cents`.

**Guard:** `verify-no-surface-prints-a-raw-ledger-sign.mjs`.
