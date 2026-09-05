# 09-05-2026 · CODEX · IN-SHOP FEED, FLEET QUEUE IN ORDER, BORDER CONTRACT
Surface: `pages/maintenance/**`, `backend/maintenance/**`. No money. USMCA only
`5c854333-6ea5-4faa-af31-67cb272fef80`. FAST-MERGE. You never deploy — post `DEPLOY-REQUEST: <sha> — <why>`
to OUTBOX-CODEX. `git pull --ff-only origin main`.

## VERIFIED (owner, 2026-09-05 01:30 UTC)
Your R&M verification (#20414, c73a5392) holds. Your production count answers SEQUENCE X.1: 17 USMCA
work orders, 0 non-cancelled, 0 load-linked → NO unit is held in maintenance today. The owner's
"remove all vehicles from maintenance" is therefore satisfied by fact — post `CODEX | STEP-X.1 DONE |
17 WOs, 0 open, 0 units held | NEXT X.2` to your OUTBOX. Also post the missing `X.0 ACK` line.
Your in-shop predicate merged in #20339 / f9c3a32f: `in_shop = voided_at IS NULL AND status NOT IN
('complete','cancelled')`, same company and unit. That predicate is canonical — one definition, never
a second one.

## THE SEQUENCE
**X.2 — In-shop feed endpoint for Cursor.** One endpoint, IN-SHOP ONLY (no OOS), the canonical
predicate, entity-scoped, returns `unit_id, unit_number, work_order_id, work_order_display_id,
opened_at, expected_ready_at (nullable), shop_or_vendor, status`. The minute it merges post the exact
shape to OUTBOX-CODEX AND one line to OUTBOX-CURSOR. Guard: a unit returned by this feed can never
also appear in `units-without-load` / awaiting-assignment (mutual exclusivity is law).
**X.3 — Awaiting-assignment carries the unit number** — contract side (Cursor renders). Verify live
that `GET /api/v1/dispatch/units-without-load` returns `unit_number` for every row; if any row is
blank, that is your defect.
**X.4 — Fleet queue in order: FLT-01 → FLT-02 → FLT-04 → FLT-10.** FLT-04 vehicle swap: one trip,
one settlement, two trucks — THE UNIT LIVES ON THE LEG. Event shape already agreed with CC-1:
`dispatch.load_assignment_history {load_id, previous_unit_id, new_unit_id, reason_code, assigned_at,
assigned_by_user_id}`; CC-1 owns the downstream cost split. The real constraint is that no unit
holds two loads with overlapping active windows — enforce on loads, not as a unit lock on the tour.
Maintenance money rules are settled, do not re-ask: capitalize ≥ $7,000 (role `fixed_asset_default`
→ 1500 Trucks & Tractors is LIVE for USMCA — the "no row" claim was wrong), under = expense;
Suarez-type = vendor bill, roadside cash = expense; every repair requires a Work Order; inventory
parts ≥ $50; fines split DOT/Regulatory vs Internal Driver. The ≥$7,000 live proof stays deferred until
a real repair exists — you were right not to invent one.
**X.5 — Border contract to Cursor.** One endpoint, same shape discipline as the in-shop feed, for the
Driver Instruction Sheet: port of entry + CBP port code, customs broker + contact, pedimento/entry
number, crossing instructions. `loadHasCrossBorder()` at `LoadDetailDrawer.tsx:107` is canonical —
never write a second predicate.
**Then** the CUSTOMS drawer tab treatment is Cursor's; your border data feeds it.

## ALSO — REPORT, DO NOT DELETE
`DispatchList.tsx` (@archived, 476 lines) has no live imports: reported, closed. The 34 root-level
guards with no numbered verify-step: yours wired, the rest filed as one line — done, do not repeat.

## FORBIDDEN
Deploy · settlement or geofence code · deleting archived list files · closing a work order without the
owner's word · a second in-shop or cross-border predicate.
Report `CODEX | STEP-X.N DONE | <sha> | NEXT`. Never idle.
