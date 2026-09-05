# 09-05-2026 · CURSOR · LEAD — DEPLOY, PUT THE SIX ORDERS ON THE BUS, FINISH DISPATCH
You are lead (`LEAD-SEAT.md` = CURSOR). USMCA only `5c854333-6ea5-4faa-af31-67cb272fef80`. FAST-MERGE.
Only you deploy. `git pull --ff-only origin main` first.

## VERIFIED FACTS THIS HOUR (owner + Neon + tip 4d8b7fc7)
- 13508 is `assigned_not_dispatched` since 01:24Z (your owner-authorized hand UPDATE). Root cause is
  candidate (3): crewed 09-02, before WIZ-STATUS-01 existed; the fix is edit-triggered only, and
  `load-state-machine.ts` rejects `draft → dispatched` with a 400 so Dispatch on a draft is a silent
  no-op. Not DQF (0 hard_block types), not a WO on T156 (0), not the driver. Durable fix + guard +
  self-heal is owed by CC-1 (his STEP 1). Close your "TOP OPEN BUG" as root-caused.
- CC-1 merged #20425 (CoGS picker + fuel-by-role + 3 guards). Your census line "fuel advance links to
  /cash-advances — delegated" is stale. Live API is still `1fa5201`: it does NOT carry #20425, #20414,
  #20413, #20411, #20418, #20422.
- Your escrow verification against the 36 driver settlements + company 5784 is accepted as the
  document truth: $25.00 per load, conditional (12 of 36 have none), cap $2,500 unchanged. It is
  pinned into CC-1's STEP 5 verbatim.

## C.7 — DEPLOY NOW
API `srv-d7rpem7avr4c73fhp4n0` to tip. Post `healthz git_sha` to OUTBOX-CURSOR. FE `7195d6c` is
current unless a newer FE merge lands. Then batch every 5–10 merges as law.

## C.2 — PUT THE SIX ORDERS ON THE BUS (you are the only INBOX writer)
The owner's Downloads now holds six files dated 09-05-2026, one per seat:
  09-05-2026-Cursor-LEAD-DEPLOY-BUS-AND-DISPATCH-FINISH.md (this file)
  09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL-Updated.md
  09-05-2026-Claude-Coder-2-DISPATCH-DESIGN-SWEEP-THEN-ACC-DEFECTS.md
  09-05-2026-Claude-Coder-3-GEOFENCE-ENGINE-REBUILD-LOVES-604-AND-ARRIVAL-ALERT-CHAIN-Updated.md
  09-05-2026-Codex-IN-SHOP-FEED-FLEET-QUEUE-BORDER-CONTRACT.md
  09-05-2026-Cascade-LAW-MIRROR-THEN-LISTS-AND-REPORTS.md
Copy each into `docs/bus/` under the same name and make it the TOP (FORCE) entry of that seat's
`INBOX-<SEAT>.md` with a one-line pointer; move the 09-04 stack below `## HISTORY`. One PR, docs
only, squash. Update `STATUS-NOW.md` with each seat's current step. This replaces the paste-by-phone
relay for this round.

## C.3 — CC-1 GATE WATCH
CC-1's STEP 0 is applying CC-3's four migration drafts (his lane 00–11 UTC). If no sha on
OUTBOX-CC-1 within 15 minutes of him reading the order, you apply them yourself under C.3 and post
the sha to both outboxes. CC-3, your own C.6 and CC-1's 1.11 are gated on it.

## DISPATCH — YOUR OWN CODE, IN ORDER
1. Unit picker shows `U-156-provisional` (03c79e83 · status Sold · TRK-owned · deactivated 2026-06-16)
   beside the real T156 (a10cd288 · InService · leased to USMCA). That is the "156 was blocked"
   confusion. Pickers exclude Sold / deactivated units and units not owned-by or leased-to the
   operating entity. Guard it. Never delete the dupe row.
2. Verify live on FE 7195d6c and post numbers: Table view renders; Kanban lane resize + DnD drag;
   T156 now counts on Home KPIs (13508 is no longer draft).
3. Draft loads must not be a silent dead end: when Dispatch is pressed on a `draft`, the UI shows the
   400 reason ("Load is draft — assign a driver first") instead of nothing. Your surface (the button);
   CC-1 owns the state machine.
4. Finish the 09-04 dispatch cleanliness list still open on your INBOX: Kanban column width +
   drag, Assignment view draggable columns, Round Trips missing trips, Detention tab one-line answer.
5. DRIVER INSTRUCTION SHEET per `09-04-2026-Cursor-Driver-Instruction-Sheet-FINAL-No-Pay.html`:
   no pay on the driver document, Border & customs block on cross-border loads only, "Documents you
   must bring back" (signed BOL · signed POD · scale ticket · lumper receipt), APPOINTMENT vs FCFS
   pill per stop, `docType = DRIVER INSTRUCTION SHEET`, retire `driver-instructions.hbs` behind a
   flag, enable "Book and send". House PDF style = `pdf-styles.inline.ts` + `wrapPdfDocument`;
   guard `verify-all-pdfs-use-house-template`.
6. C.4 tour-close = Laredo delivery OR yard geofence, before the owner closes any pre-settlement.
7. C.6 Book Load → Samsara push-back ONLY after CC-3 posts STEP-3.6 ACK. C.1 contract ACK now.
8. DRIVER PROMPT UI + LIVE-PROGRESS BOARD (`09-05-2026-Cursor-DRIVER-PROMPT-ANSWER-UI-AND-LIVE-
   PROGRESS-BOARD.md`): blocked on CC-3's API contract — correct to hold. Build the FE the same day
   CC-3 publishes the shapes to OUTBOX-CC-3. Do not stub.

## LANE
Planners are Cascade's (K.1–K.3 you already shipped — do not take K.4 lists/reports). `tokens.ts` is
CC-2's. `LoadDetailCostsTab.tsx` is CC-1's for the Load Costs vertical by owner order 2026-09-04 20:01.
Cascade's `cursor/land-law-doc` — do not merge until Cascade replaces the stale 09-03 copy with the
09-05 revision (his order has the file path).

Report: `CURSOR | <item> DONE | <sha / healthz sha> | NEXT <item>`. Never idle. Never POST Book Load.
