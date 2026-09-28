# Assertion 14 is NOT a scoping bug — real root cause is an unswept 1090 — CC-1 — 2026-09-27 10:52 PM CT (03:52Z 09-28).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-28-04.md` (WORM).

CC-1 | day-close assertion 14 | INVESTIGATED, ROUND 149's diagnosis does not hold — verified live,
reporting per "an order that fails a live check is a defect in the order."

**Bug found and fixed (real, small):** `scripts/reconcile-feed-day.mjs` line 589 compared
`jep.source_transaction_id` (text) to `i.id` (uuid) with no cast — crashed with `operator does not
exist: text = uuid` on every invocation, for any day. Added `::text`. Selftest still 17/17 PASS.

**Assertion 14 itself is already correctly day-scoped** (`WHERE je.entry_date = $2::date`, not the
whole ledger) — read the SQL, then proved it by running the now-unblocked script live for day 1
(8/10/26): assertion 14 reports **$5,325.00** same-day residue, not $150,283.02. That figure exactly
equals day 1's own net advance (FAC-2026-00001 $2,415.00 + FAC-2026-00002 $2,910.00) — not a
whole-period figure at all.

**The real root cause, traced to the actual JE rows:** both advances' funding legs debit 1090
Undeposited Funds and are still live, un-reversed, with **no offsetting credit ever posted** — the
money was never swept to the real bank account (1000). This is not a guard bug and not a day-1-
specific gap: it is a missing "deposit sweep" step between factoring funding and the bank, and it
will reproduce on every single purchase day, because none of them ever get swept. (Also explains
assertion #7 WIRE_LEGS failing the same way: $0.00 wire legs when $5,325.00 was expected.) This
likely also explains the Lead's $150,283.02 figure — probably a cumulative/different measurement of
the same unswept-1090 pattern across more days, not evidence of a scoping bug in this specific query.

**NOT scoping anything differently — there is nothing to scope, the query is already right.** Did
NOT touch 1090, did not invent a sweep JE. This needs an owner ruling: is the deposit sweep a real,
missing engine to build (larger task), or is "residue at day-close" actually expected/normal until a
periodic sweep runs (in which case assertion 14's day-close requirement itself may be the wrong bar)?

## Queue, moving to next now
A/P adoption (bills=0, bill_payments=0, gl_runs=0, payrun_gl_runs=47) — highest-value, gate on all
matching. Then: attach docrefs (P-0001→5817, P-0004→5818, P-0002→5819, driver_bills loaded/deadhead
correction needed first) · systemic alwaysRun-guard fix · 18 unmatched checks ($19,329.95) · 5814
variance · 3 short-pays · role bindings · G4/G3a · ROUND 202 STEP 3 · 13619 mismatch.

CC-1 | 03:52Z | Moving to A/P adoption now.
