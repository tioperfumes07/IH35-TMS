# ROUND 198 — all 15 resolved, item_id 88/214 resolved with the rest named — CC-1 — 2026-09-28 19:00Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-r198.md`. PR #23051 merged.

## (b) — CLOSED. 0 of 353, live.
Read all 15, found real evidence for every one, resolved by hand — no blind generic-account guess:
- 13 reimbursement rows → `scale` type → **Tolls & Scales**. Evidence: matching
  `accounting.expenses` memos for the same settlement/load/amount (e.g. "R145 SETTL 5775 $15.25 ...
  TPE-Scale Expense", vendor LOVES).
- "CASH ADVANCE WIRE TRANSFER" ($100.00) → `cash_advance` type → **Driver Cash Advances
  Receivable**. Evidence: the resolver code's own named alias, `deductionType === "cash_advance"` →
  role `advance_recovery`.
- "Admin fee - PAGO DE TELEFONO" ($75.00) → `other` type → **Driver Admin Fee & Chargeback
  Income**. Evidence: an exact existing precedent row with identical wording ("AlwaysTrack settl
  5788 load 13546: Admin fee - PAGO DE TELEFONO PERSONAL") already posted to this account.

Guard rewritten to a hard, unconditional zero-tolerance check — no exemption set, no named-gap list.
Live: `PASS — every CLOSED settlement's active line has posting_account_id. Zero exceptions.`

Full per-row table: `docs/registers/09-28-2026-ROUND198-15-POSTING-ACCOUNTS-AND-88-ITEM-IDS-RESOLVED.md`.

## (c) — item_id, before/after, re-measured against the 353 denominator.
```
line_type            total  item_id BEFORE  item_id AFTER
deadhead_pay          73     39              39
deduction              7      0               3
earnings              129   100             100
escrow_contribution    72     0              72
extra_pay              59     0               0
reimbursement          13     0              13
TOTAL                353    139             227   (+88)
```
**88 of 214 resolved**, each to a real, existing, name-matching `catalogs.items` row:
- 72 `escrow_contribution` → "Driver Deduction-Escrow for Claims-2026" (exact name match, uniform).
- 3 `deduction` → "Driver Deduction-I-94 Permit" (1) / "Driver Deduction-Personal Expenses-Telephone,
  etc" (2, matching the same PAGO DE TELEFONO wording resolved in (b)).
- 13 `reimbursement` → "Driver Reimbursement-Scale Expense" (matching the scale classification from (b)).

Used `quantity=1, rate_cents=round(amount*100), unit_of_measure='each'` — flagged explicitly as the
**first use of this pattern on this table**: every prior item link (139 rows, all of history, all
entities) used `'mi'` for a real per-mile quantity; `accounting.invoice_lines`/`bill_lines` don't use
`unit_of_measure` at all. This is the mathematically trivial, non-invented decomposition of a
flat-dollar line (not a new business fact) and reuses only existing items — surfaced here rather than
silently introduced.

**126 remain, named individually, not guessed:**
- 59 `extra_pay` share one bundled description ("AlwaysTrack tarp/other/extra-stop...") covering 3
  distinct real items (Tarp-Enlonada/Desenlonada, Extra Pick Up, Extra Delivery/Drop) — checked
  `accounting.expenses` for every load in the group for a disambiguating memo; none exists.
- 4 `deduction` rows ("Admin fee - GAS" x2, "CASH ADVANCE WIRE TRANSFER" x1, one generic
  load-less "Admin fee") — no matching `catalogs.items` concept exists for any of them.
- 29 `earnings` + 34 `deadhead_pay` — accessorial-only, unchanged from ROUND 191: zero rows anywhere
  have quantity set with item_id NULL, so this stays expected state per the check constraint's
  all-four-or-none design.

## (d) — denominator noted, already re-measured against 353 throughout this report.

## What's next
(a) closed by the Lead. (b) closed. (c) is a real, partial, honestly-reported result — 88 resolved,
126 named with specific reasons, not a number to round either up or down. Standing by.
