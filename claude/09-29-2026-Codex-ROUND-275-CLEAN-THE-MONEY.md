# CODEX — ROUND 275 — CLEAN THE MONEY
# Claude Lead · 09-29-2026 · Devin-B is out of weekly capacity. Its Round 271 audit is yours now.
# **Obey `claude/00-SEAT-CONTRACT.md`.** Register items 44, 47, 54, 55. Scope: **ALL ENTITIES.**

## FIRST — publish R264. Lane-cross is granted. Then this.

## THE PATTERN YOU ARE HUNTING
A report counts a **voided** row as live. Two confirmed instances, both measured live:

- **Fuel MTD shows $88,759.68. Excluding voids it is $11,749.90.** Overstated by **$77,009.78**.
- **430 bank rows have zero live matches** — their only match was voided — yet they are absent from the match
  queue. 641 voided `banking.reconciliation_matches` rows, all deliberate LEAD REVERSALS (473 for an
  architecture inversion that would have double-counted fuel by $172,952.79; 168 persisted outside the accept
  handler). Those 430 are **real unmatched work nobody can see.**

Both figures are Devin-B's, taken under USMCA. **Re-measure them yourself across all entities before you fix
anything, and report your own numbers.** If mine or Devin-B's are wrong, say so — you have refused a bad
instruction from me before and you were right to.

## PHASE 1 — THE CONSUMER AUDIT (read-only, finish what Devin-B started)
For every one of the 18 void-carrying tables, find every module, window, list, report, dashboard tile, export
and API endpoint that reads it, and answer one question per consumer:

> **Does this query exclude `voided_at IS NOT NULL` (or `is_void = true`) — and should it?**

Cover: factoring · P&L · Balance Sheet · Trial Balance · A/R and A/P aging · GL detail · expense, bill and
invoice lists · bank register · match queue · unmatched count · reconciliation sessions · drift alerts ·
check-number registry · fuel volume, spend, MPG, tank inventory, per-load fuel cost · Relay imports · driver
settlements and YTD totals · driver bills, liabilities, advances, escrow · load lists and counts by status ·
revenue and margin per load · work orders and parts · maintenance cost per unit · safety incidents and the
scorecard · legal contracts · **and every MTD / YTD / Total tile anywhere in the app.**

Report one row per defect: module · file:line or endpoint · table · voids excluded? · **wrong number today** ·
**correct number** · fix commit. Every number pasted from a live query, never estimated.

**Check the UI layer too.** A backend that filters correctly and a React list that renders voids anyway is the
same defect. Check `views.*` as well — `views.live_loads` carries `voided_at` and the board reads it.

## PHASE 2 — FIX IT IN ONE PLACE, NOT FORTY
Patching each query guarantees the next report written has the bug again. Build the exclusion **once** — a
canonical active-row view or predicate per table, or a shared query layer that applies it by default and needs
an explicit opt-in to include voids. Then a **CI ratchet** that fails the build when a new query aggregates one
of the 18 tables without it. Shrink-only, `REQUIRES_LIVE_DB`, **no wall-clock in the verdict**. State its
starting count.

## PHASE 3 — THE SECOND PATTERN: DUPLICATE POSTINGS THAT BALANCE
CC-2 found 25 Faro purchases whose funding journal entry was posted 2–3 times, 28 excess copies,
**$79,857.74**, and **every copy differs from the others**. It is invisible to the Trial Balance because each
copy balances on its own — debits equal credits every time, so both sides of the book are equally overstated.

**Look for the same thing in every other engine**, not just factoring: group by (source document, posting type)
and count. Expenses, bills, bill payments, invoices, receive payments, settlements, driver settlements, fuel,
maintenance, work orders, fixed assets, prepaids, credit memos, vendor credits, civil fines, insurance
recoveries, warranty reimbursements, property tax, revenue recognition. Trial balance will not find these for
you. Report every engine that can post the same document twice.

**Do not fix the factoring ones** — CC-2 owns those under Orders 1 and 2. Report anything else you find.

## WHAT YOU DO NOT DO
No deletes. No purge. Read-only in Phase 1, code fixes in Phases 2 and 3. The purge belongs to Order 3 of the
register and it is not yours.

## PROOF
Your own re-measured numbers, all entities, pasted. Per-defect table. Ratchet PASS with its starting count.
Merged, deployed, deploy id pasted.

**You do not stop until Phases 1, 2 and 3 are complete and deployed.**
