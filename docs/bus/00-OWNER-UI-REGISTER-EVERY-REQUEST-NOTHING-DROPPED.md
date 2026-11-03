# OWNER UI REGISTER — EVERY REQUEST FROM 2026-10-03, WITH AN OWNER AND A STATE
Lead · 2026-10-03 · **this is the inventory. Nothing is closed until it is live and the owner has seen it.**
**CC-2 owns Accounting surfaces. CURSOR owns the app-wide sweeps. Neither hands off (standing order).**

| # | What the owner said | Owner | State |
|---|---|---|---|
| U1 | Nothing in Accounting resizes — full screen or any width | CC-2 | FAIL partial 11-02 17:10: at measured1280/1023/768 CSS px no document overflow, but fixed three lower panels truncate names/money; aging total wraps. Screenshots private; exact1024/1440 unverified |
| U2 | Accounting tab bar runs off screen, cut at `BILL PAYM…` | CC-2 | LIVE partial 11-02 17:10: nav wraps with scrollWidth=clientWidth at measured1280/1023/768 CSS px; screenshots private. Exact1024/1440 and owner acceptance pending |
| U3 | `Load costs` does not belong in Accounting; Dispatch surface renders the LIVE load set + current cost from the ledger | CC-2 | LIVE partial 11-02 16:27 CT: no Load costs in Accounting top navigation or full More menu; screenshot private. Dispatch live-population/ledger parity not certified by this navigation check |
| U4 | Two expense tabs — `Expenses` and `Expenses List` | CC-2 | LIVE 11-02: one Expenses top-level tab; overflow inspected, no Expenses List duplicate. Submenu/writer coverage pending; owner acceptance pending |
| U5 | Receipt creator must BE the expense creator, one writer | CC-2 | LIVE partial 11-02 16:28 CT: New receipt opens RecordExpenseModal with vendor/date/unit/payment/document controls; screenshot private, closed without save. Shared component confirmed in ReceiptsPage.tsx:286; no production writer invocation or full posting certification |
| U6 | Checks list must show all checks with full filters | CC-2 | LIVE partial 11-02 13:36 CT: 0 rows; search/date/type/status/bank controls present. Empty population cannot prove complete coverage/filter effect |
| U7 | Create Check is out of proportion — a modal, QBO size | CC-2 | LIVE measured 11-02: 1280px modal at 2983px CSS viewport; screenshot private. Saved draft untouched; narrow-width sizing and owner acceptance pending |
| U8 | **Create Check offers no open bills — a check paying a bill IS a bill payment, else the cost is DOUBLE-COUNTED** | CC-2 + CC-1 | OPEN · money |
| U9 | Print checks lists only created-and-not-printed; number proposed at print, **editable**, sequence continues from what he types, duplicate warns, gaps recorded with a reason | CC-2 | OPEN live: stock next 1006 / 0 waiting checks, no numbers assigned. Independent 11-02 14:16 CT retest after #28047: editableNumbers 3/3 PASS; earlier stale-selector test failure resolved. Empty live print queue cannot certify writer behavior |
| U10 | Every bills sub-tab renders only its own type | CC-2 | LIVE 11-02: Vendor tab 186 total / 50 visible vendor rows; Driver tab 190 total / 50 visible driver rows. Other pages not exhausted; not blanket DONE |
| U11 | Measure whether `Vendor bill` = `Bill` before removing | CC-2 | LIVE measured 11-02 17:04: All bills is register; Vendor bill is creator, not duplicate. Creator defaults Repair Bill incorrectly; filed CC-2. Screenshot private, canceled without submission; no removal |
| U12 | Status is a multi-selector everywhere — "right now it looks dirty" | CC-2 · CURSOR | OPEN — Insurance PoliciesList MultiSelectDropdown already on main (stale 11-02 note); residual singles include Fuel Card Overage status pills + DriversTable scalar + catalog Active/Inactive selects |
| U13 | Accounting's Vendors and Customers tabs are pure redirects — remove both | CC-2 | LIVE 11-02: neither top-level nor More menu includes Vendors/Customers; Go to vendors action remains. Owner acceptance pending |
| U14 | `Maintenance & shop` kept, renamed **Work orders & bills** | CC-2 | LIVE 11-02 15:29 CT: destination has correct heading, sortable WO/unit/type/document/date/amount/status columns, 0 linked documents and explicit empty state. Label/page verified; empty population cannot prove linkage/writer coverage |
| U15 | A tab in Accounting must render accounting data | ALL | STANDING |
| U16 | Work order number, unit and trailer on every bill/expense list, and **a stored copy of the work order opens from the document** | CC-2 + CC-3 | OPEN |
| U17 | Expenses is read-only; reclassify must work from it | CC-2 | FAIL partial 11-02 15:31 CT: posted expense detail read-only with Print/Void, but no contextual Reclassify action; only global Reclassify navigation. Private screenshot; no void/edit submitted |
| U18 | **`← Back` is browser history — becomes a breadcrumb, parent always the module home. App-wide. Some screens have NO back at all** | CURSOR · CC-2 | OPEN |
| U19 | Reclassify: register never loaded; zero accounts hidden; default window too narrow | LEAD | LIVE partial 11-02 13:57 CT after #28042: honest idle prompt, scoped income 284 lines and fuel 1968 lines load. Zero accounts visible, fiscal-year range. All-account proof not run; owner acceptance pending |
| U20 | Reclassify: P&L / Balance Sheet toggle, every account incl. 0.00, sortable headers, wider pane | LEAD | **FIXED, awaiting merge** |
| U21 | Reclassify: **calendars cannot change the YEAR** | CC-2 | LIVE retest 11-02 14:49–14:51 CT after #28071: all 4 calendars allow selecting 2025 and render that year's day buttons; private screenshot captured. Independent DatePicker tests 9/9 PASS. Earlier #28034 year-lock regression repaired; no transaction/date submission. Owner acceptance pending |
| U22 | Reclassify: the **expense number is missing** from Num (service resolves it — find why it renders empty) | CC-2 | LIVE partial 11-02 13:58 CT: first fuel-account page 83 expense rows, 0 missing Num. Not all pages certified; 17 fuel-event rows show generic type instead of number |
| U23 | Reclassify: **no filters for Load, Truck, Driver, Unit, Trailer, Vendor** + a column chooser to add them | CC-2 | LIVE partial 11-02: load/truck/driver/trailer/vendor controls and Columns(14) visible; load checkbox menu opens human labels. Filtering effect UNVERIFIED while register loading |
| U24 | Reclassify: three selectors — by account, **by item**, by load | CC-2 | LIVE partial: account/item/load checkbox selectors present, scoped account effect proved. Combined item/load effect pending |
| U25 | Diesel → Reefer Diesel moves item + account + **IFTA flag** + trailer linkage, hour-based | CC-2 | OPEN |
| U26 | **Banking filters do not filter correctly** | CC-2 | LIVE partial 11-02 16:40 CT: account/date/type union changes rows; amount-range missing Received/Spent and shared Reset leaves active filter. Private screenshots captured; OPEN repair |
| U27 | **P&L and Balance Sheet must render like QuickBooks — no negative income or liabilities.** Backend sign math is CORRECT; the SURFACE renders a raw ledger balance | CC-2 · CURSOR | OPEN · the one he is looking at |
| U28 | Multi-select account filters **everywhere in the app** | CURSOR | OPEN |
| U29 | Everything clickable — every cell naming a record opens it | CURSOR | OPEN |
| U30 | Every column header sorts, ascending and descending | CURSOR | LIVE retest 11-02 14:04 CT: Banking Home 14 data-header buttons, Account asc/desc works; Accounting aging 4 header buttons, Amount asc/desc works and currency symbols restored. App-wide every-column coverage remains OPEN |
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
