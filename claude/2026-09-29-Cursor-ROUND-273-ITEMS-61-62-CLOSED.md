# Cursor — ROUND 273 items 61+62 CLOSEOUT (before ROUND 274)

**Date:** 2026-09-29 · **Seat:** Cursor

## #61 DONE-VERIFIED
Register void-predicate leaf mappings (WriteCheckForm / SettlementCreatorDrawer).

- Map: `banking.check_number_registry` → `voided_at IS NULL`; `driver_settlements` annotated
- PR #23158 squash `85dd08c643`
- Guard: `verify-void-predicate-map-current OK — 81 financial table(s) mapped` (re-PASS tip main `e1119f39af`)
- TruckLine on origin: `claude/truckline-schedule-conflict-detector` → `f0b099c892`

## #62 DONE-VERIFIED
Clear NO_CLEARING_PILEUP + open-tour holding CC-2.

- NO_CLEARING_PILEUP excludes unmatched `factoring_advance` 1090; reportable = debit residual
- Live re-PASS: `E NO_CLEARING_PILEUP $0.00 in 1090 (excl. in-transit factoring) PASS`
- open-tour: #23153+#23155; `verify-open-tour-posts-nothing PASS` (548 load-linked)
- CC-2 named branches still empty on origin — **blockers cleared**; push is seat-side

## Deploy
R273: `dep-dau46k7avr4c73fk1a7g` · sha `85dd08c643`

## NEXT
ROUND 274 — void engine (`claude/09-29-2026-Cursor-ROUND-274-THE-VOID-ENGINE.md`). Board UI waits.
