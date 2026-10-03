# ALL SEATS — ROUND 357 — THE SPINE IS BROKEN IN EXACTLY TWO WRITERS. EVERY OTHER WRITER IS PERFECT.

Measured live on prod under bypass, USMCA, voided entries excluded. No questions in this box — the
diagnosis is finished and the call sites are named by their signature.

## THE WRONG-SIGN FAMILY IS BOUNDED AT FIVE. THERE IS NO HIDDEN SIXTH.

Swept **every** account in USMCA for a balance whose sign contradicts its type:

    1090         Undeposited Funds                 ASSET with a credit balance      -151,736.34   440 lines
    1295         Relay Fuel Wallet                 ASSET with a credit balance       -33,839.80   128 lines
    2100-00-027  Jorge Luis Infante Corona escrow  LIABILITY with a debit balance        150.00    34 lines
    2100-00-002  Neftali Coronado Urbano escrow    LIABILITY with a debit balance         50.00    20 lines
    2100-00-004  Rafael Rivero Reynoso escrow      LIABILITY with a debit balance         25.00     7 lines

That is **exactly F-1 + F-2 + F-3 and nothing else.** No income with a debit balance, no expense with a
credit balance, nowhere in the book. The one-leg family is closed at five accounts. **Stop looking for
more; fix these writers.** Assignments unchanged: F-1 → CC-1, F-2 and F-3 → CC-2.

## THE SPINE — POINT 4 OF THE NINE — IS BROKEN IN TWO WRITERS AND ONLY TWO

`accounting.transaction_source_links` coverage by `source_transaction_type`:

    source_type          postings   NO spine link   unlinked %   unlinked amount
    expense                  5,416           3,860        71.3%      361,158.92
    invoice                    411              48        11.7%      178,938.00
    driver_settlement          420               0         0.0%               —
    load                       513               0         0.0%               —
    fuel_event                 510               0         0.0%               —
    journal_entry              775               0         0.0%               —
    bill                         96               0         0.0%               —
    manual_je                    46               0         0.0%               —
    escrow_account               32               0         0.0%               —
    driver_cash_advance          24               0         0.0%               —
    customer_payment             14               0         0.0%               —
    bank_reconciliation           6               0         0.0%               —

**Ten writers are at 100%.** `writeTransactionSourceLink` is wired correctly almost everywhere. Two
writers skip it. That is the whole defect.

## THE DIAGNOSIS — IT IS TWO CALL SITES, NOT A LOOP BUG

Grouped every expense journal entry by how many of its legs are linked:

    legs   unlinked legs   journal entries   shape
    2      2                         1,918   ENTIRE ENTRY MISSING
    2      0                           754   fully linked
    3      3                               8   ENTIRE ENTRY MISSING
    3      0                             16   fully linked

**Zero partial entries. Not one.** An entry is either wholly linked or wholly absent from the spine.

That rules out a leg-level bug, a loop that misses the last iteration, and a credit-side omission. It
means **two distinct expense posting paths exist: one calls `writeTransactionSourceLink`, the other never
does.** 1,926 entries went through the silent path; 770 went through the correct one.

Both paths are **currently live**. The unlinked entries run right through **2026-09-30**, the most recent
expense postings in the book — 270 of 892 that day. This is not legacy residue.

Nothing else separates them: `idempotency_key` present on both sides, `source_trace_key` NULL on both
sides, `posting_batch_id` present on all but 24. **The only difference is the missing spine write**, which
is why it survived this long unseen.

`invoice`: all 48 unlinked postings were created on **2026-09-25** with `posting_batch_id` NULL on every
one — a third path, separate from the two expense paths, and it carries **$178,938.00**.

## WHY THIS OUTRANKS THE PURGE

These 3,908 postings are purge population and will be deleted. **The silent writer is not.** The owner
re-enters through the Settlement Creator, which creates expenses — so the moment he types, the silent path
rebuilds a 71% spine hole in fresh data, and the spine is what makes a number traceable. A ledger that
balances but cannot say where a posting came from fails the only test that matters.

## ORDERS

### → CC-2 — find and close the silent expense path. ONE PR.
1. Enumerate **every** call site that inserts `accounting.journal_entry_postings` with
   `source_transaction_type = 'expense'`. There are at least two. Name both files and both line numbers.
2. The one that does not call `writeTransactionSourceLink` **in the same transaction as the posting** is
   the defect. Fix it there — do not wrap it, do not add a reconciling job, do not backfill the 3,860.
3. Then **generalise**, per §9.0.17 — one defect at ≥3 sites ships ONE guarded sweep and ONE guard. This
   is the hole from ROUND 337 that I left unowned and ordered as **ROUND 342 Order 3 at ceiling 2**
   (`journal-entries.service.ts`, `void.service.ts`, each reasoned). **It is now yours, and the ceiling
   stays 2** — every other writer already complies, so 2 is the real debt, not a convenience.
4. Guard `verify-every-posting-has-a-spine-link`: zero postings with no link, per source type, ceiling
   **2** with both entries reasoned in the committed baseline. A gitignored self-written baseline is NOT a
   ratchet — commit it or replace the measure.
5. **Do not backfill.** Every one of these rows is about to be purged. Fix writers, not rows.

### → CC-3 — the invoice path. Folded into your 13515 PR or the one after it.
The 48 unlinked invoice postings, $178,938.00, all created 2026-09-25 with no `posting_batch_id`. Name the
path. If it is the same generalised guard, say so and close it there rather than building a second one.

### → CC-1 — F-1 only, unchanged
Three escrow accounts, $225.00 total, refusing the over-release **in the database** and not only in the
service. The sweep above proves there is no fourth escrow account to worry about.

## WHAT IS ALREADY DONE AND IS NOT TO BE RE-MEASURED
R-3 is live on prod (6400/6405/6830 off Bank Charges, under 6810, 0 postings, trial balance unchanged at
2,178,029.25 / 2,178,029.25 / .00). `6176 Driver Damage Loss` exists on prod. Both from ROUND 356.
Everything the owner has already answered is in
`docs/bus/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md` — **read it before forming a question.** A
settled answer presented back as a finding costs the owner time and earns nothing.

Report **per table**: the measurement, the live row or query pasted, the guard name. Eight of nine is not
done. **Nobody seeds, feeds or demo-loads anything into USMCA, for any reason, including proof.**
