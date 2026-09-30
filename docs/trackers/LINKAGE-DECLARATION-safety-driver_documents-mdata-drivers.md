# LINKAGE DECLARATION — safety.driver_documents ↔ mdata.drivers

CC-1, 2026-09-30 (A-24, per r294c: "Zero real USMCA drivers have any document on file. That is a
data-population gap, which is the owner's to fill, not yours to invent. Write the cross-module
linkage declaration the pairing is missing and leave the data alone.")

## Why this declaration exists

Per §10 of `.claude/skills/ih35-tms-standards/SKILL.md` ("LINKAGE LAW + CANONICAL WIRING") and
`docs/LAW.md` §4 ("A block with no linkage declaration is not done"), every cross-module pairing
must have a written declaration. This one was missing: `FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md`
line 759 lists `safety.driver_documents` as `out→1 in←0 · leaf · →org.companies` — it does not name
`mdata.drivers` at all, even though the table's whole purpose is to carry a driver's documents. A-12
(this session, `docs/bus/2026-09-30-CC1-A12-DRIVER-DOCUMENT-SAFETY-LINKAGE-MEASUREMENT.md`) found
this absence and flagged it as a finding in its own right.

## The linkage, as it exists today (verified live, 2026-09-30)

**Direction:** `safety.driver_documents.driver_id` → `mdata.drivers.id` (many documents, one driver
— a driver has zero-to-many document rows, one per `doc_type`).

**Enforcement: NOT a real foreign key.** Live query against prod
(`information_schema.table_constraints` joined to `key_column_usage`/`constraint_column_usage` for
`safety.driver_documents`) returns **zero FOREIGN KEY constraints of any kind** — not even the
`org.companies` one the wiring doc's own crawler credits it with. The `driver_id` column exists
(confirmed live: `id, operating_company_id, driver_id, doc_type, file_name, r2_key, effective_date,
expiry_date, notes, voided_at, voided_reason, created_at, updated_at`), and the write path
(`apps/backend/src/safety/driver-documents.routes.ts`) validates the driver belongs to the calling
company and is not deactivated before inserting — but this is an APPLICATION-LEVEL check, not a
database-level FK constraint. The relationship holds today only because the one write path is
disciplined; nothing at the schema level prevents a future writer from inserting an orphaned
`driver_id`.

**Company scope:** `operating_company_id` is carried directly on `safety.driver_documents` (not
inherited through the driver join) — this is the correct pattern per §0's forced-RLS law, and it
matches how the write path scopes inserts.

## Read/write surfaces (every place this pairing is touched)

- **Write:** `apps/backend/src/safety/driver-documents.routes.ts` — the only INSERT path. Validates
  company + active-driver before writing an R2-backed file under
  `{operating_company_id}/safety/driver/{driver_id}/{timestamp}-{filename}`.
- **Read (count only):** `apps/backend/src/mdata/drivers.routes.ts:2544` — a driver's document count
  is summed into a broader "missing items" tally for the driver profile view, joined by
  `d.driver_id = $1::uuid`.
- **Read (compliance dashboards):** `apps/backend/src/compliance/missing-required.service.ts` and
  `apps/backend/src/compliance/filings-aggregate.service.ts` both query this table to compute which
  required documents are missing/expiring per driver, for the company-wide compliance surface.
- **Read (legal e-sign flows):** `apps/backend/src/legal/signed-links.service.ts` references this
  table as part of resolving a driver's on-file documents for a signature workflow.
- No dedicated frontend "driver documents" list/detail page was found (searched
  `apps/frontend/src` for `driver-documents`/`DriverDocuments`, zero matches) — today this table is
  consumed only as an aggregate count/compliance signal, never browsed row-by-row in the UI.

## The real finding (restated from A-12, not re-derived)

Company-wide, USMCA carries **exactly one row** in `safety.driver_documents`, and it belongs to a
`first_name='TEST'` driver (`9f35cf21-01bb-467e-bc31-e96bb9c60dfe`), not a real one (see A-23's
enumeration for that row's full detail: not voided, still live). **Zero real USMCA drivers have any
document on file** — no visa, no medical card, no CDL, nothing. This is a data-population gap
(the compliance/safety document upload flow has essentially never been used for a real driver in
this entity), not a code or linkage-mechanism defect — the FK-less mechanism works correctly for the
one row that exists (round-trip verified in A-12: document → driver and driver → document both
resolve).

## What this declaration does NOT do

Per the order, this is a documentation-only pairing declaration. It does not:
- Add a real FOREIGN KEY constraint on `driver_id` (a schema change, its own migration/decision —
  named here as a real gap, not silently fixed).
- Touch the one existing TEST-driver document row (that is A-23's territory, already enumerated,
  not voided there either — the owner decides).
- Invent, seed, or backfill any document for a real driver (explicitly the owner's call, per the
  order's own wording: "not yours to invent").

## Recommendation, not acted on here

Add a real `FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id)` constraint on
`safety.driver_documents` so the relationship is database-enforced rather than resting entirely on
one disciplined write path — this closes the gap between "the documented linkage" and "what the
schema actually guarantees." A small, additive, idempotent migration; not written here since it is
a schema change outside this measurement-only job's scope.
