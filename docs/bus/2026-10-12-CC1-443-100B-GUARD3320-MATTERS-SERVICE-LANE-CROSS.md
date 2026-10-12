# CC-1 LANE CROSS — 443.100-B guard 3320 — apps/backend/src/legal/matters.service.ts

**Date:** 2026-10-12
**Seat:** CC-1
**Ruling basis:** LEAD order 443.100 (2026-10-10 10:12 UTC), `~/IH35-LEAD-CHANNEL/443-100-B-CC1.txt` row 3335
**File crossed:** `apps/backend/src/legal/matters.service.ts`
**Current owner in LANES.md:** UNASSIGNED (no seat owns this file)

## Authorization chain

LEAD order 443.100 explicitly assigned CC-1 to fix guard `3320-verify-load-column-all-module-remainder`
as a Class B fix (row 3335 in `443-100-B-CC1.txt`). Guard 3320 has two checks:

1. `forbid("legalService", "input.load_id", …)` — `matters.service.ts` must NOT accept `input.load_id`
   as API input, because `legal.matters.load_id` was removed from the schema surface in the ROUND 372
   linkage cleanup. Leaving it in the Zod schema implies a column that the API no longer documents.
2. `need("bookLoad", "onCreated(createdId ? …", …)` — `BookLoadModalV4.tsx` must call `onCreated` with
   the canonical `{ id, label }` shape.

Both checks are within CC-1's purview per the Lead order. `matters.service.ts` has no assigned owner in
`LANES.md`, so there is no cross-seat conflict; this is an UNASSIGNED-file cross only.

## What was changed

- Removed `load_id: z.string().uuid().optional().nullable()` from the Zod input schema
- Removed all `assertMatterPartyInCompany(…, input.load_id, …)` calls (create + update paths)
- Removed `load_id = $5::uuid` from the SQL UPDATE parameter list
- `legal.matters.load_id` DB column is unchanged (migration 202615190100 stays as-is)

Commit: `63edaeb947` (branch `cc-1/443-100-b`)

## Standing

This lane cross covers only the change above. The lane returns to UNASSIGNED the moment this PR merges.
Any future edit to `matters.service.ts` requires a fresh ruling.
