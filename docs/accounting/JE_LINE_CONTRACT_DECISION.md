# JE Line Contract Decision

> **Naming:** the real prod table is `accounting.journal_entry_postings`; `accounting.journal_entry_lines`
> is **not** implemented (forbidden to write). Canonical mapping: [`docs/specs/SCHEMA-NAMING-NOTES.md`](../specs/SCHEMA-NAMING-NOTES.md).

## 1) Decision summary

- Decision: **Option (b) approved**.
- Canonical JE line table for backbone work is **existing** `accounting.journal_entry_postings`.
- We will **extend** this table contract (docs-first, schema PR later) rather than introducing a parallel `journal_entry_lines` table.
- Why: repository evidence shows `accounting.journal_entry_postings` is already deeply integrated across journal-entry creation/querying, trial balance math, retained earnings close, banking account balance calculations, and QBO sync mappings.

Evidence:
- `db/migrations/0092_p5_d4_manual_journal_entries.sql`
- `apps/backend/src/accounting/journal-entries.service.ts`
- `apps/backend/src/accounting/p7-wave2.routes.ts`
- `apps/backend/src/accounting/period-close-retained-earnings.service.ts`
- `apps/backend/src/banking/account-balance.routes.ts`
- `apps/backend/src/integrations/qbo/journal-entry-qbo-mapping.ts`

## 2) Proof table: required canonical columns vs actual `accounting.journal_entry_postings`

Source of current columns:
- `db/migrations/0092_p5_d4_manual_journal_entries.sql`

Current physical columns in `accounting.journal_entry_postings`:
- `id`
- `operating_company_id`
- `journal_entry_uuid`
- `line_sequence`
- `account_id`
- `class_id`
- `entity_uuid`
- `debit_or_credit`
- `amount_cents`
- `description`
- `created_at`
- `updated_at`

| Required canonical column | Current coverage in repo | Status |
|---|---|---|
| `id` | Exists as `id uuid primary key` | ALREADY EXISTS |
| `journal_entry_id` (canonical name) | Exists as `journal_entry_uuid` | COVERED INDIRECTLY |
| `operating_company_id` | Exists physically on line table + RLS policy uses it | ALREADY EXISTS |
| `line_sequence` | Exists as `line_sequence` | ALREADY EXISTS |
| `account_id` | Exists as `account_id` | ALREADY EXISTS |
| `class_id` | Exists as `class_id` (nullable) | ALREADY EXISTS |
| `entity_id` (counterparty/entity link) | Exists as `entity_uuid` (untyped) | COVERED INDIRECTLY |
| `debit_or_credit` | Exists as constrained text | ALREADY EXISTS |
| `amount_cents` | Exists as `bigint` with positive check | ALREADY EXISTS |
| `description` | Exists as `description` | ALREADY EXISTS |
| `created_at` | Exists | ALREADY EXISTS |
| `updated_at` | Exists | ALREADY EXISTS |
| `source_transaction_type` | No explicit column on line table | MISSING |
| `source_transaction_id` | No explicit column on line table | MISSING |
| `source_transaction_line_id` | No explicit column on line table | MISSING |
| `posting_batch_id` | No explicit column on line table | MISSING |
| `idempotency_key` | No explicit column on line table | MISSING |
| `reversal_of_line_id` | No explicit column on line table | MISSING |
| `reversed_by_line_id` | No explicit column on line table | MISSING |
| `currency_code` | No explicit column on line table | NEEDS DECISION |
| `fx_rate` | No explicit column on line table | NEEDS DECISION |
| `line_metadata_json` | No explicit line metadata column | NEEDS DECISION |
| `created_by_user_id` (line level) | Not on line table; exists at header level (`accounting.journal_entries.created_by_user_id`) | COVERED INDIRECTLY |
| `voided_at` / `void_reason` (line level) | Not on line table; JE header has `status`, `voided_at`, `void_reason` | NOT NEEDED |

Proof outcome:
- Core JE line contract is already present and production-used in `accounting.journal_entry_postings`.
- Gaps are mostly **posting-engine traceability/idempotency columns** and selective metadata decisions.
- This supports **extend-in-place** as lower-risk than introducing a new parallel JE line table.

## 3) Company scoping determination (required operating-company analysis)

### How company scoping works today

