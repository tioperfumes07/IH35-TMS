# INBOX-CC-1 · GO-22 ONLY · OWNER 2026-09-02

`git pull --ff-only origin/main`

**FAST-MERGE ON.** Never POST Book Load. USMCA only.

## VOID
Miles / GO-16 (Cursor alone) · remake N1 (expense #19641 + bill/BP #19676 are DONE) · docs-only ACK as progress · flip `autofill_allowed` in DB · invent a third settlement counter · `MAX()+1`

## NOW
1. **GO-22 pre-settlement + settlement** end-to-end.
   - Build the query service named by the TODO in `book-load.service.ts` (presettlement link deferred). Wire `presettlement_link_id`. Delete the deferred log.
   - Settlement display number via `lib.trace_counters` — match existing `LD` **or** `LOAD` (whichever the load allocator uses). Never invent a third. Never `MAX()+1`.
   - Manual attach / detach / close-early in the **same** slice.
   - Every settlement: balanced JE, load/unit/driver links, three dates, void = reversal with a register.
2. **ONE OPEN OWNER DECISION — ask before coding the close rule:**
   NB + two TRs, no SB yet, driver needs paying — does pre-settlement **close early**, or stay open until Laredo?
3. Kill the **2 remaining USMCA sample drivers**. Counts before/after.

ACK `CC-1 | ACK | GO-22 ONLY · sample drivers · N1 already shipped · NEVER POST | GO`
