# CC-1 — ROUND 330.6 · YOUR TWO RULINGS, AND TWO ORPHANS I FOUND IN PROD
Laredo 2026-10-02 16:40 CT (21:40 UTC)

## ACCEPTED
#24197, #24202, #24181, #24212, #24183, #24205, #24213, #24218, #24224, #24227, #24229.
Two of those are serious catches and I want them named:
- **#24224** — flipping the original to `voided` on a depreciation/prepaid reversal made reports
  subtract the amount TWICE, and a re-post after a reversal booked nothing. That is the exact
  reason the house rule is `reverseJournalEntryNoFlip`: the original is NEVER flipped, because GL
  readers exclude `voided` at 13 sites. You found two engines breaking the rule.
- **#24202** — a pay-run reverser reporting "reversed" while $3,335.32 stayed posted is the worst
  failure shape we have: a false green on money. One engine undoes it now.

## RULING 1 — RE-POSTING A REVERSED SETTLEMENT

**Yes, it can be re-posted against the same LOADS. No, it must never reuse the BILL numbers.**

Those are two different things and the question conflated them. A load is an operational object and
can be settled again. A bill number is a document identifier, and QuickBooks and NetSuite both
treat a document number as permanently spent: a voided bill keeps its number forever, and the
replacement gets a new one. Reusing a number would mean two different documents answering to one
identifier in the audit trail — and the second one would silently inherit the first one's history
in every report, reconciliation and QBO sync.

So: do NOT build number reuse. Build the link. The new settlement carries a reference to the
voided one (predecessor), the voided one carries a reference forward (successor), and both are
visible on the settlement. Then "why are there two bills for load 13633" has an answer on screen
instead of in a query. That is what NetSuite does and it is what an auditor will ask for first.

Your current behaviour — bill numbers never reused — is therefore CORRECT and stays. What is
missing is only the predecessor/successor link. Build that.

## RULING 2 — UI-F9641, REAL $0.00 vs THE EM DASH

**Your commit is right. The guard is wrong. Fix the guard.**

The law in `lib/money.ts` is C-35/C-37 and it is not ambiguous:
- **missing / null / undefined → em dash**
- **a real, measured zero → $0.00**

A real $0.00 is information: it says we looked and the answer is nothing. An em dash says we do not
know. Rendering a measured zero as "—" destroys the distinction and tells the owner "unknown" when
the truth is "zero". It is also the exact bug class I fixed in PartyBoard this session, where
`cents ? usd(cents) : "—"` falsy-tested a NUMBER and turned every real $0.00 into a dash.

So the live design guard is asserting the wrong invariant. Repoint it: it must require the em dash
for MISSING and require $0.00 for a real zero, and it must fail a surface that renders a measured
zero as a dash. You were right not to weaken it unilaterally and right not to push around it —
that is exactly the judgement I want. Now change it to be correct, and say in the commit that the
guard's assertion was the defect.

## WHAT I FOUND IN PROD WHILE ANSWERING AN OWNER QUESTION — YOURS TO FIX

The owner asked why Faro shows anything when he has factored nothing. I read production
(read-only, under bypass). Result:

- All nine Faro/factoring GL accounts: **0 posting rows, $0.00** — 1220, 1230, 1235, 1236, 2150,
  2155, 6405, 6830, 8000.
- Every current factoring table: **0 rows** — factoring_purchases, factoring_purchase_lines,
  factoring_advances, factoring_reserve_movements, faro_reserve_entries,
  factoring_default_interest_accruals, factoring_interest_accrual_runs,
  factoring_repurchase_due_events, factoring.reserve_movement, factor.faro_invoice_lines.
- **`factor.faro_daily_imports` has 2 rows.** The only non-zero thing in the whole Faro surface.

Both are ORPHANED HEADERS. Their child lines are gone:

| id | statement | imported | gross | child lines |
|---|---|---|---|---|
| c1e27709… | 2026-09-04 (`export (7).csv`) | 2026-09-07 | $311,587.00 | **0** |
| c4392703… | 2026-08-09 (`prior-period-split-round29.7`) | 2026-09-21 | $45,200.00 | **0** |

The reversal-and-delete removed the children and left the parents. No code sums those header
totals into a balance, so they are NOT producing a Faro balance anywhere — but
`accounting/factor-reconciliation/recon.service.ts` joins header to lines, so the factor
reconciliation will show both statements with a full-amount variance against zero lines. That is
almost certainly what the owner saw.

**TWO THINGS, AND NEITHER IS A ROW DELETE BY YOU:**
1. The permanent CODE fix is yours: a `factor.faro_daily_imports` header with zero live child
   lines must be impossible. Either cascade the delete, or add the invariant and a guard that
   fails the push. A parent that outlives all its children is a defect in the delete path, not a
   row to sweep. Find which delete path did this and close it.
2. The 2 rows themselves are USMCA data. **Owner-only.** Write the reversible script and the dry
   run, paste it, and stop. He executes under AUTH. Do not delete a row in USMCA, for any reason,
   including cleanup.

## ONE CLAIM OF CC-2's THAT I CHECKED AND IT IS NO LONGER TRUE
The notes on the first orphan row say `uq_faro_invoice_lines_per_import` is a NON-PARTIAL unique
index that makes the sanctioned re-import path throw 23505 for any previously-seen invoice number.
I read the live index: it IS partial —
`CREATE UNIQUE INDEX ... ON factor.faro_invoice_lines (daily_import_id, invoice_number) WHERE (superseded_at IS NULL)`.
That defect does not apply today. Do not spend a block on it. I am correcting the note, not CC-2 —
it was accurate when written or it was wrong then; either way the live index is correct now, and
this matters because the owner is about to start importing Faro reports for real.

## ALSO — YOUR LANE'S SCHEDULED ENGINES
Measured live today: the backend runs `numInstances = 2`, 62 of 78 scheduled engines register
node-cron IN PROCESS, and `wrapBackgroundJobTick` took no lock — so every scheduled engine in this
app has been firing twice per tick in production. That is the cause beneath the double-tick class,
and it is why four engines you marked safe on app-side checks were defects under the new standard.
**That misjudgement is on me, not you** — I changed the standard mid-round, after your audit.
Record: `docs/engine-verification/2026-10-02-SINGLE-FIRE-ROOT-CAUSE.md`.
Re-run your engine audit under the database-guard standard, your lane only.

## YOUR ORDER
1. The two rulings above — the predecessor/successor link, and repointing the money-format guard.
2. The faro_daily_imports orphan CODE fix + the dry-run script for the 2 rows.
3. Then your stated next three: the cash-advance reverse leaving its repayment deduction active,
   bank-driver advances double-booking on retry, and the ROUND 300 settlement stamps + 8 orphans.
4. Re-run the engine audit under the new standard.

33 of 42 defects remain. No prod writes. Proof in every commit.
