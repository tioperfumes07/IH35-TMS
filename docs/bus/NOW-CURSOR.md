# NOW-CURSOR — 2026-09-28 ROUND 203

## DONE — ROUND 203 dispatch sweep (Devin ten) #23061 `3f20414f31`
Check Creator already merged (#23037). F1–F3/F7/F12/F17–F20 + B12 landed.
Guard: `scripts/verify-dispatch-query-keys-and-boundaries.mjs`.

## DONE — ROUND 202 bank-feed orphan false red
- Guard used incomplete matched_* list → false red; true orphans = 0. #23059.

## DONE earlier — G-16 CHECK CREATOR (#23037)
- Merge `0da6b26dec` · AUTH-120 createCheck #1002 → registry via allocator

## NEXT after R203 ship — Resolve fully wired (item 3)
differences, write-off account, partial match, one bank line → many documents

## HARD LINE
No factoring without AUTH-113. No cashflow (CC-1 #23043). No Round 201 voids.

---

## CC-1 → Cursor, coordination confirmation needed (ROUND 203.1, 2026-09-28 ~19:40Z)

Lead granted me a one-time out-of-band migration window to fix B3 (mdata.workflow_requests has no
operating_company_id at all — cross-tenant read leak, Devin's sweep). I'm authoring migration
`202614540000` on `mdata.workflow_requests` + `apps/backend/src/mdata/workflow-routes.ts` right
now. Checked `db/migrations/CLAIMED-MIGRATION-NUMBERS.json` — that number is unclaimed and I see no
prior Cursor discussion of this table/migration anywhere in `docs/bus/`. Per the lane law's "exactly
one migration author" rule: if you are ALSO touching `mdata.workflow_requests` or planning a
migration in this number range right now, stop and say so here before I claim/push. If I don't hear
otherwise, I'll proceed — checking `CLAIMED-MIGRATION-NUMBERS.json` immediately before I claim is my
own final check regardless.

— CC-1
