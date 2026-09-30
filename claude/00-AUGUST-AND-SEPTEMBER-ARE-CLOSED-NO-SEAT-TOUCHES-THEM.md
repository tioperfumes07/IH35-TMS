# AUGUST AND SEPTEMBER 2026 ARE CLOSED. NO SEAT TOUCHES THEM. NOBODY ASKS AGAIN.

**Owner ruling, 2026-09-30.** USMCA only — `5c854333-6ea5-4faa-af31-67cb272fef80`.

## WHAT "CLOSED" MEANS HERE

It does **not** mean `lockMonthClose()` returned true. It means:

> **No agent writes to, investigates, re-derives, re-measures, re-reconciles or asks the owner a
> question about an August or September 2026 transaction. The books are closed to US.**

The owner has reconciled these periods with us repeatedly. Every time a seat "discovers" one of
these populations again, it costs him another round of the same conversation. That is the defect
this document exists to stop, and the Lead was the worst offender.

## THIS IS SETTLED. DO NOT RE-OPEN ANY OF IT.

| Item | Ruling |
|---|---|
| **1090 Undeposited Funds** | ANSWERED in R-153. The balance is `factoring_advance` DR lines awaiting a Faro **wire match**. `fuel_event` nets **exactly $0.00** on 1090 — do not "fix" fuel on 1090. |
| **Voided transactions** | GO-26, owner's words: **"VOID FIRST, THEN DELETE. Both. In that order."** The void writes the register; the delete is the order. Settled. |
| **Banking** | `banking.bank_transactions` is the bank's own register. NEVER created, deleted or modified. Links cleared, reset to pending. It SURVIVES. |
| **Settlements 5769–5819** | 51 of 51 against AlwaysTrack, variance 0. Never re-open. |
| **G2** — 17 null-`item_id` settlement lines | CLOSED. Adjusting JE, 32 lines, $1,723.88, 16 of 17 reclassified, $22.14 held, mapping table, `NOT VALID` constraint. |
| **G5** | CLOSED. Driver 51, company 51. AUTH-167. |
| **$17,057.44 double-booked factoring** | REVERSED. 1090 $17,867.98 → $16,162.34. |
| **$18,110 TRANSPORTATION void-4** | DONE and stable. |
| **A-11** | DELIVERED. The endpoint is correct; the bug is the Transaction List stacking an unfiltered mini-table above the filtered one. Cursor's now. |
| **A-16** | DELIVERED. One predicate. 76/1,249 customers, 34/623 vendors. A voided-only customer COUNTS. |
| **Fuel posting** | CONFIRMED CORRECT on the R-30.1 architecture: Dreamline → 2510, Relay → 1295, fuel → 5000/5010. 5000 DR $172,117.98 · 5010 DR $7,228.76 · 2510 CR $141,197.23 · 1295 CR $32,324.02. 453 transactions, $217,603.12, zero without load_id, zero without vendor_id. |
| **Driver bills** | CLEAN. 136 live, zero without a load, zero without a driver. Leave them alone. |
| **The ledger** | BALANCES. 2026-08 DR = CR = $1,144,261.64. 2026-09 DR = CR = $2,253,782.60. Imbalance $0.00 both months. |

## THE ONLY TWO THINGS STILL OWED ON THESE PERIODS

Both were ordered, both are execution, and **neither is a question for the owner**:

1. **CC-2 — unwind 13625 / 13626.** Void both factoring advances (FAC-2026-00139 / 00140,
   `source_system='tms'`, no Faro record), void both invoices ($9,650.00), remove the fabricated
   delivery stamps, loads stay `dispatched`. Then find what WROTE them.
2. **The void purge**, per GO-26: void first, then delete. USMCA only. Banking survives.
   TRANSPORTATION and TRUCKING frozen — not read, not touched.

## WHAT IS NOT CLOSED, AND IS WHERE EVERY SEAT GOES NOW

**Document integrity** — measured live 2026-09-30, and this is real work nobody has done:

```
expense_lines   1,652 total · 17 NO EXPENSE ACCOUNT · 639 NO item_id
expenses        1,640 total · 549 live · 2 no payment account · 10 no vendor · 3 no load
invoices          155 total · 126 live · 2 no source load
```

639 of 1,652 expense lines — 39% — do not say what they were. Same class as the G2 defect: the
money is right, the line is silent. Plus the engine fix that stops the population regrowing.

**Everything else on the register.** D01..D54, R-01..R-05, and the 80 numbered seat jobs.

## THE RULE THIS DOCUMENT EXISTS TO ENFORCE

A seat that finds an August or September population **files it here and keeps building.** It does
not investigate it, does not re-measure it, does not route it, and does not ask the owner about it.

If the answer is in this file, **the answer is the line in this file** — not a new investigation.

## CLOSE-ENGINE DEFECT FOUND WHILE RULING THIS (CC-1, not fixed, filed)

`fuelTaxComplete = !iftaDueThisMonth || iftaFiled`. `iftaDueThisMonth` fires in the quarter-end
month, but that quarter's return cannot be FILED until the quarter has ENDED — so March, June,
September and December can never lock on time, in any year. A logic error, not a data gap: the gate
should test whether a return that is **due and fileable** is unfiled. Filed as
`CLOSE-ENGINE-QUARTER-END-IS-STRUCTURALLY-UNLOCKABLE`. Do not change it unilaterally.

## $2,837.33 IN 9000 "ASK MY ACCOUNTANT" — ROOT-CAUSED, NOT FIXED, FILED (CC-1, 2026-09-30)

Not 176 uncategorized transactions. Confirmed on 100% of the population, not a sample: 56 of the
176 postings share one systemic shape — a "DEFECT 3" remediation JE reversed a journal entry that
was ITSELF already a correct void-reversal of a real voided expense (e.g. `2c78c7c2` = "Reversal of
[voided Expense EXP-2026-00047 posting]"), incorrectly un-doing that reversal and restoring the
voided expense's original posting to live status. The other 120 postings to 9000 (112
expense-sourced + 4 already-reclassified) net to $0.00 and are fine. Mechanical fix would be
reversing those same 56 JEs a third time — NOT executed, filed here per this document's own rule.
