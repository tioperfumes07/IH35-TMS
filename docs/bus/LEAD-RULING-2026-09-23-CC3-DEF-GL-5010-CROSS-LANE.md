# Lead ruling — CC-3 lane cross, DEF DEADLOCK BROKEN / GL 5010

> **★ SUPERSEDED — ROUND 86, 2026-09-23.** The Lead's own later ruling
> (`~/Downloads/09-23-2026-LEAD-RULING-ROUND-86-GL-5010-KILLED-AND-CC1-UNFROZEN.md`), verbatim:
> "GL 5010 DEF IS RETIRED. MY EARLIER RULING IS DEAD... I read the live QuickBooks company file
> for USMCA Freight Solutions, Inc. on 09-22-2026. 154 product/service items, 126 active, 20
> categories. The fuel block is three ITEMS under one category... there is NO DEF account and NO
> reefer account in the company file. We are a QuickBooks clone. We mirror it." GL 5010 (created
> below) is now deactivated (void-not-delete, history kept) and
> `accounting.expense_category_account_map`'s def row is repointed back to 5000, live-verified —
> `scripts/ops/gl-fix-06-retire-5010-repoint-def-to-5000.ts`. The 335/$10,970.23 postings reposted
> under this ruling to 5010 were NOT reversed a second time (Round 85/86: transaction rows purge,
> do not repost them again for proof). Everything below this line is HISTORY, kept per
> never-delete, and describes a since-withdrawn account creation, not current law.

**Date:** 2026-09-23
**Seat:** CC-3
**Files crossed:** `scripts/verify-fuel-transactions-per-load.mjs`,
`scripts/verify-fuel-transactions-per-load.baseline.json` (owned by CC-1 per `docs/bus/LANES.md`,
since CC-1 authored the DEF GL segregation shrink-only ratchet in that file)

This ruling documents the Lead's own direct, same-session assignment, verbatim from the session
transcript ("LEAD RULING → CC-3 · 2026-09-23 · CREATE GL 5010. This is the root of the three-way
deadlock."):

> "3. Repost the 335 contaminated postings through the reused reflushUnpostedFuelGlExpenses /
> flushFuelGlPostsAfterCommit path ... 4. Drive CC-1's ratchet to zero. It is seeded at 335 /
> $10,970.23 and its fourth arm FAILS when the count reaches zero with the baseline still present
> -- that is your signal to remove the entry, not a bug."

Driving the ratchet to zero surfaced a real, separate bug IN the ratchet's own query (no
`reversed_by_je_id IS NULL` liveness filter, so a voided-and-correctly-reposted DEF debit line
would have shown as live contamination forever under the void-not-delete/reversing-entry model --
the exact same landmine already fixed in `verify-no-fuel-event-credits-ap-control.mjs`). Fixing
that landmine and removing the now-satisfied `def_gl_segregation` baseline entry is the only way to
actually complete the explicit instruction above; there is no way to "drive the ratchet to zero"
without editing the file that contains it. This file satisfies `verify-lane-ownership.mjs`'s
`LANE_CROSS` requirement.
