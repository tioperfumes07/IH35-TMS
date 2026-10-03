# ONE ROOT CAUSE IN BOTH ENGINES: STORED STATE THAT CANNOT REVERSE. THE REAL FIX, NOT A PATCH.

Owner: *"SO THE REVERSE ENGINE IN BANKING IS INCORRECT. CHECK QUICKBOOKS, THERE ARE 3 TABS... THIS IS WHY
I ASKED FOR AN AUDIT OF ALL ENGINES SO WE COULD FIX THEM BEFORE THEY WERE USED. FIND THE REAL SOLUTION AND
FULLY AND COMPLETELY BUILD. IN DECISION 2, IS THAT HOW QUICKBOOKS HAS THE ESCROW ACCOUNTS AS WELL... WELL
IT SHOULD TOUCH THE BALANCES TABLE? SO USE LOGIC AND FIX."*

He is right on every point. Both defects are the same mistake wearing two faces: **a value is STORED when it
should be DERIVED, and the thing that writes it has no reverse.**

## WHAT QUICKBOOKS ACTUALLY DOES — VERIFIED AGAINST INTUIT'S OWN DOCUMENTATION, NOT MEMORY
- The Bank transactions page has **three tabs: For review · Categorised · Excluded.**
- **Matched transactions appear in the Categorised tab.** There is no "matched" tab. Matched is *how* a
  line was resolved, shown in the row's Action column — **not a bucket of its own.**
- **Undo always returns the bank line to For Review**, whether it was matched or created.
- For a line QuickBooks created a transaction for, Undo **resets the transaction it created.** It does not
  leave the created record behind.

## DEFECT A — WE MADE "HOW" INTO "WHERE". THAT IS WHY 29 ROWS VANISHED.
Live CHECK constraint on `banking.bank_transactions`:

    review_state IN ('for_review','categorized','excluded','matched','transfer')

**Five values. QuickBooks has three buckets.** `matched` and `transfer` have no tab, so any row in them is
invisible — not in For review, not in Categorized, not in Excluded. The owner's Undo put 29 rows into
`matched` and they left the UI entirely. The column is doing two jobs at once and failing both.

### THE REAL FIX — SPLIT THE TWO CONCEPTS
    review_bucket     for_review | categorized | excluded          <- exactly QBO's three tabs
    resolution_kind   added | matched | transfer | split | NULL     <- the Action column, the "how"

- Tabs read `review_bucket` ONLY. Three tabs, three values, nothing can fall between them.
- A matched line is `categorized` + `matched`, and it shows in the Categorized tab as QuickBooks does.
- Migrate: `matched` → bucket `categorized` + kind `matched`; `transfer` → `categorized` + `transfer`.
- **CHECK, so the lying state becomes impossible:** `categorized` requires a non-NULL `resolution_kind`
  **and** a document link; `for_review` requires `resolution_kind` NULL **and** both link columns NULL.
  Today a row sits in `matched` with both link columns NULL — a row claiming a document it does not have.

## DEFECT B — UNDO DOES NOT UNDO. IT UNLINKS.
Measured on the owner's own 36 rows: the GL posting count was **identical before and after**, and the
ledger is still balanced. Not one entry removed, not one reversal written. The expenses those
categorizations created are still live and still posting — they have only lost the bank line that
explained them. That is the orphan class we have spent the week deleting, created by a button.

### THE REAL FIX — ONE TRANSACTION, THREE THINGS, OR NONE
Undo must, in a single transaction:
1. **Reverse or delete the document it created**, through the governed path — never a hand-written delete,
   never a second reversal of something already reversed.
2. Clear `matched_expense_id` and `matched_journal_entry_id`.
3. Set `review_bucket = 'for_review'`, `resolution_kind = NULL`.

A line that was **matched to a pre-existing document** is different and must stay different: Undo breaks
the link and returns the line to For Review, and **the pre-existing document is left alone** — it was not
created by the match and must not be deleted by the unmatch. `resolution_kind` is what tells the engine
which case it is, which is the second reason to split the column.

Guard `verify-undo-leaves-no-document-behind` — zero documents whose only bank line was undone, zero rows
in `for_review` with a link, zero rows in `categorized` without one. Ceiling **0**, baseline committed.

## DEFECT C — THE ESCROW BALANCE IS AN INSERT-ONLY CACHE. THE OWNER'S QUESTION ANSWERED.
**Does QuickBooks hold escrow the way we do? No — and that is the whole answer.** QuickBooks stores **no
account balance anywhere.** Every balance, escrow included, is **derived from the transactions** every time
it is shown. There is no cached number, so there is nothing that can drift from the ledger.

Ours is stored, and here is the exact mechanism, read from prod:

    CREATE TRIGGER trg_apply_escrow_posting_delta
      AFTER INSERT ON accounting.escrow_postings
      FOR EACH ROW EXECUTE FUNCTION accounting.apply_escrow_posting_delta()

    ... UPDATE accounting.escrow_accounts SET balance_cents = balance_cents + v_delta ...

**AFTER INSERT ONLY.** No UPDATE handler. **No DELETE handler.** The balance can be moved by inserting a
posting and by nothing else. Delete the posting and the number stays exactly where it was, forever.

That is precisely the owner's rule broken — *"if a transaction is voided or deleted the balance should go
back to 0"* — and it is why a purge would leave stale escrow balances. **Not a gap in the purge script. A
gap in the trigger.**

### THE REAL FIX — THE BALANCE FOLLOWS ITS SOURCE, OR IT IS NOT A BALANCE
Preferred, and what QuickBooks does: **derive it.** Replace `balance_cents` with a view / computed read
over `accounting.escrow_postings`. A derived balance cannot drift, cannot be stale after a delete, and
needs no purge handling at all.

If a physical column is kept for read speed, then it is a **cache** and must behave like one:
- Maintained on **INSERT, UPDATE and DELETE**, in the **same transaction** as the posting.
- Guard `verify-escrow-balance-equals-its-postings`: for every escrow account, stored balance **=** the
  sum of its postings. Ceiling **0**, baseline committed, run unscoped.

**This dissolves Decision 2.** The owner does not have to choose whether the purge resets escrow balances:
once the balance follows its postings, deleting the postings takes it to zero by itself. His answer —
*"it should touch the balances table"* — is right, and the better form of it is that the balance should
never have been able to disagree with the ledger in the first place.

## SWEEP THIS SHAPE EVERYWHERE — §9.0.17
Two engines had it, so assume more do. **Find every stored running total maintained by an INSERT-only
trigger or an append-only service** — escrow, wallets, advances, reserves, factoring, driver liabilities,
parts inventory. Each one is a number that can only go up. For each: derive it, or maintain it on all
three operations and guard it equal to its source at ceiling 0. Report the list first, then fix.

## ASSIGNMENT
- **CC-2** — Defects A and B: the bucket/kind split, the migration, the CHECKs, and the real Undo.
- **CC-1** — Defect C: the escrow balance, derived or cache-with-guard.
- **CC-3** — the §9.0.17 sweep: list every stored running total and how it is maintained, before fixing.

The owner asked for this audit **before these engines were used**. He is using them now and finding the
defects himself. That is the gap this closes.
