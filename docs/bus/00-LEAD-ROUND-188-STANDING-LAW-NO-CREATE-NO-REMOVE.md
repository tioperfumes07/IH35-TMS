# ROUND 188 — STANDING LAW, EFFECTIVE IMMEDIATELY, ALL SEATS
2026-09-28, Laredo Central. Owner-ordered, verbatim:
*"NO CODER CAN CREATE ANYTHING ANYMORE WITHOUT CONFIRMATION AND NO CODER CAN REMOVE FUNCTIONS ETC."*

## THE TWO NEW LAWS
1. **NO CREATE WITHOUT CONFIRMATION.** No new table, column, service, route, engine, script, page or
   component without the owner's explicit yes first. Fixing, wiring and completing what already
   exists needs no permission — **creating something new does.** If you think you need a new thing,
   name it in one line and wait.
2. **NO REMOVING FUNCTIONS.** No deleting or disabling an existing function, route, component,
   column or guard. Not to make a gate pass, not to simplify, not because it looks unused. If
   something must go, name it and wait.

A guard is not removed to go green. A function is not deleted because a test fails. Fix it or
report it.

## MERGE QUEUE IS LIFTED
CC-1 #23017 fixed the repo-wide pre-push blockers; CC-3's register landed; `dep-dat8ngjl550s73a1to3g`
is **live**. Push normally. If the gate blocks you on guards unrelated to your diff, report it with
the guard names — do not bypass and do not delete the guard.

## DEPLOY IS VERIFIED HEALTHY
Render `srv-d7rpem7avr4c73fhp4n0`: last deploy **live 15:49:16 CT**, two more flowing. Every seat
confirms its own work reached production before claiming DONE. Owner's law: if he cannot open it in
Chrome and click it, it is not done.

## CLOSED — NEVER RE-OPEN, NEVER GUARD AGAINST
- USMCA settlements **5769–5819**: 51 of 51 tie to AlwaysTrack to the cent. 48 of 48 company
  settlements closed and linked, zero orphans.
- **5753 and 5760–5768 are Transportation/mixed.** USMCA's series begins at 5769.
- **Rafael is a local driver on weekly salary.** 13595 / S-5816 / 5816 at $0.00 with no lines is
  CORRECT. Any driver-pay or empty-settlement guard **must exclude salaried drivers**
  (`mdata.drivers.pay_basis`).
- The 450 `source='import'` fuel rows are settlement-PDF-derived allocations, not duplicates.
- All 16 current loads have invoices, mileage (practical + Google shortest + source) and driver bills.

## THE LIVE DEFECT EVERY SEAT SHOULD KNOW ABOUT
`accounting.journal_entry_postings`, account **Bank Service Charges & Wire Fees**: 71 debit lines,
**$174,666.12**, largest single line **$6,644.50**. A wire fee is $10.
`FAC-2026-00065` header says advance $10.00 and $5,325.00 posted to the wire-fee account — **the
wire-fee and advance legs are swapped** in the factoring posting engine. 48 void-reversals credit
$174,436.12 back, so it nets to ~$230 and **the trial balance still squares**. That is why nobody
caught it. Scope is the `FAC-2026-000xx` era; `00135–00142` post correctly. **CC-1 owns it.**

**A balanced trial balance proves nothing on its own.** $3,018,374.96 gross movement on $446,685.72
of real revenue is churn, not a business. Do not quote the trial balance as a health check.
