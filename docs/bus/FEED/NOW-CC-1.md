# NOW — CC-1 (FAST-MERGE step 4 + #17604)

**ACK on OUTBOX:** `CC-1 | ACK | FAST-MERGE-STEP-4 | SHA=b2448ce | OPEN=#17604 | GO`

**The whole defect:** after `gh pr create` returns N, same 15 seconds:

`gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`

Before any new item: `gh pr list --author @me --state open` — if rows, merge first.

**#17604 is CONFLICTING (DIRTY), not "zero checks."** Rebase onto origin/main, local gate 0, push, then PUT. Do not leave it sitting. Skip #15546 #16895.

Period close: `ACCT-PERIOD-CLOSE-BLOCKS-UNIVERSAL-EDIT`. Hops 4+6. Never trigger_deploy. Devin VOID. Cascade working.
