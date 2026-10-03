# PURGE READINESS — THE SPINE GUARD DOES NOT BLOCK THE PURGE. ONE TRANSACTION IS THE WHOLE FIX.

Owner: *"MAKE SURE ALL REVERSALS ARE REMOVED CORRECTLY... I WANT TO GET READY AND BEGIN THE PURGE AND
PERMANENT DELETE ASAP. FIX THE BLOCKERS, FIND THE SOLUTION."*

## 1 — CC-1's COMPLETE-DELETE SCRIPT IS NOT REFUSED. CC-3's WARNING IS RESOLVED, NOT A BLOCKER.

CC-3 flagged that `trg_live_posting_keeps_spine_link` would refuse CC-1's complete-delete script at
line 365, which deletes spine links by document. **Measured on prod — it will not, if the deletes share a
transaction:**

    CREATE CONSTRAINT TRIGGER trg_live_posting_keeps_spine_link
      AFTER DELETE OR UPDATE OF journal_entry_posting_id ON accounting.transaction_source_links
      DEFERRABLE INITIALLY DEFERRED ...

**`DEFERRABLE INITIALLY DEFERRED` — it fires at COMMIT, not at statement end.** Its body raises only when
the posting still exists and has no remaining link. So:

- Delete the links **and** the postings for a document in **ONE transaction** → at COMMIT the posting is
  already gone, the `EXISTS` test is false, the check passes silently. **No migration, no code rewrite,
  no guard change.**
- It refuses exactly one thing: committing a link delete that leaves a **live** posting unlinked. That is
  the AUTH-177 mistake, and refusing it is correct.

**CC-1: do not rewrite line 365. Wrap the document's link-delete and posting-delete in one transaction
and the script passes.** Whoever made that trigger deferred built it so a governed purge works — that was
good design and it should be said.

`transaction_source_links.journal_entry_posting_id` has no `ON DELETE CASCADE`, so the link must be
deleted **before** the posting within that transaction. Order inside the transaction: links → postings →
entries → document. Never across two transactions.

## 2 — REVERSALS: 13515 WAS ALREADY REVERSED. MY ROUND 353 STEP 1 WAS WRONG AND CC-3 WAS RIGHT TO REFUSE IT.

ROUND 353 step 1 ordered CC-3 to reverse 13515's postings. **He did not run it, and he was correct not
to.** The ledger had already been reversed on 10-01 under AUTH-201, every line linked both ways, net zero.
**Running my order would have recognised that revenue back a second time.** That is the most expensive
mistake avoided tonight and it was avoided by a seat reading the ledger instead of obeying the Lead.

ROUND 353 step 1 is **withdrawn**. The remaining steps were right and are done: the missing cancellation
record written, the void stamped (AUTH-206), the route closed (#24341), the void check clean.

The real cause is on the record: **Cursor's AUTH-201 script set the load to cancelled directly at line
248**, bypassing the cancellation engine. That route is now closed in the database.

**Standing rule for the purge, from this:** before any reversal, read whether the document is already
reversed. A second reversal of a reversed document is not a no-op — it re-recognises the money. The
purge removes reversals and originals together as purge population; it does not reverse anything again.

## 3 — THE TWO RULINGS CC-3 PUT TO ME. BOTH ANSWERED. NEITHER GOES TO THE OWNER.

**13515's driven trip stays on 13515.** The paid driver bill and the closed settlement stay attached to
the voided load. The trip physically happened and it cost money; the voided load is the honest home for
that cost. Moving it to 13513 would inflate 13513's route P&L with a cost it never incurred and would
erase the record that 13515 cost us a driver's pay. 13513 already carries its own driver bill. **Do not
move it. It is purge population and it goes with the rest.**

**The 2 unvalidated same-entity FKs on the escrow and advance-account rows stay unvalidated until after
the purge**, then validate. CC-3's posture is already right: new cross-company writes refused, existing
rows untouched. The escrow balance rows survive the purge at zero — that was ruled and is not reopening.

## 4 — THE REAL BLOCKERS, IN ORDER, AND WHO CLEARS THEM

**B-1 → CC-3 — 13515's live expenses on a voided load.** The load is void but its expenses are still
live, which is why `verify-load-to-cash-chain` and `verify-fuel-transactions-per-load` fail, and why CC-1
had to run today's gates with a local uncommitted exclusion. **Void those expenses through the governed
executor** — never a hand delete — so both gates go green on real data and CC-1's exclusion comes out.
A voided load may not carry live expenses; that is the rule the gates are enforcing and they are right.

**B-2 → CC-1 — the 534 line rows the purge cannot see.** Unchanged and still the one true purge blocker.
`trg_*_derive_company` derives a line's company from its parent only and raises `E_*_PARENT_NOT_VISIBLE`
when the parent is gone, so it blocks its own repair. Add the line's own **account** as a fallback source;
it resolves unambiguously to one company for every one of those rows. Then the rows stamp themselves,
then `SET NOT NULL`, then the purge can reach them. **Full detail in
`00-THE-534-ARE-DEADLOCKED-BY-THE-DERIVE-TRIGGER-EXACT-FIX.md`.** Without this, "the purge was clean" is
false and we will not know it.

**B-3 → sequencing, not a fix.** 1090 and 1295 refuse new deposits and new Relay fuel spends while they
carry the wrong sign. That is the new control doing its job. **The purge resets both**, so the order is:
purge first, then the owner enters data. Do **not** reverse the TB-close sweeps or re-record the Relay
top-ups as transfers just to unblock data entry — that is work on rows that are about to be deleted.
**Fix writers, not rows.**

**B-4 → CC-2 — the overage engine is off.** `FUEL_CARD_OVERAGE_ENGINE_ENABLED` is off on prod, so the
gallon cap that shipped today does nothing yet. Turn it on **after** the purge, with the GL-posting flag
still off until one real swipe has been watched through it.

**B-5 → OWNER, and only the owner can clear it.** GitHub Actions is down — *"account locked due to a
billing issue"* — so **no CI ran today.** Every merge tonight rests on a local gate's own `gate_exit=0`.
That is tolerable for docs and for guarded code. **It is not tolerable for a permanent delete.** My
recommendation, and it is the one place I will push back on urgency: clear the billing block and let CI
run green on the purge PR before the first irreversible statement. Everything else can proceed now.

**B-6 → CC-3 — the evidence-presence cron fails nightly on a bad SQL query.** Already boarded. It is not
a purge blocker; fix it so the nightly evidence is real.

## 5 — TANK CAPACITIES ARE THE OWNER'S, AND THEY ARE NOT A BLOCKER
No unit has a tank capacity yet, so the fallback gallon limit applies to every unit until the owner enters
them under Edit Vehicle. That is data entry, it can happen any time after the purge, and it blocks
nothing. The engine is correct either way: unit tank first, fallback second.

## 6 — THE SEQUENCE
    B-1 and B-2 cleared  ->  B-5 cleared (CI green)  ->  TB capture pre-delete
    ->  purge through cascade-void-engine under owner AUTH, links->postings->entries->document, ONE
        transaction per document, REVERSE then VOID then PURGE, never a hand-written DELETE
    ->  --compare  ->  the 21 orphan guards wired into CI  ->  B-4 on  ->  owner enters data

Nothing in this file needs the owner except **B-5**. Everything else is a seat's to clear.
