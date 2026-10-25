# Cursor — 46 pending rows (measured 10-25 1:40 PM CT: register minus everything merged to main since 10-24 5:15 PM)

Work top to bottom. When a row is merged, change nothing here — the Lead re-measures from main.

| # | Area | Item | Round |
|---|---|---|---|
| 31 | Cash Flow | Cash Flow › Home — board verdict PARTIAL | 443.280 |
| 32 | Cash Flow | Cash Flow › Projected (Auto) — board verdict PARTIAL | 443.280 |
| 33 | Cash Flow | Cash Flow › Actual vs Projected — board verdict PARTIAL | 443.280 |
| 34 | Cash Flow | Cash Flow › Rolling Ledger — board verdict LAYERED | 443.280 |
| 35 | Cash Flow | Cash Flow › Manual — board verdict LAYERED | 443.280 |
| 37 | Accounting | Accounting › Unexpected — board verdict REBUILT | 443.280 |
| 38 | Banking | Banking › Home — board verdict REBUILT | 443.280 |
| 39 | Factoring | Factoring › Home — board verdict LAYERED | 443.280 |
| 44 | Settlements | Settlements › Home — board verdict LAYERED | 443.280 |
| 45 | Settlements | Settlements › Open — board verdict PARTIAL | 443.280 |
| 46 | Settlements | Settlements › Closed — board verdict PARTIAL | 443.280 |
| 49 | Settlements | Settlements › Close — board verdict LAYERED | 443.280 |
| 50 | Settlements | Settlements › Company — board verdict REBUILT | 443.280 |
| 53 | Settlements | Settlements › Escrow — board verdict CHROME-ONLY | 443.280 |
| 54 | Settlements | Settlements › Escrow Register — board verdict PARTIAL | 443.280 |
| 55 | Fuel | Fuel › Home — board verdict CHROME-ONLY | 443.280 |
| 56 | Fuel | Fuel › 10 sub-tabs — board verdict CHROME-ONLY | 443.280 |
| 114 | Process | Cursor confirmation of 443.282 (owner-authorized build exactly as specified) | 443.282 |
| 118 | Guards | verify-board-page-no-legacy-sections (new) — stops layering | 443.278/280/281 |
| 121 | Home › Overview › Money tiles | D002: Currency values omit cents | 443.257-D |
| 126 | Settlements › Navigation › Profiles | D007: Link targets `/drivers/profiles` | 443.257-D |
| 127 | Settlements › Navigation › Pre-Settlements | D008: Link targets `/drivers/pre-settlements` | 443.257-D |
| 128 | Settlements › Navigation › Feed Gate | D009: Link targets `/feed-gate` | 443.257-D |
| 129 | Settlements › Navigation › Cash Advances | D010: Link targets `/cash-advances` | 443.257-D |
| 130 | Settlements › Navigation › Liabilities | D011: Link targets `/liabilities` | 443.257-D |
| 131 | Settlements › Navigation › Escrow | D012: Link targets `/accounting/escrow` | 443.257-D |
| 132 | Settlements › Navigation › Pay Rate Templates | D013: Link targets `/drivers/pay-rate-templates` | 443.257-D |
| 133 | Settlements › Navigation › Deductions | D014: Link targets `/drivers/deductions` | 443.257-D |
| 140 | Dispatch › Home › Round-trip exposure | D021: Driver names abbreviated to initials | 443.257-D |
| 161 | Cash Flow › Projected Auto › Seven-day outlook | D042: Currency abbreviated with k suffix and zero shown without cents | 443.257-D |
| 164 | Banking › Home › Drift alert as-of | D045: Raw ISO timestamp rendered, including T and Z | 443.257-D |
| 178 | Program › Scenario tracker › Certification timestamp | D059: Raw database timestamp with fractional seconds and +00 timezone | 443.257-D |
| 179 | System › Transaction Health › Generated/document dates | D060: Month-name timestamps instead of MM/DD/YYYY | 443.257-D |
| 180 | System › Transaction Health › Journal-entry and bill-payment labels | D061: Raw UUIDs are visible display labels | 443.257-D |
| 181 | System › Transaction Health › Wiring preview DR/CR | D062: Currency values lack dollar signs | 443.257-D |
| 183 | Accounting › Create Manual JE › Step 2 Lines | D064: Header summary renders `Date: 2026-10-22`, while Step 1 correctly shows `10/22/2026` | 443.257-D |
| 185 | Banking › Home / Record Transfer › Drawer footer | D066: Persistent alert stack renders above the open transfer drawer and obscures its bottom action area | 443.257-D |
| 186 | Accounting › Bills / Bill detail › Payments on this bill | D067: Two linked payments render as `Payment — not visible` rather than distinct display identifiers | 443.257-D |
| 191 | Banking › Relay card › Wallet balance tile | D072: Five-digit currency omits thousands separator | 443.257-D |
| 192 | Cash Flow › Projected Auto › Expected Expenses driver labels | D073: Driver Bill labels mix ALL CAPS and proper case | 443.257-D |
| 206 | Dispatch / Settlements | Expense load confirmations queue (Dispatch + Settlements Close), multi-select, bulk confirm | 443.288-C |
| 209 | Guards | 107 main static reds outside baseline split by seat | 443.290 |
| 218 | Settlements | Statement must match the owner settlement document (5753 format): loads+stops+dates, fuel, expenses, per-load deductions, P&L | 443.293-A |
| 219 | Dispatch / Settlements | Settlement Close: what it does; should be a button in Dispatch | 443.293-B |
| 222 | All modules | Popup standard app-wide + Fuel assignment popup redesign | 443.295 |
| 224 | Process | CODE-COMPLETE MODE: code every row, verify at the end | 443.297 |
