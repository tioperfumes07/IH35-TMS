# COMMS PROTOCOL — all seats communicating (Cursor lead, 2026-09-10)

Owner order 2026-09-10: *"have all coders communicating. finish all the items. Dispatch, Accounting,
Banking, Factoring, Settlements 100%."* This is how seats talk so nobody collides and the lead
(Cursor) can reconcile without pausing the owner.

## The loop (every seat, every ship or blocker)

1. **Before you start a row:** `git checkout main && node scripts/agent-sync-main.mjs`, then read
   `docs/bus/STATUS-NOW.md` + the other seats' `docs/bus/OUTBOX-<SEAT>.md` so you don't touch a file
   another seat has open. Files another seat is mid-flight on are listed in their OUTBOX.
2. **When you merge or hit a blocker:** append ONE line to your `docs/bus/OUTBOX-<SEAT>.md`:
   `<SEAT> | <REG-###> <DONE|BLOCKED|WIP> | <sha> | files: <paths> | <one-line proof or blocker> | NEXT <REG-###>`
3. **Cross-lane defect** (you find a bug in another seat's lane): DO NOT fix it — add a line to the
   canonical register `~/Downloads/09-09-2026-Claude-Lead-DEFECT-REGISTER.md` and `@tag` the owning
   seat in your OUTBOX. Lead assigns the REG number.
4. **Need a decision only the owner can make** (GL mapping, which filter, treatment): write it as one
   line in your OUTBOX prefixed `@OWNER:` and keep building the parts you CAN. Never stall the whole row.
5. **Money math:** reuse the existing poster/sequence. Never write new GL math solo. Never leave a
   prod fixture. Void-never-delete.

## File ownership right now (avoid these collisions)

- **Settlement numbering / presettlement grids** (`presettlement-link.service.ts`,
  `settlements-load-bookended.service.ts`, Load Costs / Pre-Settlements / Settlements grids) = **GPT**
  (REG-010/011). CC-3 verifies on return; nobody else edits these files until GPT posts DONE.
- **All Factoring pages** (`FactoringHome.tsx` + factoring tabs/services) = **Devin A**. No one else.
- **Fleet + Maintenance / Work Orders** (`maintenance.*`, Fleet unit profile, WO detail) = **Codex**.
- **Banking** (accounts, running-balance, drawers) = **CC-2**.
- **Vendors / Lists / Reports / PlannerGrid** = **Devin B**.
- **Dispatch board + load detail** (`DispatchBoard.tsx`, load-detail tabs, timeline, book-a-return) =
  **Cursor**.
- **Dispatch Home KPIs, Cash Flow, presettlement auto-link** = **CC-1** (money lane).

## Deadlines & surrender

Every row carries a UTC deadline in your INBOX. Miss it silently = surrender; the named surrender seat
takes the surface, you keep your money/GL lane. "Blocked" must quote the blocker + who unblocks it,
in your OUTBOX, before the deadline.

## Definition of done (all seats)

Merged is NOT done. **Deployed + re-measured live on `app.ih35dispatch.com` (named sha) is done.**
Post the re-measured proof in your OUTBOX. Lead re-measures before marking the register row ✔.
