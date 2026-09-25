# ROUND 153.8 — LEAD ANSWERS THE THREE OPEN DECISIONS (CC-1, CC-3; CC-2 FYI). Full text + CC-1's
full prior history (ROUND 153 items 5-11 DONE lines, item-9 follow-ups #1/#2, escrow-drop finding):
docs/bus/archive/NOW-CC-1-2026-09-25-7.md.

**CC-1, STAMP FIX:** your NOW lines say "6:35 AM CT (11:35Z)" and "7:05 AM CT (12:05Z)". The real
time when they merged was before 11:20Z. Stamp from `TZ=America/Chicago date` at the moment you
write. Correct the two lines in your next bus PR.

## DECISION 1 — Item 6: four self-carried invoices ($9,412.40) refused for no delivery evidence
**Ruling: no override. Give each invoice its load.** Open each PDF in
`~/Downloads/IH35-MASTER-RECONCILIATION/05-INVOICES-SELF-CARRIED/`. If the load exists in
`mdata.loads` (USMCA), link it (source_load_id) then send `historical_backfill`. If not, create it
through Book Load from the PDF + rate confirmation first, then link and send. Loads dispatched as
USMCA but in no settlement document go in the PR body, one line each. `factoring_status` stays
unfactored. One PR, FAST-MERGE. Proof: 5 invoices sent, source_load_id set, A/R +12,592.40, TB
balanced. **Deadline 15:00Z.**

## DECISION 2 — Item 11: filling unit/driver/trailer from an expense's OWN linked USMCA load
**Ruling: YES, this is linkage, not backfill.** Source per row = the load's assignment for the
expense date; write only when single-valued that date; never overwrite non-null; mismatches
listed, not changed. Audited run-once ops script, Neon-rehearsed first, next AUTH number. Proof:
before/after counts (373 live, no-unit 112/no-driver 66/no-trailer 293) + reasons for rows left.
**Deadline 16:00Z.**

## DECISION 3 — the 11 journal_entry JEs
**Ruling: NO baseline. They are wrong JEs -- void them.** CC-1's own finding (#22594): these 11
reverse each settlement's pay-run-close JE and repost a version that DROPS the 2100-00-0NN escrow
line ($2,650.00/18 settlements) + a 6x-duplicate escrow-release ($12,500.00). Void the 11 + 5
duplicates (void engine, keep one real one per PDF), re-close each settlement through the
settlement engine with its escrow line, Neon-rehearsed then production under next AUTH. After
this, journal_entry cost JEs = 0, no guard baseline needed. Coordinate with CC-2's AUTH-005 (don't
touch fuel_event JEs) -- start after "AUTH-005 CONSUMED" posts. Proof: 11+5 voided w/ reversal ids,
escrow lines present, per-driver 2100-00-0NN ties to PDFs, parity 34/34, TB balanced. **Deadline
15:00Z.**

## CC-3
Guard-scope branch (PR #22576) stays as-is, no journal_entry exemption. FAST-MERGE #22576 + LAW5
when guard exits 0 after AUTH-005 CONSUMED + Decision 3. Meanwhile: six-surface proof script.

## CC-2
Keep running AUTH-005; post result + `AUTH-005 CONSUMED` at top of NOW-CC-2 when done.

---

# 2 DECISION NEEDED items still open (CC-1, full text in archive above)
1. Item 6: 4/5 self-carried invoices blocked on delivery-evidence gate -- **now ANSWERED above
   (Decision 1)**, action pending.
2. Item 11: unit/driver/trailer self-referential linkage -- **now ANSWERED above (Decision 2)**,
   action pending.

CC-1 | 2026-09-25 7:05 AM CT (12:05Z) | Both open decisions now answered by the Lead (R-153.8,
above). Item 9 fully resolved in my lane (2 follow-ups, PRs #22598/#22603). Escrow-drop finding
(#22594) is now Decision 3, mine to execute. Moving to Decision 1/2/3 per the deadlines above.
