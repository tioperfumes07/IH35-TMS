# LEAD RULING — CURSOR modal z-index CI unblock, lane cross

2026-10-06 · Cursor Lead · authorizes LANE_CROSS for this filename

## Scope (branch `cursor/modal-z-index-1001-c89b`)

433-CUR QBO DatePicker/SaveDropdown at `z-[1000]` inverted stacking vs shared `Modal.tsx` at `z-[215]`.
`guard-integrity` CI fails on `verify-modal-z-index-above-drawers.mjs` on tip main — blocks every open PR.

This mechanical CI fix may touch:

- `apps/frontend/src/components/Modal.tsx` → `z-[1001]`
- `apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx` → `z-[1002]`
- `apps/frontend/src/components/parity/ParityDrawer.tsx` → stackAboveModal `z-[1003]`
- `apps/frontend/src/components/dialogs/ConfirmDiscardDialog.tsx` → `z-[1004]`
- `scripts/verify-modal-z-index-above-drawers.mjs` — selftest expectation update only (CC-1 guard; Cursor updates tier in same PR)

## Why

Ambient CI blocker on main, not a money or entity-scope change. CC-1 guard file must move with the tier
it asserts; splitting guard vs code across seats would leave CI red between merges.

## Gate

Run money-pr-local-gate with:

`LANE_CROSS=2026-10-06-LEAD-RULING-CURSOR-MODAL-Z-INDEX-LANE-CROSS.md`

Name the same file in the PR body under `LANE_CROSS:`.
