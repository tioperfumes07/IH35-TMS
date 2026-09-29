# CURSOR — ROUND 274 — THE VOID ENGINE, BUILT COMPLETELY
# Claude Lead · 09-29-2026 · Devin-A and Devin-B are out of weekly capacity. This work is yours now.
# **Obey `claude/00-SEAT-CONTRACT.md`.** Register items 5, 49, 50, 53. Scope: **ALL ENTITIES.**

## FIRST — finish ROUND 273 items 61 and 62. They unblock CC-2 and CC-3. Then this.

## THE DEFECT, MEASURED
`executeVoidCancel` has **no case for most voidable entities**. Voids are being done by raw UPDATE that stamps
`voided_at` and nothing else. Proven live: advances on invoices **13619** and **13615** carry `voided_at` from
2026-09-28 with reason "ROUND-175 reversal" while `status` still reads **`advanced`**. Those two rows alone cause
the MTD overstatement (106 counted vs 93 real) and the 95-vs-93 advanced-flag mismatch. One root cause, two
symptoms, and nothing in the app noticed.

**124 tables carry void or sample columns. 18 hold live voided rows** (USMCA figures — re-measure across all
entities and report the real numbers before you build):
`accounting.expenses` 946 · `banking.reconciliation_matches` 641 · `banking.bank_transactions` 563 ·
`fuel.fuel_transactions` 276 · `integrations.relay_fuel_transaction_lines` 100 ·
`integrations.relay_fuel_transactions` 76 · `accounting.factoring_advances` 51 · `accounting.bill_lines` 31 ·
`accounting.invoices` 25 · `driver_finance.settlement_lines` 5 · `banking.check_number_registry` 5 ·
`driver_finance.driver_settlements` 3 · `accounting.bills` 3 · `driver_finance.driver_liabilities` 2 ·
`driver_finance.driver_bills` 2 · `safety.incidents` 1 · `maintenance.work_orders` 1 ·
`legal.contract_instances` 1

## WHAT YOU BUILD — all of it, no partial delivery

1. **A registered case in `executeVoidCancel` for every voidable entity.** No entity may be voided by any path
   that bypasses the engine.
2. **Atomic void.** The flag, the status and the reversing journal entry are written in **one transaction**, or
   none of them are. The mechanics do not change — NetSuite model, original untouched at full amount, reversal
   dated the void date, linked both ways (Seat Contract §4).
3. **DB-level constraint per table:** `CHECK (voided_at IS NULL OR status = <that table's void status>)`. A row
   cannot carry a void timestamp and a live status again.
4. **Repair the existing drift.** Every row where `voided_at` and `status` disagree, in either direction, across
   all entities. Report the count found and the count fixed. CC-1 owns the two factoring rows (AUTH-132) —
   coordinate, do not duplicate.
5. **Reinstatement path** must be symmetric: `reinstated_at`, reason, and the reinstating JE, same atomicity.
6. **Fix the Plaid merge (item 53).** A pending→posted merge does not carry reconciliation matches across to the
   surviving row. Proven: bank row `f5bbddce-7690-4594-803e-a90fff840dff` was superseded but still holds live
   match `2d1f3f73-52c7-4249-944a-3e9ceec1ee8c`. Re-point that match to the survivor, then fix the merge path so
   it never happens again.
7. **Guard, shrink-only, `REQUIRES_LIVE_DB`, no wall-clock in the verdict:** fails on any voided row whose status
   disagrees, any voidable entity with no engine case, and any void written outside the engine. State its
   starting count.
8. **Linkage declared both ways** for every void and every reversal: the document, its reversal, the bank
   transaction, the load, the driver, the unit, the customer, the vendor, the journal entry.

## PROOF
Pasted live counts before and after, all entities. Trial Balance identical to the cent — a void repair must not
move the GL. Guard PASS output. Merged, deployed, deploy id pasted.

**You do not stop until it is built, wired, linked, merged and deployed.**
