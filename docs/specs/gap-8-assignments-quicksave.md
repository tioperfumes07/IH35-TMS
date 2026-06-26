# GAP-8 — Assignments Inline Quicksave

**Block:** GAP-8  
**Phase:** GAP-HIGH

## Routes

| Method | Path |
|--------|------|
| PATCH | `/api/v1/dispatch/loads/:uuid/assign-unit` |
| PATCH | `/api/v1/dispatch/loads/:uuid/assign-trailer` |
| PATCH | `/api/v1/dispatch/loads/:uuid/assign-driver` |

Validation errors return HTTP 422 with `E_VALIDATION_*` codes.

## Frontend

- `InlineUnitPicker` / `InlineDriverPicker` / `InlineTrailerPicker` with `optimisticPatch` rollback.
- `DispatchBoard` enables inline quicksave on `DispatchList` unit/driver cells (no modal).

## Verify

```bash
npm run verify:assignments-quicksave
```

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main:
  - apps/backend/src/assignments/quicksave.routes.ts
