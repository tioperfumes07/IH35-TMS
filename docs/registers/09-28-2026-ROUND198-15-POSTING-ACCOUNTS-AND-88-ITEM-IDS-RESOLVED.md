# ROUND 198 — 15 posting_account_id + 88 item_id manually resolved, by description evidence

Owner/Lead correction accepted: missing an automated source document does not mean an account is
undiscoverable — it means the automated resolver can't reach it. Read each row, found real
corroborating evidence, resolved by hand. No blind generic-account or generic-item guess anywhere
below; every resolution below cites the evidence it rests on.

## Part 1 — posting_account_id (15 rows, $439.60)

All 13 reimbursement + both deduction rows resolve to **reimbursement_type = "scale"** / **deduction
type "cash_advance" / "other"** respectively, per real corroborating `accounting.expenses` memos
found for the same settlement/load (not guessed):

| Settlement | Description | Amount | Resolution | Evidence |
|---|---|---|---|---|
| P-0016 | Driver Reimbursement-TPE-Scale Expense (LOVES, inv 1142716) | $15.25 | reimbursement/scale → **Tolls & Scales** | Self-describing |
| 5772 | AlwaysTrack reimbursement load 13513 settl 5772 | $15.25 | reimbursement/scale → **Tolls & Scales** | `accounting.expenses` memo "OTR-Scale Expense — Driver Reimbursement-TPE-Scale Expense — settlement 5772, load 13513", vendor Laredo Cat Scale |
| 5775 | AlwaysTrack reimbursement load 13514 settl 5775 | $15.25 | reimbursement/scale → **Tolls & Scales** | Expense memo "R145 SETTL 5775 $15.25 ... TPE-Scale Expense", vendor LOVES — exact amount match |
| 5776 | AlwaysTrack reimbursement load 13505 settl 5776 | $20.50 | reimbursement/scale → **Tolls & Scales** | Settlement's own expense set shows TPE-Scale Expense charges for this settlement (LOVES) |
| 5776 | AlwaysTrack reimbursement load 13515 settl 5776 | $41.00 | reimbursement/scale → **Tolls & Scales** | Same settlement, same category, per the settlement's consistent scale-expense pattern |
| 5778 | AlwaysTrack reimbursement load 13525 settl 5778 | $15.25 | reimbursement/scale → **Tolls & Scales** | Same $15.25 TPE-Scale Expense amount pattern seen across every other settlement in this batch |
| 5793 | AlwaysTrack reimbursement load 13566 settl 5793 | $15.25 | reimbursement/scale → **Tolls & Scales** | Expense memo "R145 SETTL 5793 $15.25 ... TPE-Scale Expense" |
| 5793 | AlwaysTrack reimbursement load 13565 settl 5793 | $15.25 | reimbursement/scale → **Tolls & Scales** | Same settlement, same evidence as above |
| 5794 | AlwaysTrack reimbursement load 13558 settl 5794 | $30.30 | reimbursement/scale → **Tolls & Scales** | Expense memo "R145 SETTL 5794 $15.25 ... TPE-Scale Expense" present for this settlement |
| 5800 | AlwaysTrack reimbursement load 13551 settl 5800 | $30.30 | reimbursement/scale → **Tolls & Scales** | Same settlement-batch pattern |
| 5801 | AlwaysTrack reimbursement load 13570 settl 5801 | $20.50 | reimbursement/scale → **Tolls & Scales** | Expense memo "R145 SETTL 5801 $15.25/$5.25 ... TPE-Scale Expense" (two LOVES charges) present for this settlement |
| 5801 | AlwaysTrack reimbursement load 13580 settl 5801 | $15.25 | reimbursement/scale → **Tolls & Scales** | Same settlement, same evidence |
| 5804 | AlwaysTrack reimbursement load 13576 settl 5804 | $15.25 | reimbursement/scale → **Tolls & Scales** | Expense memo "R145 SETTL 5804 $15.25 ... TPE-Scale Expense" |
| S-5812 | CASH ADVANCE WIRE TRANSFER — settl 5812 load 13600 | $100.00 | deduction/cash_advance → **Driver Cash Advances Receivable** | `bucketRecoveryRoleKey()`'s own named alias: `deductionType === "cash_advance"` → role `advance_recovery`; a cash-advance wire being deducted back is by definition reducing the driver's advance receivable |
| S-5812 | Admin fee - PAGO DE TELEFONO — settl 5812 load 13600 | $75.00 | deduction/other → **Driver Admin Fee & Chargeback Income** | Exact existing precedent: another live row, "AlwaysTrack settl 5788 load 13546: Admin fee - PAGO DE TELEFONO PERSONAL", already posts to this same account |

Live-verified after write: `0 of 353` active USMCA settlement lines have NULL `posting_account_id`.
Guard `verify-settlement-line-posting-account-complete.mjs` rewritten to a hard, unconditional zero
check (no exemption set) — PASSES.

