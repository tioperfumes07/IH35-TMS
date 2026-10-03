# CURSOR — ROUND 330.2 · THE 98 RULED, AND MY POPULATION WAS SHORT
Laredo 2026-10-02 15:25 CT (20:25 UTC)

## THE 98 — ANSWERED, AND HERE IS THE RULING

You measured: matched=98 · with_je=0 · no_je=98 · abs $68,208.84 · Aug 8–Sep 11 ·
pointers 69 fuel / 21 settlement / 8 expense · half-write stamps, not a tip-engine failure.
That is exactly the question I asked you to answer before anyone decided anything. Accepted.

**RULING: unmatch all 98 back to For Review. Do not back-fill journal entries.**

Why unmatch. A match stamp asserts that a bank line has been reconciled to a booked transaction.
These 98 assert it and there is no transaction. In QuickBooks terms they are lines sitting in
Categorized with nothing behind them: the register reports a cleared balance that includes
$68,208.84 the general ledger has never heard of, so the bank reconciliation ties to a number
that does not exist in the books. That is the single worst state a bank feed can be in, because
it looks reconciled. Returning them to For Review restores the honest state — unreconciled,
visible, and postable through the live engine, which you confirmed works.

Why NOT back-fill. The pointers give the TYPE (fuel, settlement, expense) and nothing else. They
do not carry the GL account, the vendor, the class, or the load. Writing 98 journal entries from a
type pointer is guessing with the owner's general ledger, and the tip engine already derives all
of that correctly from the source document. Let the engine do it.

**This is a data remediation on 98 real USMCA records, so it is the owner's to run, not yours and
not mine.** Build it and stop: a reversible script that clears only the match stamps on exactly
those 98 ids, a dry run printing the 98 ids with before/after state, and the rollback that
restores the stamps. Paste the dry run. Do not execute. It needs an owner AUTH and he issues it.

## MY POPULATION WAS SHORT. YOU WERE RIGHT.

642, not 632. Your criteria are correct and are now the standard: basename
`.(service|cron|worker|job|engine).ts` under `apps/backend/src`, `.js` stripped on imports. The 11
tip-only files and the stale telematics/arrival-detection.service.ts account for the difference.

I am correcting the workbook to 642 / 348 writers rather than defending 632. Every count I
published off the short population was short, and that is the second measurement error I have had
to correct today — the first was counting a comment as a money write. The lesson I am applying,
not just noting: I stop publishing a population from a one-off scan and publish it from a
committed script that anyone can re-run.

## E-40 THROUGH E-44 — MY ERROR, ON THE RECORD

All five BUILT on the frontend. My "NO FILE FOUND" came from a backend-only scan. Recorded as my
error in the workbook and in the engine-verification doc, not as a seat's missing work.

## CHECK-7 — ACCEPTED, AND THE 8 OPEN ARE YOURS NEXT
348 writers mapped, 164 CODE PRESENT / 176 VERIFIED-NONE / 8 OPEN. "JE-only reverse never counts"
is the correct rule and it is now standing: reversing the journal entry is not reversing the
document. The 8 OPEN (lease×4, payment-apply, reclassify, relay stage1 transfer, loan amort) are
the real remaining reversibility debt. Name the engine that reverses the DOCUMENT for each, or say
plainly that none exists and build it.

## NEW, AND IT APPLIES TO YOUR LANE TOO

Measured live today: Render srv-d7rpem7avr4c73fhp4n0 runs **numInstances = 2**, and 62 of 78
scheduled engines register node-cron **in process**, so both instances fire every tick.
wrapBackgroundJobTick took no lock, and 8 engines never routed through it. That is the root cause
of the whole double-tick class you flagged — your F-RETRY findings were right about the risk and
right about the fix, and the cause sits one level below them.

The lease and its guard are built and proven (docs/engine-verification/
2026-10-02-SINGLE-FIRE-ROOT-CAUSE.md). Your lane's scheduled engines need the same sweep CC-3 did
for its 23: every write guarded by the database, not by an app-side "already done?" check, and a
header on each. Do not take another lane's engines.

## ORDER
1. The 98 unmatch script, dry run only, pasted.
2. The 8 check-7 OPEN.
3. Your lane's scheduled-engine sweep.
4. E-32 fork harness → E-30 → E-31.

No prod money writes. Owner runs every import and every remediation.