1. Physical company column on line table:
- `accounting.journal_entry_postings.operating_company_id` exists.
- Evidence: `db/migrations/0092_p5_d4_manual_journal_entries.sql`.

2. RLS policy on line table:
- Policy `journal_entry_postings_company_scope` uses line-level `operating_company_id = current_setting('app.operating_company_id', true)` (or lucia bypass).
- Evidence: `db/migrations/0092_p5_d4_manual_journal_entries.sql`.

3. Request/session context sets company scope:
- Services set `app.operating_company_id` before query/insert.
- Evidence:
  - `apps/backend/src/accounting/shared.ts`
  - `apps/backend/src/accounting/journal-entries.service.ts`
  - `apps/backend/src/integrations/qbo/journal-entry-qbo-mapping.ts`

4. Query patterns also filter line table directly:
- Multiple core queries include `p.operating_company_id = $...` in addition to joins.
- Evidence:
  - `apps/backend/src/accounting/journal-entries.service.ts`
  - `apps/backend/src/banking/account-balance.routes.ts`
  - `apps/backend/src/accounting/period-close-retained-earnings.service.ts`

### Verdict on `operating_company_id` for JE lines

- `operating_company_id` is **already required and already implemented** on the JE line table.
- It is **not only inherited** via `journal_entries`; line-level scoping is directly enforced by both RLS and query predicates.
- Decision: in PR1, **do not add duplicate alternative company-scoping mechanics**. Keep and use the existing line-level `operating_company_id` as canonical.

## 4) Exact tables found (repo evidence)

- `accounting.journal_entries` — found (`db/migrations/0092_p5_d4_manual_journal_entries.sql`)
- `accounting.journal_entry_postings` — found (`db/migrations/0092_p5_d4_manual_journal_entries.sql`)
- `accounting.journal_entry_lines` — **NOT FOUND IN REPO**
- `accounting.periods` — found (`db/migrations/0183_p7_w2_accounting_periods_close.sql`)
- `banking.reconciliation_sessions` — found (`db/migrations/0075_p5_t1_1_banking_reconciliation_sessions.sql`)
- `posting_batches` — **NOT FOUND IN REPO**
- `transaction_source_links` — **NOT FOUND IN REPO**

## 5) PR1 schema recommendations (for `feat/accounting-posting-backbone-schema`)

1. Canonicalize naming without creating a parallel line table:
- Keep physical table `accounting.journal_entry_postings`.
- Add compatibility layer (view/type alias/docs contract) if API contract requires `journal_entry_lines` naming.

2. Add missing traceability/idempotency columns to existing line table:
- `source_transaction_type` (text/enum)
- `source_transaction_id` (uuid/text by source strategy)
- `source_transaction_line_id` (nullable)
- `posting_batch_id` (fk to new posting batch table)
- Optional: `line_metadata_json` jsonb (if needed for non-breaking extensibility)

3. Introduce posting-batch object (new table):
- `accounting.posting_batches` (or approved namespace equivalent) with idempotency/run controls.

4. Add source-link uniqueness guardrails:
- Unique constraints/indexes preventing duplicate postings for the same source transaction line + posting purpose.

5. Keep company scoping model unchanged:
- Continue line-level `operating_company_id` + RLS + session setting pattern.

6. Defer optional columns to explicit design decision:
- `currency_code`, `fx_rate`, and line-level creator attribution should be decided by cross-currency/reporting requirements, not silently added.

## 6) Risks / blockers

- Risk: creating a new `journal_entry_lines` table would cause dual-write/dual-read drift with existing services.
- Risk: adding source columns without uniqueness constraints can still allow duplicate posting.
- Risk: changing company-scope behavior beyond current RLS model can introduce cross-company leakage.
- Blocker: canonical source-transaction key design must be finalized before posting-engine implementation PR.
- Blocker: decision needed on whether source IDs are UUID-only or polymorphic text IDs (for non-UUID legacy/third-party references).

## 7) Final decision

- **Use option (b): extend existing `accounting.journal_entry_postings` as canonical JE line contract.**
- This decision is proven by:
  - direct current-column coverage,
  - active production usage across accounting/banking/sync paths,
  - existing line-level company scoping and RLS enforcement,
  - and the clear lower-risk path versus creating a second line table.

