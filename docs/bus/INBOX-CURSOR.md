# CURRENT GO — CURSOR · class fixes + UI consistency

Cursor→Cursor | LAW-2026-08-31 | GO

## P0 — ship field-scoped Owner override + guards

- `update-load.service.ts` — Owner bypass **non-money fields only**; miles/rate/driver/charges/stops → 409 (WORM)
- GUARD: `scripts/verify-owner-override-not-money-fields.mjs` (claim **2454** even first)
- Update `verify-settlement-trip-close-stamp.mjs` sibling assertions

## P0 — GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31

1. Audit table ALL modules (subnav + list rows) **before code**
2. Shared navy subnav (Settlements = standard) + shared DataTable primitive
3. GUARDS: `verify-subnav-standard.mjs` + `verify-list-rows-use-datatable.mjs`
4. Triage 969 middot hits → real N of list-row defects first

## BUS

Law files shipped: `PASTE-ALL-SEATS-GO-2026-08-31.md` · keep INBOX TOP synced

**FORBIDDEN:** Tell Cascade to redo 11 loads with AT# · settlements-only patch · dispatch-only subnav patch

ACK: `Cursor | ACK | LAW-2026-08-31 | NOW=owner-override-guard+ui-audit|FREE=deploy-cadence | GO`
