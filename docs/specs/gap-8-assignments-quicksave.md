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
