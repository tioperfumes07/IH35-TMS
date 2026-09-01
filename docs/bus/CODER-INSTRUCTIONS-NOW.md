# CODER INSTRUCTIONS — NOW (2026-09-01 15:46 CT)

**Read `docs/bus/INBOX-<SEAT>.md` TOP.** That is the only queue.

Older GO-0006 / GO-0009 / GO-11 paste stacks below this line are **SUPERSEDED**. Do not ACK them.

SEARCH FIRST: `docs/lockdown/GO-12-CLEANUP-ADJUDICATION-AND-CPA-ANSWER-CONFLICTS.md`

- Conflicts 1, 2, 4 = CPA ANSWERS vs locked skill (Cascade). **Not** SQL `ON CONFLICT`.
- Conflict 3 CLOSED: pickup = pro forma; delivery → invoice.
- 18 numbering series: CC-2 addendum closed except Settlement + Cash Advance Request → CC-1.
- GO-08 leftover for CC-2: document-create `DO UPDATE` that should be `DO NOTHING` + 409.

NO-SEAT prod money. FAST-MERGE. Idle after a closed INBOX without pulling the new TOP = defect.
