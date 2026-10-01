# LEAD RULING — CURSOR FT3–FT5 Factoring Home KPIs + Setup, lane cross

2026-10-01 · Cursor Lead · authorizes LANE_CROSS for this filename

## Scope (this PR / branch only)

Cursor `cursor/ft3-home-kpi-ledger-c89b` (FACTORING-TAKEOVER FT3–FT5) may touch:

- `scripts/entity-link-adoption-baseline.json` — intentional regen for tip
  FactoringHome `entityLabel(…equipment_id…)` fingerprint drift already on main
  (ambient from FT2 Escrow/Cash Reserve tabs; not a new EntityLink surface)

## Why

FT3 Home cash-flow KPI strip + FT5 Factor Setup submission-email display ship on the
CC-2 purchase / candidates ledger only (no second engine). FT4 FactoringReservesSharedPanel
dual-mount was already on main (B7). The entity-link baseline must match tip current
fingerprints so money-pr-local-gate can push; no new narrow ID finding was introduced by
this PR's FE files (CashFlowPanel / ProfilePanel).

## Gate

Run money-pr-local-gate with:

`LANE_CROSS=2026-10-01-LEAD-RULING-CURSOR-FT3-FT5-FACTORING-LANE-CROSS.md`

Name the same file in the PR body.
