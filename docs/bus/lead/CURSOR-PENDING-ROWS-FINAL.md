# Cursor — every pending register row (source: docs/bus/lead/LEAD-PENDING-REGISTER.md on branch claude/lead-engine-register-2412, 10-24 05:15 PM CT) — 72 rows

| # | Area | Item | Round | Status at 5:15 PM |
|---|---|---|---|---|
| 8 | Settlements | Navigation defects N1-N10 (tabs leave module, escrow dupes, $2575.96, initials) | 443.254 | PARTIAL |
| 31 | Cash Flow | Cash Flow › Home — board verdict PARTIAL | 443.280 | CODED |
| 32 | Cash Flow | Cash Flow › Projected (Auto) — board verdict PARTIAL | 443.280 | CODED |
| 33 | Cash Flow | Cash Flow › Actual vs Projected — board verdict PARTIAL | 443.280 | CODED |
| 34 | Cash Flow | Cash Flow › Rolling Ledger — board verdict LAYERED | 443.280 | CODED |
| 35 | Cash Flow | Cash Flow › Manual — board verdict LAYERED | 443.280 | CODED |
| 37 | Accounting | Accounting › Unexpected — board verdict REBUILT | 443.280 | PARTIAL |
| 38 | Banking | Banking › Home — board verdict REBUILT | 443.280 | PARTIAL |
| 39 | Factoring | Factoring › Home — board verdict LAYERED | 443.280 | OPEN |
| 44 | Settlements | Settlements › Home — board verdict LAYERED | 443.280 | OPEN |
| 45 | Settlements | Settlements › Open — board verdict PARTIAL | 443.280 | PARTIAL |
| 46 | Settlements | Settlements › Closed — board verdict PARTIAL | 443.280 | PARTIAL |
| 49 | Settlements | Settlements › Close — board verdict LAYERED | 443.280 | OPEN |
| 50 | Settlements | Settlements › Company — board verdict REBUILT | 443.280 | PARTIAL |
| 53 | Settlements | Settlements › Escrow — board verdict CHROME-ONLY | 443.280 | OPEN |
| 54 | Settlements | Settlements › Escrow Register — board verdict PARTIAL | 443.280 | PARTIAL |
| 55 | Fuel | Fuel › Home — board verdict CHROME-ONLY | 443.280 | OPEN |
| 56 | Fuel | Fuel › 10 sub-tabs — board verdict CHROME-ONLY | 443.280 | OPEN |
| 98 | Factoring | KPI renders raw "175650.000000000000" and "170210.480000000000"; True cost 0.00% with fees $2,634.76 | 443.281 | CODED |
| 102 | Settlements | Home "Week of Oct 18" lists closed settlements (P-0108 etc.) with status Open; "Settlement (Closed)" toggle empty; Drivers w/ debt 0 | 443.281 | CODED |
| 103 | Settlements | Company Settlements shows 0 / Loading for ~6 s before data (87 closed, 6 not opened) | 443.281 | CODED-QUEUED |
| 114 | Process | Cursor confirmation of 443.282 (owner-authorized build exactly as specified) | 443.282 | OPEN |
| 121 | Home › Overview › Money tiles | D002: Currency values omit cents | 443.257-D | CODED |
| 123 | Home › Overview › Weekly revenue | D004: Axis dates use DD/MM without year | 443.257-D | CLOSED tip `a9722cc9ad` — WeeklyRevenueChart label/labelFull via formatDate (= formatDateUS MM/DD/YYYY); verify-home-kpi-range-toggle D004 |
| 126 | Settlements › Navigation › Profiles | D007: Link targets `/drivers/profiles` | 443.257-D | CODED |
| 127 | Settlements › Navigation › Pre-Settlements | D008: Link targets `/drivers/pre-settlements` | 443.257-D | CODED |
| 128 | Settlements › Navigation › Feed Gate | D009: Link targets `/feed-gate` | 443.257-D | CODED |
| 129 | Settlements › Navigation › Cash Advances | D010: Link targets `/cash-advances` | 443.257-D | CODED |
| 130 | Settlements › Navigation › Liabilities | D011: Link targets `/liabilities` | 443.257-D | CODED |
| 131 | Settlements › Navigation › Escrow | D012: Link targets `/accounting/escrow` | 443.257-D | CODED |
| 132 | Settlements › Navigation › Pay Rate Templates | D013: Link targets `/drivers/pay-rate-templates` | 443.257-D | CODED |
| 133 | Settlements › Navigation › Deductions | D014: Link targets `/drivers/deductions` | 443.257-D | CODED |
| 140 | Dispatch › Home › Round-trip exposure | D021: Driver names abbreviated to initials | 443.257-D | RE-VERIFY |
| 144 | Dispatch › Load Costs › Pickup / delivery cells | D025: Dates display M/D/YY | 443.257-D | CLOSED tip `a9722cc9ad` — PU/Del formatDateQboList (= formatDateUS MM/DD/YYYY); verify-load-costs-board-column-contract D025 |
| 148 | Tasks › Exceptions › Since column | D029: ISO YYYY-MM-DD rendered | 443.257-D | CLOSED tip `a9722cc9ad` — Since formatDateUS(row.since); verify-notif-parity-recon-slate-leftover-chrome D029 |
| 149 | Driver Hub › Driver Scheduler › Date range | D030: Subtitle uses YYYY-MM-DD; grid uses MON-DD | 443.257-D | CLOSED tip `a9722cc9ad` — subtitle formatDateUS(range.start/end); grid day headers stay formatPlannerDayLabel (MMM-DD) per GLB-08/PLN-03; verify-planner-bar-label-tier D030 |
| 161 | Cash Flow › Projected Auto › Seven-day outlook | D042: Currency abbreviated with k suffix and zero shown without cents | 443.257-D | CODED |
| 162 | Cash Flow › Projected / Rolling / Manual › Date labels and cells | D043: Day labels and invoice/due cells omit year and use month names | 443.257-D | CLOSED tip `d7334765d4` — DailyPrediction/Rolling/Manual/AVP → formatDateUS; verify-cf-rolling-proj + verify-actual-vs-projected D043 |
| 164 | Banking › Home › Drift alert as-of | D045: Raw ISO timestamp rendered, including T and Z | 443.257-D | CODED |
| 171 | 425C › History › Filed timestamp | D052: Month/day rendered without zero padding | 443.257-D | CLOSED tip `d7334765d4` — HistoryTab formatDateTimeUS(r.filed_at); verify-form425c-history-includes-drafts D052 |
| 178 | Program › Scenario tracker › Certification timestamp | D059: Raw database timestamp with fractional seconds and +00 timezone | 443.257-D | CODED |
| 179 | System › Transaction Health › Generated/document dates | D060: Month-name timestamps instead of MM/DD/YYYY | 443.257-D | CODED |
| 180 | System › Transaction Health › Journal-entry and bill-payment labels | D061: Raw UUIDs are visible display labels | 443.257-D | CODED-QUEUED |
| 181 | System › Transaction Health › Wiring preview DR/CR | D062: Currency values lack dollar signs | 443.257-D | CODED-QUEUED |
| 183 | Accounting › Create Manual JE › Step 2 Lines | D064: Header summary renders `Date: 2026-10-22`, while Step 1 correctly shows `10/22/2026` | 443.257-D | CODED |
| 184 | Accounting › Create Manual JE › Step 2 Lines | D065: Class selector overlaps the adjacent Debit field; line controls overflow the drawer horizontally | 443.257-D | CLOSED tip `d7334765d4` — ManualJEModal minmax(0,…) 5-col + [&>*]:min-w-0; verify-91105 D065 |
| 185 | Banking › Home / Record Transfer › Drawer footer | D066: Persistent alert stack renders above the open transfer drawer and obscures its bottom action area | 443.257-D | CODED |
| 186 | Accounting › Bills / Bill detail › Payments on this bill | D067: Two linked payments render as `Payment — not visible` rather than distinct display identifiers | 443.257-D | CODED |
| 187 | Accounting › Bill detail › Journal Entity column | D068: Five journal rows show raw UUID entity labels | 443.257-D | CLOSED tip `a9722cc9ad` (#27608) + ratchet — PostingGrid entityLabel(entity_name) + postingPartyNameSql (#27549); verify-je-debit-credit-columns D068 |
| 188 | Accounting › Reclassify › Account balance heading | D069: Date displays `10/23/26` while date filters use `10/23/2026` | 443.257-D | CLOSED tip `a9722cc9ad` (#27608) — Balance {formatDateQboList(toDate)} ≡ MM/DD/YYYY (= formatDateUS); DatePicker same; verify-b5-reclassify-batch D069 |
| 189 | Banking › Categorize / Match › Candidate dates | D070: Loaded candidate list displays YYYY-MM-DD dates while transaction header uses MM/DD/YYYY | 443.257-D | CODED — MatchDrawer formatDateUS(c.event_date); guard D070 |
| 190 | Banking › Categorize / Match › Candidate payee labels | D071: Candidate names mix ALL CAPS and proper case | 443.257-D | CODED — MatchDrawer formatPersonName(c.counterparty_name); guard D071 |
| 191 | Banking › Relay card › Wallet balance tile | D072: Five-digit currency omits thousands separator | 443.257-D | CODED-QUEUED |
| 192 | Cash Flow › Projected Auto › Expected Expenses driver labels | D073: Driver Bill labels mix ALL CAPS and proper case | 443.257-D | CODED |
| 194 | Settlements › Open Tours › PU / DEL dates | D075: Rendered dates use OCT-21 / OCT-23 rather than numeric month/day/four-digit year | 443.257-D | CLOSED tip `d7334765d4` — SettlementsToursRegister OriginDateCell formatDateUS; verify-resettlement-origin-load-dates D075 |
| 195 | Settlements › Escrow Accounts › Holder labels | D076: One visible holder link says Driver — Not Visible instead of a resolved full name | 443.257-D | CLOSED tip `d7334765d4` — escrow listEscrowAccounts join driver by id only (drop OCI equality); verify-escrow-posting-entitylink-reverse D076 |
| 196 | Settlements › Escrow Accounts › Updated dates | D077: Date portion uses unpadded month/day before time | 443.257-D | CLOSED tip `d7334765d4` — EscrowPage Updated formatDateTimeUS; verify-91070 D077 |
| 199 | Coverage | Codex audit coverage is partial depth — remaining tabs, drawers and record pages of every module still to audit | 443.281 | OPEN |
| 206 | Dispatch / Settlements | Expense load confirmations queue (Dispatch + Settlements Close), multi-select, bulk confirm | 443.288-C | CODED |
| 209 | Guards | 107 main static reds outside baseline split by seat | 443.290 | IN PROGRESS |
| 218 | Settlements | Statement must match the owner settlement document (5753 format): loads+stops+dates, fuel, expenses, per-load deductions, P&L | 443.293-A | CODED |
| 219 | Dispatch / Settlements | Settlement Close: what it does; should be a button in Dispatch | 443.293-B | CODED |
| 220 | Accounting | Inspect every Accounting tab; only Bills first tab is right | 443.293-C | OPEN |
| 222 | All modules | Popup standard app-wide + Fuel assignment popup redesign | 443.295 | OPEN |
| 265 | UI | ENG-30 15 raw <select> left (every selector multi-select law) | ENG | CLOSED tip `e90151155a` — verify-every-selector-multi-select PASS (10 <= baseline 10; 8 pinned exceptions) |
| 266 | UI | ENG-31 breadcrumbs on 10 of 999 pages | ENG | CLOSED tip `e90151155a` — verify-page-has-breadcrumb + structural crumb PASS (shell-mounted) |
| 267 | UI | ENG-32 89 money cells do not open their transaction (re-measure + shrink) | ENG | CLOSED tip `e90151155a` — verify-money-cells-click-through shrink-only 0 <= 0 |
| 268 | Banking | ENG-33 stale 'orphaned MatchDrawer' comment in BankingTransactionsDesignView.tsx:4017 | ENG | CLOSED tip `e90151155a` — verify-banking-designview-matchdrawer-canonical-comment PASS |
| 272 | UI | ENG-37 natural-sign rendering: measure money columns not using naturalBalance | ENG | CLOSED tip `e90151155a` — verify-no-surface-prints-a-raw-ledger-sign OK + verify-balances-render-in-natural-sign PASS (ratchet 0) |
| 302 | UI | ENG-56 Cursor 443.326: V3 board grammar on all 23 PARTIAL/SHELL-ONLY surfaces of Cursor's own audit; one ratchet guard to 0 | 443.326 | CLOSED tip `e90151155a` — verify-v3-board-grammar-every-surface 0/44 (= baseline 0) |
| 313 | Settlements | Design audit N2: Escrow register 'Opening balance (historical)' row (design) missing — running balance cannot tie | 443.326 #6 | CLOSED tip `e90151155a` — EscrowRegisterPage first row Opening balance (historical) = held − activityNet |
| 314 | Settlements | Design audit N3: settlement statement body has no drill links ('[n] fills →', 'BofA line →') | 443.326 #2 | CLOSED tip `e90151155a` — LinkedRecords `${n} fills →` + `Bank line →` (EntityLink bank_transaction) |
