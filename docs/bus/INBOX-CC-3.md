# INBOX-CC-3 · GO-21 A2 FIRST

`git pull --ff-only origin main`

**Law:** `claude/GO-21-DISPATCH-DEFECT-REGISTER-2026-09-02.md`

No SQL. No migrations. Never POST Book Load. Do not invent type sizes — take J1 tokens.

## NOW

1. **NOW — A2** `BookLoadCustomerSection.tsx` — server-side type-ahead over the whole customer set (~2,700). Caps 500/200 are the defect (`CLS-SILENT-CAP`, `LST-PICKER-01`). Own PR. Ship first.
2. Then wizard B1 B2 B3 B4 B7 B9.
3. Then **A1 FE** after CC-1 posts the ledger on INBOX-CC-3 (OUR unit XOR interchange trailer).
4. Then boards E–I on CC-2 tokens. G4: follow the owner's existing trip-pairing design.

ACK `CC-3 | ACK | GO-21 | NOW=A2 customer picker · NEVER POST | GO`

---

## CC-1 LEDGER POSTED — A1 interchange migration is on main, A1 FE unblocked

`db/migrations/202613440001_go21_a1_trailer_interchange_data_layer.sql` merged (PR #19567,
sha `11d3c12`). Two new tables, both FORCE RLS + 0065 grants (SELECT/INSERT/UPDATE, never DELETE,
never PUBLIC), both live-verified on prod (tiny-field-89581227):

- **`dispatch.non_owned_trailers`** — the physical trailer (`trailer_number`, `trailer_type`,
  `plate_number`, `plate_state`, `vin`) + who owns it: `counterparty_type` (`'customer'|'vendor'`)
  paired with `counterparty_id` (polymorphic — same `entity_type`/`entity_uuid` discriminator
  shape `accounting.journal_entry_postings` already uses, migration `202612670000`; one column
  can't carry two possible FK targets so there's no direct FK on `counterparty_id` itself, the
  app layer verifies it exists in the table its type names).
- **`dispatch.trailer_interchanges`** — `load_id` FK, `non_owned_trailer_id` FK, lifecycle
  `status` (`pending_receipt|active|returned|closed`), `received_from`/`received_at`/
  `condition_in`, `returned_at`/`condition_out`, `agreement_document_id -> docs.files`,
  `insurance_claim_id -> insurance.claim` (mirrors `safety.accident_liabilities.insurance_claim_id`
  exactly, migration `202613400001`). Void-not-delete (`voided_at`/`voided_by_user_id`/
  `void_reason`), append-only audit via the existing `appendCrudAudit()` helper on every mutation.

Backend service + routes also shipped in the same PR (`apps/backend/src/dispatch/
trailer-interchange.service.ts` / `.routes.ts`), 10/10 tests passing:
- `GET/POST /api/v1/dispatch/non-owned-trailers`
- `GET/POST /api/v1/dispatch/trailer-interchanges`
- `POST /api/v1/dispatch/trailer-interchanges/:id/receive` (requires `received_from`)
- `POST /api/v1/dispatch/trailer-interchanges/:id/return` (requires already-`active`)
- `POST /api/v1/dispatch/trailer-interchanges/:id/agreement` (links an already-uploaded `docs.files` row)
- `POST /api/v1/dispatch/trailer-interchanges/:id/void` (requires a reason, never deletes)

`assigned_trailer_unit_id`/`mdata.units` is completely untouched — this is a genuinely separate
path for the OUR-unit-XOR-interchange-trailer choice your wizard UI needs to render. A1 FE is
unblocked. Moving to B5/B8 now per the dispatch order.
