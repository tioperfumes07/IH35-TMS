# Lead ruling — CC-3 lane-cross authorization: dispatch active-loads visibility (ROUND 206)

**Date:** 2026-09-28. **Seat:** CC-3. **Files crossed:** `db/migrations/**` (a new migration
correcting `views.live_loads`) and `apps/backend/src/dispatch/**` (read-model/route callers if
needed) — both owned by CC-1 per `docs/bus/LANES.md`.

**Authorization:** Lead ROUND 206 (verbatim): "THE DISPATCH BOARD IS HIDING 14 OF 16 LOADS...
FIX THE ACTIVE-LOAD PREDICATE... THIS IS ABOVE THE DESIGN PASS. A board showing 2 of 16 loads is
not a styling problem — the dispatcher cannot see twelve of the owner's moving trucks." Confirmed
still standing in ROUND 206.1 ("STILL STANDS from ROUND 206 — these are unaffected by the
retraction: ACTIVE LOADS tile says 2 while ROUND-TRIP EXPOSURE says 14... 14 is correct.").

This is a direct, explicit Lead order naming CC-3 as the fixing seat for a P0 dispatcher-visibility
defect — the clearest form of authorization this session recognizes. This document exists so the
PR can cite a real `docs/bus/` filename under `LANE-CROSS:`, per the standing lane-cross procedure
(`docs/bus/LANES.md`), rather than only citing a chat message.

**Root cause, live-confirmed:** `views.live_loads` (`db/migrations/202614180000_views_live_loads.sql`)
excludes a load from `open_dispatch` the moment ANY `driver_finance.settlement_lines` row with
`is_active = true` exists for it, regardless of whether the settlement that row belongs to is open
or closed. Fourteen of the sixteen live USMCA loads (13624/13627–13639, excluding 13633/13634)
carry real, dollar-valued `earnings`/`deadhead_pay` settlement_lines rows — all created
2026-09-28T05:00:00Z in one batch — attached to their pre-settlements while those settlements are
still `status='open'`, `locked_at IS NULL`. The view's own comment states its intent: "a settlement
... ends a round trip" — but an OPEN settlement has not ended anything. The predicate checks for
the row's existence, not the parent settlement's closed state, so these fourteen still-`dispatched`
loads vanish from the view entirely (neither `open_dispatch` nor `pre_settlement`), which is why
the Dispatch board's ACTIVE LOADS tile and Kanban show 2 while ROUND-TRIP EXPOSURE (a different,
unaffected query) correctly shows 14.

**Scope of this cross:** a migration adding a `driver_finance.driver_settlements` join to
`views.live_loads`'s settlement_lines exclusion, requiring `status = 'closed'` before an active
settlement_line counts as "round trip ended." No load status is changed. No settlement_lines row
is voided or altered — this fix only changes which VIEW rows survive the predicate, not the
underlying data. Not authorized: touching the settlement_lines rows themselves (why they exist on
an open settlement is a separate, unaddressed data-integrity question, reported not fixed here).

— CC-3
