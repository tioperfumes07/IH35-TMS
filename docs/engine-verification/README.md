# ENGINE VERIFICATION — one file per engine, written before and after the run

Created 2026-10-02 on the owner's instruction: **every result is written down, without exception, so
nothing is audited twice.**

ONE FILE PER ENGINE: `E-NN.md`. Written in this order, and the order matters:

1. **EXPECTED** — what the engine should do, written BEFORE it is run, from the engine's own code,
   its migration, and the standard (QuickBooks for posting, NetSuite for reversal, and
   `claude/09-13-2026-COMPETITOR-UI-RESEARCH-ALVYS-MCLEOD-QBO-NETSUITE.md`). A test written after
   seeing the result is not a test.
2. **TEST TRANSACTION** — the smallest input that makes the engine do its real job. Neon branch
   forked from `br-fancy-credit-akjnd07a`. NEVER production, NEVER USMCA live.
3. **ACTUAL** — tables written and row counts; every one of the 12 stamps populated or NULL; the
   journal entry's accounts, debits, credits and whether it balances; the
   `accounting.transaction_source_links` row. **No spine row = the posting is linked to nothing.**
4. **VOID** — reversed through the engine's own declared reverse path. Did the DOCUMENT flip or only
   the journal entry? Did the GL net to zero? A separate linked reversing entry (correct) or a
   flip/delete (wrong)? **GL at zero with the document still live is the defect to report loudest.**
5. **VERDICT** — WORKS · DEFECT (what, which line, which stamp) · NOT BUILT.

Paste real rows, never a summary. The same result goes in the workbook
`10-02-2026-IH35-ENGINE-AUDIT-632-ENGINES.xlsx` (CONFIRMED and Proof columns), and the closure is
written back to the engine registry.

WHY THIS EXISTS: the registry carried 35 "open" engines while the repo had 24 built, because nobody
wrote closures back. A static audit of all 632 engines found nothing real — every one of its 11 P0s
cleared on reading. **Only measured behaviour counts.**
