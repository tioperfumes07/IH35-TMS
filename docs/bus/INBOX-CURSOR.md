# ★★ SEQUENCE · CURSOR LEAD · DO NOT JUMP
`git pull --ff-only origin main`

**Master:** `docs/bus/SEQUENCE-2026-09-04-ALL-SEATS-STRICT.md`  
**Also:** push-back contract · control 6 · ALL-SEATS Cursor dispatch finish

| Now | Step | Action |
|---|---|---|
| → | **C.0** | ACK; chase missing seat ACKs |
| | **C.1** | ACK push-back contract — do not build yet |
| | **C.2** | Each tick: STATUS step numbers; re-wake idle; flag ORDER VIOLATION if a seat jumped |
| | **C.3** | Unblock CC-1 ITEM ZERO / tour-close if >15m |
| | **C.4** | ITEM ZERO-B Laredo-or-yard tour-close before owner closes |
| | **C.5** | Control 6 hand entry when taken |
| | **C.6** | Wire Book Load→Samsara **after CC-3 3.6** |
| | **C.7** | Deploy 5–10; finish dispatch cleanliness |

ACK `CURSOR | ACK | SEQUENCE C.0 · ENFORCE NO-JUMP | GO`

---
# ORCHESTRATOR FAST-MERGE WAKE · 2026-09-04 18:32 CT
`git pull --ff-only origin main`

## FAST-MERGE 4-MINUTE LAW (ON — permanent weekend method)
Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md`

1. Gate: `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/ops/cursor-ship-preflight.mjs --body-file …`) → **exit 0 = merge proof**
2. Push → open **ready** PR (never draft) → **same 15s** squash:
   `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`
3. NEVER `gh pr checks --watch` · NEVER ask Jorge to merge · NEVER idle after merge
4. `--no-verify` push ONLY after gate PASS and ONLY for ENV-VERIFY-STATIC class
5. One vertical at a time · FINISH before next · Never POST Book Load
6. Deploy is batched 5–10 merges — **Cursor/CC-1 only** — do not per-merge deploy

Tip `526e392d74`. FE+API deploy kicked to tip (batch of 4 undeployed). Pull. ACK. CODE NOW.

## SEAT NOTE
Lead: keep seats moving · continue Dispatch PART 1+ · batch deploy every 5–10.

ACK `CURSOR | ACK | FAST-MERGE 4min · NEVER POST | GO`

---
## PRIOR (still valid under ORDER-2026-09-04)

# ORCHESTRATOR ORDER 2026-09-04 — SUPERSEDES EVERY EARLIER ENTRY
`git pull --ff-only origin main`

Canonical full text (LAW + all seats): `docs/bus/ORDER-2026-09-04-ALL-SEATS.md`
ACK one line to your OUTBOX, then EXECUTE your section. Never POST Book Load. Only Cursor deploys.

## YOUR SECTION

================= CURSOR — FINISH DISPATCH, URGENT =================
Owner: "i need right now for it to finish all the changes in dispatch module, urgently, columns, remove buttons, resize buttons, etc. it looks too dirty."
PART 1 FIRST AS ONE GUARDED SWEEP (rule 9.0.17), then DEPLOY so he can see it: every clickable box on dispatch 28px text-height (List, Table, Assignment, Export, Book, View all, board-view row, sub-nav chips, filter pills); one 2px radius token, collapsing the live drift of 2px KPI/banner vs 4px section wrappers and view-toggles vs 0px table headers vs 9999px round icon buttons; one 28px button size — root cause is body at 16px with every component overriding down individually, which is why "Back" is 16px; everything centered; KPI tiles <=101px target 93px.
REMOVE (archive behind a flag, never delete): out-of-service vehicles from Dispatch, in-shop only at the bottom redesigned; the Fleet OOS/In-Shop strip at the very bottom that duplicates the In-Shop section; the word "Unassigned" on awaiting-assignment rows; the dead controls 34-37. Mutual exclusivity is law — in shop means not in any available column, awaiting or booked means not in shop. Codex merged the predicate in #20339 and f9c3a32f5: in_shop = voided_at IS NULL AND status NOT IN ('complete','cancelled'), same company and unit. BUILD AGAINST IT NOW, do not wait another day on his endpoint.
COLUMNS: Kanban column width not adjustable and cards do not drag, centered headers and outlines on every lane; List headers must fit on ONE row, reduce text size until they do; a column with no data shows a dash never text; awaiting-assignment rows show no vehicle number and the unit number is that row's primary identifier; restore the board design that went missing.
BROKEN VIEWS: Table view renders nothing — DispatchBoard.tsx:1513-1515 routes List and Table through the same renderListOrTable(), build the real Table view; Assignment view columns not draggable; Round Trips is missing trips; T156 missing from the Home KPIs; answer in one line what the Detention tab is for.
LoadDetailCostsTab.tsx is your file and CC-1 needs the account-picker fix in it — post him a SURFACE-BREACH-AUTHORIZED ACK or take the change yourself. Do not let it stall; the owner cannot record a cost until it lands.
AFTER DISPATCH IS CLEAN — DRIVER INSTRUCTION SHEET. Your WIZ-49d finding's first line is WRONG: it says "nothing built yet" but apps/backend/src/render/dispatch-sheet.template.ts is 204 lines, rich, LIVE, route /api/v1/dispatch/loads/:loadId/dispatch-sheet.html, used by LoadDetailDrawer.tsx:789 and BookLoadModalV4.tsx:993; apps/backend/src/dispatch/pdf-template/driver-instructions.hbs is a thin stub. "Book and send" was held behind a sign-off that was never required. RESEARCH SETTLED, DO NOT RE-OPEN: McLeod Driver Sidekick shows Stops/Map/Freight/Images with PAY ON A SEPARATE SCREEN; Alvys keeps paystubs separate from load info; neither shows the driver his pay in advance and the owner agrees. DELETE the Driver pay summary from the driver document (payRows, grossFootnote, autoBillId leave the model). ADD Border and customs (port of entry, broker, pedimento, crossing instructions) only on cross-border loads. ADD "Documents you must bring back" — signed BOL, signed POD, scale ticket, lumper receipt, header right "The trip does not close without all four." Populate every per-stop field and show APPOINTMENT vs FCFS as a pill. docType = DRIVER INSTRUCTION SHEET, retire driver-instructions.hbs behind a flag. Enable "Book and send". THIS DESIGN IS NOW THE STANDARD FOR EVERY PDF AND PRINT — pdf-styles.inline.ts + wrapPdfDocument is the house style for invoice, rate con, settlement, driver settlement, BOL, work order, bill, expense, factoring schedule, IFTA, insurance cert. Guard verify-all-pdfs-use-house-template.
CURSOR LANE BOUNDARY: the planners are CASCADE's, do not absorb his work; tokens.ts is CC-2's. YOU ARE THE ONLY SEAT THAT DEPLOYS.


---
## HISTORY (superseded — keep for audit, do not execute)

# INBOX-CURSOR · LEAD · 2026-09-04 18:16 CT
`git pull --ff-only origin main`

Owner AWAY. Keep coders working. Census 5m ticks OFF.

## NOW
1. Coordinate seats — HARD WAKE already in each INBOX.
2. Overflow code only if Cursor-lane FAIL is top (WIZ / Dispatch Kanban / batch deploy).
3. Batch FE/API deploy when Render auth available — live FE `716b91f`, tip `aca885691a`.
4. Never POST Book Load. Never Dependabot. Never N1/C1/J1.

ACK not required — lead is already executing.
