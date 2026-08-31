# HONEST LIST — WHAT IS DONE, AND WHAT IS STILL ONLY A SPEC
Written by Claude against live state. If it is not listed as done, do not assume it exists.

## DONE AND VERIFIED LIVE
- CoA: 4900–4960 short-pay block · **1240 / 4955 / 4970 / 4980** · duplicate 1200 deactivated ·
  factoring accounts stamped with `system_purpose` (confirmed in Neon).
- Factoring pledge nets applied credit memos (#18393). Login RLS (#18398).
- Faro ↔ QBO ↔ AlwaysTrack crosswalk — 33 matched, 21 proven by QBO naming the load number.
- $24,800 of QuickBooks double billing identified (yours/Martin to fix IN QBO — no write-back).
- Planner UI fixes across all 5 affected planners + tab badges — `tsc` clean.

## DONE THIS PASS — previously only identified, now actually fixed
- **`safety` flipped to `complete: false`** with the correction recorded. Honest score 34 of 38.
- **`SAF-B08` `prod_verified` cleared** — it was `HOLD` and `prod_verified: true` at once.
- **`users` false-RED documented** in the file: 6 of 6 PASS and prod_verified with no reason
  given. **Not flipped by me** — only the module owner may set `complete`. Owner/Cursor decides.
- **`scripts/tieout/faro-factoring-statement.mjs` fully implemented** as the BAR-2 reference.
  Reads the GL by `system_purpose` (not account number, not typed columns), records the
  observed value pass or fail, treats empty as FAIL, and refuses to let anyone move EXPECTED.
  **The other five tie-outs copy this shape.** Run it and it will FAIL today — correctly,
  because there are zero live factoring advances.

## STILL ONLY A SPEC — NOT BUILT. Do not report these as working.
- `catalogs.deduction_reason_codes` (+ `responsible_source`) and `accounting.invoice_deductions`
- Auto-derived `responsible_user_id` — the accountability half of the dilution work
- Dilution Accountability Report
- Reserve-statement import that auto-raises unexplained deductions
- The dilution close-out poster path (`factoring_dilution` source type)
- Transaction-fee capture — the table is written in `specs/`, nothing writes to it
- Guards: `no-orphan-partial-invoice` · `one-load-one-open-invoice` ·
  `no-uncoded-reserve-deduction` · `deduction-ties-to-reserve` · `no-silent-writeoff` ·
  `deduction-has-owner` · `no-purchased-account-past-repurchase-deadline` ·
  `default-interest-accrues-from-day-35` · `repurchase-price-ties-to-faro-statement` ·
  `partial-payment-leaves-account-open` · `no-accrued-reserve-release`
- **Five of six tie-outs are still stubs.** Only Faro is implemented.

## CORRECTIONS I MADE TO MY OWN WORK — on the record
- My first dilution journal entry was **wrong**. The executed Faro agreement (in
  `CPA ANSWERS.docx`) says a short payment is a **credit, not a settlement** — the Purchased
  Account stays open and default interest runs from day 35. My draft retired the liability and
  skipped the interest: an understatement. Corrected in the spec.
- My migration numbers were **below the ledger tail** and would never have run. Cursor caught
  the first; I fixed the other two and claimed the numbers.
- I wrote "HOLD 016", the owner overruled it, and **I did not correct the file the seats read** —
  which is why 016 stalled. Fixed at the source.
- REV C amount+customer matching — withdrawn; Cursor's objection was right.
