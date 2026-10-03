# ALL CODERS — ROUND 332 · BUILD EVERY ENGINE TO STANDARD
Laredo 2026-10-02 · Owner order: "GET ALL CODERS FULLY BUILDING ALL THE ENGINES NOW, UP TO THE
CORRECT STANDARDS, AND CONTINUE WORKING ON THEM."

## THE STANDARD YOU BUILD TO — ih35-tms-standards, and these three clauses are the ones people skip
- **§-1 PRE-FLIGHT, before ANY "built / done / merged" claim:** list open AND recently-merged PRs
  plus branches (the work is usually in an open PR — never judge from `main`), AND run your counts
  under `SET app.bypass_rls='lucia'` on `br-fancy-credit-akjnd07a`. **Name which of the two you ran.**
  A bare `0` under forced RLS is MASKED, not empty.
- **§0 DEFINITION OF DONE** = file + route mounted + migration on prod + column populated + guard
  wired + live proof. **NOT "merged." NOT "CI green."**
- **§9.0.17 SYSTEMIC SWEEP:** a change repeated at ≥3 sites ships as **ONE guarded sweep + ONE
  generalized guard**, never one PR per site.
- §A: no CPA gate, no JORGE-APPROVED, no HOLD. Merge on green **plus live proof**. All four seats
  have Neon access and prepare + apply their own lane's SQL.

## OWNER LAW CHANGE, RECORDED — §D-F9:A IS SUPERSEDED
§D-F9:A reads "NEVER delete money/audit data — append-only is law." The owner replaced that on
2026-10-02 with the **COMPLETE DELETE ROUTE**: a record that should never have existed is DELETED
with its postings and the ledger still balances. The held migration says so itself ("supersedes
void-not-delete"). Append-only remains the default for everything else; deletion happens only
through the route, only on a listed row, only under an owner AUTH-NNN.

## THE SEQUENCE THE DATABASE ENFORCES — memorize it
> **REVERSE the GL posting → VOID the document → PURGE the row.**
Proven on branch `br-late-grass-akgve11z`: four separate guards refuse any shortcut — WORM on
`accounting.transaction_source_links`, the status/voided_at CHECKs on expenses/bills/driver
bills/settlements, the unvoided-deduction arm, and **guard 282.1** (an invoice cannot take
`voided_at` while a live unreversed posting references it). Never hand-write a void or a purge.

## NO FEEDING DATA. NONE. STILL.
Nobody seeds anything, in any entity, for any reason, including to prove a build. **The owner will
delete every transaction and settlement himself once the engines are built, then create them one
at a time in the Settlement Creator.** That makes the Settlement Creator and the posting engines
the critical path — they must be right before he starts, because he is entering the real book by
hand through them.

## WHAT THAT MEANS FOR PRIORITY
Anything that only cleans up existing rows is now LOW value — the owner is wiping them. Two
examples, stood down: Cursor's 98-line unmatch script and the TRANSPORTATION-load purge. Do not
spend a block on either. **Build the engines he is about to type into.**
