# DOC-01 — canonical document-attachment stack decision

Owner packet: `APP-DEFECT-REGISTER-2026-08-29.md` Root 1 + `BLOCK-CC-1-schema.txt` D1.
Author: CC-1. Live-verified against Neon `br-fancy-credit-akjnd07a` (bypass_rls=lucia,
je_control=2214) before writing this, not from the packet's prose alone.

## The two stacks, compared on real data

| | `docs.files` + `docs.file_links` (Stack A) | `documents.attachments` (Stack B) |
|---|---|---|
| Route | `apps/backend/src/docs/files.routes.ts` | `apps/backend/src/documents/attachments.routes.ts` |
| Live row count today | **109** | **3** |
| Entity allowlist (code) | 8: driver, customer, vendor, unit, equipment, load, invoice, settlement | 23, incl. bill, expense, payment, journal_entry, bank_transaction |
| Linkage shape | separate `docs.file_links` junction table (many-to-many: one file, many links) | `entity_type`/`entity_id` columns directly on the row (one attachment, one entity) |
| Category vocabulary | `catalogs.file_categories` — already seeded with `medical_card`, `antidoping_result`, `dot_inspection`, `cdl` | `category` free-ish text column, no catalog FK |
| Versioning | `parent_file_id` self-FK + `version_number` | none |
| Expiration | `expiration_date` column | none |
| Integrity | `sha256_hash` | `sha256_hash` (both have it) |
| Soft-delete | `deleted_at` + `deleted_by_user_id` + `delete_reason` | `is_deleted` + `deleted_at` + `deleted_by_user_id` (no reason column) |
| Dispatch-specific fields | `dispatch_load_id`, `dispatch_document_channel`, `dispatch_delivery_status`, `dispatch_external_message_id`, `dispatch_generated_at` — already extended once for a real product need | none |
| Entity-label resolution | `entity-labels.ts`'s `ENTITY_LABEL_SQL` map — one config object per entity_type (table/labelSelect/scopePredicate), already extended once (`load` added post-launch per the `DOCS-1` comment in `files.routes.ts`) | none observed — reads `entity_type`/`entity_id` raw |

## The decision: `docs.files` is canonical

Grounded in the live numbers, not just feature count: **109 real files already exist on Stack
A, only 3 on Stack B** — the system has already voted with real data. Stack A also has the
richer, more battle-tested model (categories, versioning, expiration, integrity hash,
soft-delete-with-reason) and has already been extended once for a real, unplanned need
(dispatch document delivery tracking) without a schema redesign — proof its shape scales.

Stack B's one structural advantage — `entity_type`/`entity_id` directly on the row, no junction
table — is not enough to outweigh the above. A many-to-many junction (`docs.file_links`) is the
more correct model anyway: a single citation photo can legitimately need to be findable from
more than one entity (e.g., a fine's supporting document filed under both the driver and the
load), which Stack B's one-attachment-one-entity shape cannot represent without duplicating the
file.

## What retires

`documents.attachments` and its route (`apps/backend/src/documents/attachments.routes.ts`)
**RETIRE** — never write to it again after this decision lands. Per the linkage law (`stop-writing
+ REVOKE + deprecated COMMENT`, never a hard delete):
1. Any of the 3 existing live rows get a one-time, verified-correct migration into
   `docs.files` + `docs.file_links` (their own follow-up piece — 3 rows, hand-checked, not a bulk
   script) before the write path is cut, so no citation is silently lost.
2. `documents.attachments.routes.ts`'s write endpoints (create/upload) get commented
   `-- RETIRED, DOC-01 2026-08-29 -- reads only, superseded by docs.files` and stop being called
   by any new surface; existing read-only callers may keep reading until they're individually
   migrated (Cursor's UI wiring pass), but no new caller may ever be pointed at Stack B again.
3. The table itself is NOT dropped — WORM/audit law, and the 3 historical rows are real records.

## What this unlocks

`docs.file_links`'s entity allowlist widens (D2) and `docs.files`-adjacent tables that have no
document column at all get one (D3), both against Stack A only. Every new document-capable
surface (medical cards, drug tests, background checks, DOT inspections, fines' citation photos
already do this, company violations, HOS violations, fuel transactions, bank transactions,
border crossings/credentials, expenses, bills, work orders) links through `docs.file_links`,
never a new `documents.attachments` row.

## Acknowledgment

Published for review per the packet's own D1 instruction ("get it acknowledged before you
migrate anything"). Proceeding with D2/D3 schema work on this recommendation's basis — the
109-vs-3 live data split and the richer, already-proven Stack A feature set make this close to
uncontroversial — while remaining reversible: no data is deleted, no write path is force-cut
before its replacement lands, and this document itself is the record to overturn if Cursor or
the owner disagrees.
