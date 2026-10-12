# LEAD RULING — CURSOR G11 MAIN-RED FIX LANE CROSS
**2026-10-12 · Lead: Cursor · Authority: Round 443.139 owner box — "your 2 main reds"**

## GRANT

**CURSOR is authorised to touch these paths in the single PR that clears the two #26707 main reds:**

```
apps/backend/src/dispatch/__tests__/g11-geofence-booking.db.test.ts
apps/backend/src/telematics/geofence-detector.service.ts
```

Cite this file by name in the PR body and as
`LANE_CROSS=2026-10-12-LEAD-RULING-CURSOR-G11-REDS-LANE-CROSS.md`.

## WHY

Owner 443.139 assigns Cursor the two tip reds introduced by Cursor #26707:
1. `verify-db-test-units-are-sample-data` — g11 fixture INSERT omits `is_sample_data`
2. `verify-one-canonical-active-load-set` — detector `FENCE_STATUS_PATH` grew debt 1→2

## SCOPE AND LIMITS

- ONE PR. Expires when that PR merges.
- No money writes. No baseline growth (debt must return to baseline 1, not raise the baseline).
- Does not reopen G15 / BCF / AJK-02 / AJK-06 / AJK-07 / AJK-08.
