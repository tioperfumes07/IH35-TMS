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

---

## CC-3 → CC-1 handoff: verify-alwaystrack-parity, 12 documents — file/line facts only, no verdict (2026-09-28)

Per Lead's ROUND 200 order (accounting is CC-1's surface, section 0b — not resolving this myself,
not pushing past it). Lead measured all 12 flagged settlements' live driver-settlement gross/
earnings just now and they don't match the guard's numbers at all — correct, because the guard's
LINE_HAUL dimension is not comparing driver settlements.

**Exactly what each side of LINE_HAUL reads:**

- **Actual/live** — `scripts/verify-alwaystrack-parity.mjs:211-219`: sums
  `accounting.invoices.total_cents` where `voided_at IS NULL`, joined `invoices.source_load_id =
  loads.id`, grouped by load_number. This is TMS **customer invoice revenue on the load** —
  nothing from `driver_finance.driver_settlements` at all.
- **Target/ground-truth** — `scripts/verify-alwaystrack-parity.mjs:104-111`: sums
  `customer_charges[].amount` from the AlwaysTrack **company** settlement document
  (`raw.company[].customer_charges`, filtered by `computeGroundTruthTargets`'s R-160 Transportation
  exclusion set at line 70-73), keyed by `settlement_no`. This is AlwaysTrack's own **company-side**
  customer-charge figure — also not the driver settlement PDF.

So both sides of LINE_HAUL are revenue-side (TMS invoices vs AlwaysTrack company customer_charges);
the driver-settlement gross/earnings the Lead just measured live is a different object entirely
(compared separately, correctly, via the guard's own `driver_net_cents` dimension at lines 154-159
— all 12 of these documents PASS that dimension; only LINE_HAUL and/or EXPENSES fail).

EXPENSES dimension, same actual/target split pattern: actual sums `accounting.expenses` per load
(non-voided); target sums `raw.company[].expenses[].amount` per document. Also company-side, not
driver-settlement-side.

**What I found before being told to stop and hand off (offered as evidence, not a verdict — CC-1's
call whether these are real, the ground-truth file is stale, or the comparison itself is wrong):**
independently re-queried `accounting.invoices` for the 4 LINE_HAUL-mismatched documents' loads
(13503/13504/13509/13533/13539) and found each carries an original invoice correctly voided
2026-09-25 **plus** a second, never-voided duplicate (`INV-2026-0000N`) at the identical amount —
`status=sent, voided_at=null`. If real, the fix is `voidInvoiceInBulk`
(`apps/backend/src/accounting/bulk-void.service.ts`) on the 5 duplicates only, never the originals.
Have not opened an authorization or touched anything — accounting is your surface, not mine.

For EXPENSES: pulled `accounting.expenses` for one document's loads (5781 → 13523/13534) and found
a set of "R145 SETTL 5781" bundled catch-all rows (no `source_fuel_transaction_id`, created 3 days
after the granular per-transaction rows) sitting alongside real per-transaction rows, never voided
— consistent with the same never-voided-superseded-row pattern, but I have not quantified exact
double-counted amounts and have not checked the other 8 EXPENSES documents at all.

— CC-3

---

## CC-3: RETRACTING the above handoff — settled, do not act (2026-09-28)

Owner already reconciled and closed this. ROUND 201 (Lead) was retracted in full: settlements
5769-5819 tie exactly and are CLOSED per `claude/00-CLOSED-USMCA-SETTLEMENTS-5769-TO-5819-TIE-EXACTLY-NEVER-ASK-AGAIN.md`
and `claude/00-USMCA-RECONCILIATION-CLOSED-NEVER-ASK-AGAIN.md`. All 12 documents I posted above
fall inside that closed range — the 5 duplicate invoices are the owner's own resolution of loads
shared between Transportation and USMCA settlements, not a live defect. **Do not void
INV-2026-00001 through 00005. Do not open an AUTH for it.** `verify-alwaystrack-parity` itself is
the thing to fix (scope/baseline it to exclude 5769-5819, citing the closed docs) — not the data.
I did not touch anything before this landed; nothing to undo on my end.

— CC-3
