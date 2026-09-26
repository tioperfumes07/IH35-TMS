# R-187 G6 DONE, R-185 BLOCKED (real DB conflict, flagged) — CC-1 — 2026-09-25 7:39 PM CT (00:39Z 09-26).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-31.md` (WORM).

CC-1 | R-187 G6 | DONE | no AUTH needed (read-only measurement) | 13/13 documents (5804-5816) measured
against their own Driver_Settlement PDF's TOTAL DUE | 0 differences found.

```
5804 net_pay=1601.08 PDF=1,601.08 ✓    5811 net_pay=1964.35 PDF=1,964.35 ✓
5805 net_pay=2002.65 PDF=2,002.65 ✓    5812 net_pay=-50.00  PDF=-50.00  ✓ (status=approved, others closed)
5806 net_pay=2008.15 PDF=2,008.15 ✓    5813 net_pay=1986.05 PDF=1,986.05 ✓
5807 net_pay=1702.05 PDF=1,702.05 ✓    5814 net_pay=1992.65 PDF=1,992.65 ✓
5808 net_pay=2001.25 PDF=2,001.25 ✓    5815 net_pay=1206.10 PDF=1,206.10 ✓
5809 net_pay=2075.97 PDF=2,075.97 ✓    5816 net_pay=0.00    PDF=0.00    ✓
5810 net_pay=1700.77 PDF=1,700.77 ✓
```
All 13 match to the cent, none voided. Extends `verify-settlement-net-equals-document`'s own
35-document coverage to the full 48 the round asked for (this session's own slice; the other 35 are
already covered by that gate).

## R-185 step 1: BLOCKED on a real, pre-existing DB conflict — flagged to Lead, not guessed at
Creating the 2175 account's per-driver children (AUTH-044) hit a live constraint failure:
`accounts_active_requires_account_number` (migration 202612700000, 2026-08-16, ROW-259 fix — "an
account may have NULL account_number only while deactivated") directly conflicts with ROUND 181's
own code (`driver-subaccount-provision.service.ts`, "owner law: no auto numbers without written
owner approval" — inserts NULL for every new driver leaf). This has been silently broken since
ROUND 181 landed: no NEW driver escrow/advance/reimbursement leaf can be created at all right now,
not just mine — confirmed live, rolled back cleanly, nothing committed (AUTH-044's parent row did
not persist either, one transaction).

Not inventing a numbering scheme myself given ROUND 181's own "written owner approval" language.
Messaged Lead directly with the full finding. Holding this one piece; the rest of R-185/R-187
continues.

## Continuing — G3b-e, R-159 escrow remainder, R-185 steps 2-6 (pending the numbering decision)
Next: G3d (load 90007 provenance measurement, read-only) and G3b (4 invoice discrepancies vs rate
confirmations) — both don't depend on the 2175 account.

CC-1 | 7:39 PM CT (00:39Z) | G6 clean. R-185 step 1 correctly held on a real cross-cutting DB
conflict rather than guessed past. Continuing with unblocked items now.
