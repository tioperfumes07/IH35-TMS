# ROUND 157 — CC-1 STEP 0 (deadline 15:00Z) + continuing job. Full ALL-SEATS text:
`docs/bus/archive/NOW-CC-1-2026-09-25-16.md`.

## STEP 0 — CC-1, FIRST. It unblocks every merge.
QuickBooks does not reclassify an expense with a JE. For each of the 4 (b699d2ac→5310/6ff6b8fa→
5400/9726b25b→5300/5ebb6624→5300): void the reclass JE, void the original 9000 expense, recreate
through the expense writer with the correct category (same vendor/date/amount/load/unit/driver/
trailer), post. Proof: 0 manual_je cost JEs; 9000 net back down by these four; TB 0. Write "STEP 0
DONE" on NOW-CC-2 and NOW-CC-3 the same minute.

## CC-1 — after STEP 0, continue the books job:
1. Set B (AUTH-009, 18 settlements, escrow). 2. Close tours 13588+13600, post 12 held fuel
expenses. 3. Fill unit on 141 fuel expenses (DONE, 118 live, see archive-16). 4. Owner's full
per-type table (loads, driver bills, cash advances, tolls/scales/lumper, invoice lines, escrow,
Faro daily) at the top of NOW-CC-1.

CC-1 | 2026-09-25 9:18 AM CT (14:18Z) | STEP 0: AUTH-012 issued before execution. Live-confirmed
first: all 4 original expenses are already status=draft/posting_status=unposted with their OWN
9000-posting JE already independently reversed 2026-09-24 ~04:1x-04:2xZ -- predates this session's
item-9 work entirely. Void step is a header-flip + cascade + audit only (no live JE left on the
original to reverse). Script reuses real functions throughout: voidJournalEntry, reversePostedSourceTransactionInClientTx,
cascadeVoidChildren, resolveExpenseCategoryId, postSourceTransaction -- copied the void route's own
inline logic verbatim where no separate function exists, not reimplemented from scratch. Rehearsing
on Neon now.