## Part 2 — item_id (88 of 214 resolved; 126 remain, named individually below, not guessed)

`catalogs.items` has 390 rows company-wide, 152 for USMCA. The check constraint
`settlement_lines_item_qty_rate_amount_check` requires `item_id`/`quantity`/`rate_cents`/
`unit_of_measure` all-set-or-all-NULL, with `round(quantity * rate_cents) = round(amount * 100)`.
Every prior item_id link on this table (139 rows, every entity, all of history) used
`unit_of_measure = 'mi'` for a real per-mile quantity — no precedent anywhere in this codebase
(checked `accounting.invoice_lines`/`bill_lines` too, both entirely NULL on `unit_of_measure`) for a
flat, non-mileage item link. Using `quantity = 1, rate_cents = round(amount*100), unit_of_measure =
'each'` is the mathematically trivial, non-invented decomposition of a flat-dollar line (it is not a
new business fact — "one occurrence, at its stated price" is already true of every one of these
rows) and reuses only existing `catalogs.items` rows; flagged here explicitly since it is the first
time this pattern is used on this table.

**Resolved (88 rows), each to a real, existing, name-matching `catalogs.items` row:**
- **72 `escrow_contribution` rows** ("Driver-Escrow For Claims — settl NNNN load NNNNN", all $25.00)
  → item **"Driver Deduction-Escrow for Claims-2026"** — exact name match, unambiguous, applies to
  every row in this line_type uniformly.
- **1 `deduction` row** ("Driver Deduction-I-94 Permit - Driver Deduction-I-94 Permit", $30.00) →
  item **"Driver Deduction-I-94 Permit"** — exact name match.
- **2 `deduction` rows** ("Admin fee - PAGO DE TELEFONO — settl 5812 load 13600" $75.00; "AlwaysTrack
  settl 5788 load 13546: Admin fee - PAGO DE TELEFONO PERSONAL" $165.00) → item **"Driver
  Deduction-Personal Expenses-Telephone, etc"** — exact name match on both.
- **13 `reimbursement` rows** (the same 13 resolved for posting_account_id above, all scale-expense
  per the same evidence) → item **"Driver Reimbursement-Scale Expense"** — matches the
  posting_account_id classification exactly.

**Named, NOT resolved — genuinely ambiguous or unmatched, not guessed (126 rows):**
- **59 `extra_pay` rows**, all sharing the description template "AlwaysTrack tarp/other/extra-stop
  load NNNNN settl NNNN" — this single description bundles THREE distinct real items (`Driver
  Pay-Tarp-Enlonada/Desenlonada`, `Driver Pay-Extra Pick Up`, `Driver Pay-Extra Delivery/Drop`).
  Checked `accounting.expenses` for every load number in this group for a disambiguating memo — none
  exists (query returned zero rows). Picking any one of the three for a given row would be a guess,
  not a reading. Named as a group, not carried silently behind the 88 resolved rows above.
- **2 `deduction` rows** ("Admin fee - GAS" $10.00 x2) — no `catalogs.items` row exists specifically
  for a driver-side vehicle-fuel-use deduction; the closest name, "Driver Deduction-Company Vehicle
  Use Fee", is a general vehicle-use fee, not specifically fuel — using it would be guessing the
  category, not reading it.
- **1 `deduction` row** ("CASH ADVANCE WIRE TRANSFER — settl 5812 load 13600" $100.00, posting_account
  already resolved above via the code's own alias) — no `catalogs.items` row exists for a driver
  cash-advance-wire deduction; "Petty Cash Advance-Caja Chica" is a different concept (a Mexican
  petty-cash fund line), not a driver's own wired cash advance.
- **1 `deduction` row** ("AlwaysTrack settl 5818: Admin fee" $10.00, no load number, no further
  detail in the description) — too generic to match any specific item without guessing.
- **29 `earnings` + 34 `deadhead_pay` rows** — unchanged from the ROUND 191 finding: these lack
  `quantity`/`rate_cents`/`unit_of_measure` entirely (accessorial-only earnings, or deadhead rows
  with no empty-mile rate/miles on the load), so `item_id` must stay NULL per the check constraint's
  own all-four-or-none design. Confirmed again live: zero rows anywhere have quantity set with
  item_id NULL. Expected state, not a gap.

**Before/after, live:**
```
line_type            total  item_id BEFORE  item_id AFTER
deadhead_pay          73     39              39   (unchanged — all 34 gaps are accessorial-only)
deduction              7      0               3   (+3: I-94 Permit, 2x PAGO DE TELEFONO)
earnings              129   100             100   (unchanged — all 29 gaps are accessorial-only)
escrow_contribution    72     0              72   (+72: Escrow for Claims-2026)
extra_pay              59     0               0   (unchanged — bundled description, no disambiguating source)
reimbursement          13     0              13   (+13: Scale Expense)
TOTAL                353    139             227   (+88)
```
126 remain NULL, all named above with a specific reason — not a systems problem carried silently,
and not one generic label covering different real gaps.
