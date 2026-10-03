# UNDO LEAVES ROWS IN `matched` WITH NOTHING MATCHED — AND NEVER TOUCHES THE LEDGER. → CC-2

The owner used the Categorized → **Undo** bulk action on Bank of America (USMCA FREIGHT ····3224) and the
Dreamline Diesel Card. Measured on prod immediately after, on the rows he touched:

    USMCA FREIGHT    for_review     7    matched_expense_id NULL   matched_journal_entry_id NULL
    USMCA FREIGHT    matched       22    matched_expense_id NULL   matched_journal_entry_id NULL
    Dreamline        matched        7    matched_expense_id NULL   matched_journal_entry_id NULL

## DEFECT 1 — 29 of 36 rows landed in `matched` with nothing matched to them
`review_state = 'matched'` while **both** `matched_expense_id` and `matched_journal_entry_id` are NULL is a
contradiction: the row claims a document it does not have.

It is also **unreachable from the UI.** The tab bar is All / For review / Categorized / Excluded —
there is no `matched` tab. The Categorized count correctly dropped to zero, so from the owner's side the
rows simply vanished: not in Categorized, not in For review, visible only under All. He undid them to get
them back for review and 29 of them are now in a state he cannot act on.

Undo must return a row to **`for_review`** with its links cleared. Seven rows did exactly that, which is
the proof the correct path exists and is not being taken for the other 29. Find why those two groups
diverge — most likely the handler restores a *previous* state instead of setting `for_review`
unconditionally, so a line that was `matched` before it was categorized goes back to `matched`.

Add a CHECK or trigger: **`review_state = 'matched'` requires a non-NULL matched document.** A state that
can lie about having a document will lie again.

## DEFECT 2 — UNDO NEVER TOUCHES THE LEDGER. THIS IS THE OWNER'S OWN RULE, BROKEN.
Owner, 2026-10-03: *"IF A TRANSACTION IS VOIDED OR DELETED THEN THE BALANCE OF THAT TRANSACTION SHOULD GO
BACK TO 0."* He is right, and Undo does not do it.

Measured before and after his undo: **the live GL posting count is identical and the ledger is still
balanced.** Not one entry was removed, and not one reversal was written. The expenses those
categorizations created are still live, still posting — they have simply lost the bank line that
explained them.

In QuickBooks, Undo on a categorized bank line **removes the transaction it created** and returns the line
to For Review. Ours clears the link and leaves the document and its GL standing. The result is an expense
with no bank line — the exact orphan class we have spent this week removing.

Undo must, in **one transaction**: reverse or delete the document it created through the governed path,
clear the links, and set `review_state = 'for_review'`. Never a hand-written delete; never partial.
Guard `verify-undo-leaves-no-document-behind`, ceiling **0**, baseline committed.

## WHY IT IS STILL URGENT EVEN THOUGH THE PURGE IS COMING
The purge removes these rows. **It does not remove the Undo button.** The owner re-uploads within hours
and will categorize and undo again on fresh data. A half-reversing Undo rebuilds the orphan class
immediately on the data he is about to type. **Fix writers, not rows.**

## WHAT WAS CORRECT, SO IT IS NOT RE-OPENED
Every row he touched had both link columns cleared — no bank line points at a document it no longer owns.
The Categorized tab is genuinely empty. Nothing double-reversed. The ledger is still in balance.
