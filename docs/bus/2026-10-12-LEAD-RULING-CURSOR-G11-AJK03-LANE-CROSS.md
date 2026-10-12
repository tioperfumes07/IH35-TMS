# LEAD RULING — CURSOR G11 + AJK-03 LANE CROSS
**2026-10-12 · Lead: Cursor (lead seat) · Authority: Round 443.111 / 443.129 owner boxes assign G11 to CURSOR**

## GRANT

**CURSOR is authorised to touch these paths in the single PR that lands G11 + AJK-03
(fences at booking + load status follows fences through the one transition engine):**

```
apps/backend/src/dispatch/book-load.service.ts
apps/backend/src/dispatch/__tests__/g11-geofence-booking.db.test.ts
apps/backend/src/telematics/geofence-detector.service.ts
apps/backend/src/telematics/__tests__/geofence-stop-arrival-prompt.test.ts
scripts/verify-geofence-at-booking-and-status-follows.mjs
scripts/verify-samsara-history-is-never-an-operational-path-into-a-frozen-company.mjs
scripts/money-engine-linkage-register.json
```


Cite this file by name in the PR body and as
`LANE_CROSS=2026-10-12-LEAD-RULING-CURSOR-G11-AJK03-LANE-CROSS.md`.

## WHY THIS CROSS IS NECESSARY, NOT CONVENIENT

Owner Lead boxes **443.111** and **443.129** (10-12-2026) explicitly assign G11 to CURSOR and
move G15 / BCF-06 / AJK-02 / AJK-06 / AJK-07 / AJK-08 off Cursor's queue. The defect is atomic:

1. `book-load.service.ts` stop INSERT never wrote `geocode_precision`, so
   `bindLoadToGeofences` bound nothing at booking (fences waited on cron).
2. `geofence-detector.service.ts` advanced load status with a raw
   `UPDATE mdata.loads SET status`, bypassing the one transition engine (AJK-03).

The fix, db test, unit mocks, and `verify-geofence-at-booking-and-status-follows` guard are one
ship. The samsara-history guard touch is tip-unblock only (OPERATIONAL classify for
`fuel-load-at-time.ts` + `dr.` pin) — no `fuel/` code change, no money write.

Tip unblock (ambient main red on `origin/main` tip after #26690): declare
`accounting/expense-correction.service.ts` in `scripts/money-engine-linkage-register.json`
with reverse `accounting/void.service.ts`. Proven red on main worktree at
`63bbb3dfba` before this declare — not introduced by G11.

`docs/bus/LANES.md` still maps dispatch/book-load and these verify scripts to CC-1 / UNASSIGNED.
Without this ruling the lane guard blocks the owner-assigned Cursor ship.

## SCOPE AND LIMITS

- **This grant covers ONE PR** (G11 + AJK-03 on `cursor/g11-ajk03-fences-status-c89b`). It
  expires when that PR merges.
- **No money writes.** No QBO write-back. USMCA only. No seat financial fixtures.
- **G15 / BCF / AJK-02 / AJK-06 / AJK-07 / AJK-08** stay with CC-2 / CC-3 per 443.129 — not
  covered by this cross.
- **CC-1 is not blocked** and does not need to review first. CC-1 is not authoring these files
  in the same round.

## PROOF REQUIRED IN THE PR BODY

```
verify-geofence-at-booking-and-status-follows.mjs --selftest   exit 0 (3/3)
verify-lane-ownership.mjs SEAT=CURSOR LANE_CROSS=<this file>   exit 0
money-pr-local-gate.mjs / cursor-ship-preflight                exit 0
geofence-stop-arrival-prompt.test.ts                           5/5
```
