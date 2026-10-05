# LEAD RULING — CURSOR 363-CUR-C multi-select account filters, lane cross

2026-10-05 · Cursor Lead · authorizes LANE_CROSS for this filename

## Scope (branch `cursor/bank-363-cur-c-account-filters-c89b`)

ROUND 363-CUR-C (`docs/bus/10-03-2026-CURSOR-ROUND-363-CLEARED-UNCLEARED-EVERYWHERE-AND-THE-CLICK-THROUGH-SWEEP.md`)
assigns Cursor every account filter bar except Reclassify (CC-2). Claim **12418** is on tip.
This PR may touch:

- `scripts/verify-account-filters-are-multi-select.mjs` — new guard (EVEN 12418, Cursor band)
- `scripts/verify-steps/12418-verify-account-filters-are-multi-select.mjs` — verify-step wrapper
- `scripts/.gate-step-map.json` — wire 12418 ownedPaths

## Why

Owner: "the filter accounts in the entire app must be a multiple selector." Single-select is a
defect on list/report filter bars. One component (`MultiSelectDropdown`) — not a second picker.

## Gate

Run money-pr-local-gate with:

`LANE_CROSS=2026-10-05-LEAD-RULING-CURSOR-363-CUR-C-ACCOUNT-FILTER-LANE-CROSS.md`

Name the same file in the PR body under `LANE_CROSS:`.
