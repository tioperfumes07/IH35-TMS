# CC-2 — ROUND 360 — BUILD THE BANK FEED STATE MACHINE. OWNER CONFIRMED. VERIFIED AGAINST INTUIT.

Owner confirmed the contract 2026-10-03. Full spec:
`docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md`
This is ONE engine, not six tickets. He re-enters data within hours and uses every path on day one.

## THE DISTINCTION THE WHOLE BUILD RESTS ON — INTUIT'S OWN WORDING
- **"Matching links your bank transactions to records you already created"** → MATCH **LINKS**.
- **"Categorize it ... This creates a brand-new record in QuickBooks"** → CATEGORIZE **CREATES**.
- Undo a match → the line returns to For review and **the underlying record remains intact.**

**MATCH WRITES NO JOURNAL ENTRY. UNMATCH REVERSES NONE.** The document was already posted when it was
created — the entire reason match exists. **Any code that posts on match double-counts.** Cash-basis
timing comes from the payment document's date, never from the bank match.

## 1 — SPLIT THE COLUMN (migration, your lane HH 06–08, claim inside `registry.claimed`)
    review_bucket    for_review | categorized | excluded        WHERE it sits — 3 values, 3 tabs, nothing else
    resolution_kind  added | matched | transfer | split | NULL  HOW it got there — the Action column

Migrate: `matched` → bucket `categorized` + kind `matched`; `transfer` → `categorized` + `transfer`.
Tabs read **`review_bucket` only**. "Show matched" is a **filter over `resolution_kind`**, never a tab.
Drop `matched` and `transfer` from the bucket CHECK so a row can never be stranded off-tab again.

**CHECK constraints — make the lying state impossible:**
- `categorized` ⇒ `resolution_kind` NOT NULL **AND** a live document link.
- `for_review` ⇒ `resolution_kind` NULL **AND** both link columns NULL.

(Today 29 rows sit in `matched` with both links NULL — a row claiming a document it does not have.)

## 2 — THE STATE MACHINE, EXHAUSTIVE
    ACTION             BUCKET BEFORE   BUCKET AFTER   DOCUMENT                    GL
    Categorize         for_review      categorized    CREATED                     POSTED (new)
    UNDO a categorize  categorized     for_review     DELETED (or reversed via    REMOVED — the account no
                       kind added                     the governed path)          longer carries it
    Match              for_review      categorized    UNTOUCHED, now linked       UNCHANGED
    UNMATCH            categorized     for_review     UNTOUCHED, link cleared,    UNCHANGED
                       kind matched                   BACK IN THE MATCH POOL
    Exclude            for_review      excluded       none                        none
    UNDO an exclude    excluded        for_review     none                        none
    Transfer           for_review      categorized    paired entry CREATED        POSTED (new)
    UNDO a transfer    categorized     for_review     DELETED / reversed          REMOVED

## 3 — FOUR HARD REQUIREMENTS
1. **INSTANT.** One DB transaction, synchronous, inside the request. When the screen returns the account
   balance is already right. No background job, no queue. "Right in a minute" is wrong.
2. **MATCHABLE AGAIN.** After UNMATCH the document reappears in the candidate list immediately.
   **Most likely failure: the document's own flag** — `is_matched`, `matched_at`, `reconciled`, a status.
   Unmatch must clear that too, or it never comes back. Check for it explicitly and say what you found.
3. **ALL FIVE TYPES** — expense, bill, bill payment, receive payment, transfer. Each one proven.
4. **NEVER A DOUBLE REVERSAL.** Read whether the document is already reversed first. Undo of an
   already-voided document is a **GL no-op** and clears the link only. (13515 nearly cost us this.)

## 4 — GUARDS, CEILING 0, BASELINES COMMITTED, RUN UNSCOPED
    verify-bank-line-buckets-are-the-three-tabs     no row outside the three
    verify-categorized-has-a-document               categorized ⇒ kind AND live link
    verify-for-review-has-no-document               for_review ⇒ kind NULL AND links NULL
    verify-undo-leaves-no-document-behind           no document whose only bank line was undone
    verify-unmatched-document-is-matchable-again    every unlinked doc appears in the candidate query
    verify-match-posts-nothing                      match/unmatch change no journal_entry_postings row

## 5 — FINISH TEST — ON A FORK, PASTED, PER DOCUMENT TYPE, OR IT IS NOT DONE
    categorize → account carries it → UNDO → line in For Review AND the account no longer carries it
    match      → account UNCHANGED  → UNMATCH → line in For Review AND the document is matchable again
Show the account balance at every step. Five types × both paths. Plus the trial balance unchanged across
every match and unmatch — that is the proof match posts nothing.

## WHAT YOU DO NOT DO
- Do not post on match. Do not reverse on unmatch.
- Do not delete a document that existed before the bank line. Unmatch breaks a link, nothing more.
- Do not repair the 29 stranded rows by hand — the migration re-buckets them, and they are purge
  population anyway. **Fix writers, not rows.**
- Do not build a fourth tab.

DEADLINE: migration + state machine + guards green, pasted in the bus by **2026-10-04 18:00Z**. If it
slips, say so in the bus with what is blocking and I take the surface with the owner — do not go quiet.
