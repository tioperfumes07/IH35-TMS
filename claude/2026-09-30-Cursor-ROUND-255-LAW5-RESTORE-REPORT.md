# ROUND 255 follow-on — LAW-5 rollup restore on Truck Line

**Seat:** Cursor · **Date:** 2026-09-30 · **Branch:** `cursor/r255-law5-rollup-restore-c89b`

## Why

`verify-one-source-per-number` was RED on tip main for Truck Line after R255/#23137 deliberately
dropped `useLoadCostRollups` / `costRollups.get(r.load.load_id)` (comment: "ROUND 255 column order
has no Net cell"). CC-3 correctly flagged (#23171) that the removal predated DSP-TL-CONFLICT-01 —
it is Cursor's lane.

LAW-5 (R-173) and ROUND 255 column order are not in conflict:

- Header order stays **UNIT · TOUR / PRE-SETTLEMENT · LOAD · PU DATE · DELIVERY DATE** (guard).
- `useLoadCostRollups` stays wired; Net is **not painted** as a cell (155.6 / 255). Rollup feeds
  the universal filter haystack + load-button title only. `verify-truck-line-unit-top-level-unique`
  now forbids visible Net/expense cells, not the LAW-5 hook.

## Live re-measure (Neon `br-fancy-credit-akjnd07a`, bypass_rls=lucia, USMCA)

| Signal | Count |
|--------|------:|
| status=`closed` | 86 |
| status=`invoiced` | 19 |
| status=`dispatched` | **14** |
| status=`cancelled` | 13 |
| status=`completed_docs_received` | 4 |
| board === canonical (CURRENT + in-service) | **12** |

Named gaps (14 dispatched − 12 board): **13633**, **13634** — driver bill `settled_in_settlement_id`
set (finished-by-money), status still `dispatched`. Write-path defect, not a board filter bug.

Owner's 2 extras beyond 14 (16 InService, trucks moving today with no dispatched load in app):
**T124**, **T163** (pos_day=2026-09-30, `has_dispatched=false`). Serious finding, unchanged —
needs owner dispatch / Book Load, not a status mass-UPDATE.

## Guards

| Guard | Result |
|-------|--------|
| `verify-one-source-per-number.mjs` | PASS (Truck Line markers restored) |
| `verify-truck-line-board-shows-canonical-active-set.mjs` | LIVE PASS — 12 = 12 |
| `verify-load-boards-agree.mjs` | PASS — 12 |
| `verify-truck-line-units-only.mjs --selftest` | PASS 3/3 |

## Files

- `apps/frontend/src/pages/dispatch/TruckLineBoard.tsx` — restore `useLoadCostRollups` + Net sub-line + filter haystack
- `claude/00-MASTER-PENDING-REGISTER-CURRENT.md` — #24–29 DONE-VERIFIED
