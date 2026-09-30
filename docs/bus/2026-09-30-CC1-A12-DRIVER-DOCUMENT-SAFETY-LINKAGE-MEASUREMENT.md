# A-12 — Driver document <-> Safety linkage measurement (audit only, no fix)

CC-1, 2026-09-30.

## The linkage shape, as built

`safety.driver_documents` (columns: id, operating_company_id, driver_id, doc_type, file_name,
r2_key, effective_date, expiry_date, notes, voided_at, voided_reason, created_at, updated_at) FKs
directly to `mdata.drivers.id` via `driver_id`. There is no separate "safety record" table distinct
from `mdata.drivers` for this purpose — the driver row itself is the safety record, and every
document type (CDL, medical card, visa, etc.) is one row in this single table, distinguished by
`doc_type`. The write path (`apps/backend/src/safety/driver-documents.routes.ts`) validates the
driver belongs to the company and is not deactivated before inserting — confirmed live in
`scripts/verify-safety-driver-document-durable.mjs`'s own static checks (already PASS, already
wired).

## Round trip — mechanically works, but the population is nearly empty

Live query, USMCA, all of `safety.driver_documents`:
```sql
SELECT id, driver_id, doc_type, voided_at, created_at FROM safety.driver_documents
WHERE operating_company_id = '5c854333...'
```
Returned **exactly 1 row, total, across the entire company** — a single `doc_type='cdl'` document,
and its `driver_id` resolves to `mdata.drivers` id `9f35cf21-...`, **first_name='TEST',
last_name='DriverTESTMTDP79YF'** — a test-data driver, not a real one.

Round trip proof (this one row):
```sql
SELECT d.id, d.first_name, d.last_name, dd.id AS doc_id, dd.doc_type
FROM mdata.drivers d JOIN safety.driver_documents dd ON dd.driver_id = d.id
WHERE dd.id = '51a81bd0-fb13-4d50-b7ab-bb83781abbea'
```
Resolves correctly both directions (document → driver, driver → document). The FK mechanism is
sound.

## The real finding

**Zero real USMCA drivers have ANY document on file** — no visa, no medical card, no CDL, nothing
— except one CDL row belonging to a test driver. This is not a linkage-completeness defect (the
bidirectional FK works for the one row that exists); it is a **data-population gap**: the
compliance/safety document upload flow has essentially never been used for a real driver in this
entity. No "cross-module linkage law" declaration for this specific pairing was found written down
anywhere in the repo (grep for `driver_documents` alongside `01-LINKAGE-LAW` turned up nothing) —
that absence is itself a finding, per this session's own standing rule that an undeclared linkage
is a defect.

## Verdict

Not fixed (audit only, per instruction). Cannot meaningfully claim "every driver document links
both ways to Safety" is either true or false at scale, because there is effectively no real data to
test it against. Recommend: (1) write the missing linkage declaration for `safety.driver_documents`
↔ `mdata.drivers`, (2) separately investigate why real drivers have zero documents on file — that's
an operational/data-entry gap for the owner to weigh in on, not a code defect this measurement can
resolve.
