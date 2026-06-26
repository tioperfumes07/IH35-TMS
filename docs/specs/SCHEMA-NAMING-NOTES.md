# Schema Naming Notes — blueprint name → real prod table (authoritative mapping)

BLOCK-RELIABILITY-04 Part A. This file is the **single source of truth** for spec-vs-prod naming drift.
When a blueprint/spec name differs from the actually-implemented table, the **prod name wins** — write
queries against the prod name, not the blueprint name. (Verify any name against `db/migrations/` before
writing SQL — CLAUDE.md §4.)

## Journal entry detail lines

| Blueprint / spec name | Real prod table | Status |
|---|---|---|
| `accounting.journal_entry_lines` | **`accounting.journal_entry_postings`** | the blueprint name was never implemented under that name |

- The JE detail-lines table in prod is **`accounting.journal_entry_postings`** (columns: `journal_entry_uuid`
  → `accounting.journal_entries(id)`, `line_sequence` int CHECK>0, `debit_or_credit` text CHECK IN
  ('debit','credit'), `amount_cents` bigint CHECK>0, `operating_company_id`, `source_transaction_type`,
  `source_transaction_id`, `idempotency_key`, `reversal_of_line_id`, `reversed_by_line_id`,
  `posting_batch_id`, `class_id`, `entity_uuid`).
- The blueprint (`IH35_MASTER_BLUEPRINT_v3_FULL.md` 10a.1.3 / 4.6.1) and several accounting docs say
  `journal_entry_lines`. **That table does not exist.** Every such reference means
  `journal_entry_postings`.
- **`accounting.journal_entry_lines` is FORBIDDEN to write.** The only code that ever referenced it is the
  retired manual-JE route (`apps/backend/src/banking/manual-je.routes.deprecated.ts`, unmounted, returns
  410 Gone) — preserved only as a historical artifact, excluded from the write-guard via its `.deprecated`
  suffix. Do not revive it.

## Posting idempotency (do-not-drop guards)

The posting ledger dedupes via UNIQUE indexes (defined in `0195_accounting_posting_backbone_schema.sql`):
- `uq_posting_batches_company_idempotency_key` — one posting batch per `(operating_company_id, idempotency_key)`.
- `uq_jep_source_posting_batch` — one posting per source line within a batch.

These are enforced in CI by `scripts/verify-posting-idempotency.mjs` (BLOCK-RELIABILITY-04 Part B) so they
cannot be silently dropped. A missing dedupe guard = the money ledger can double-post.

## Audit tables (recurring confusion, recorded here too)

- Row-change audit = **`audit.row_changes`** (append-only). Domain audit events = **`audit.audit_events`**
  (`event_class`, `severity`, `payload`, `actor_user_uuid`). `audit.events` is **not** a table.
- Reconciliation findings sink = **`_system.reconciliation_findings`** (NOT `accounting.reconciliation_findings`
  — that does not exist; its CHECK enums are integration qbo|samsara|plaid|fmcsa).
