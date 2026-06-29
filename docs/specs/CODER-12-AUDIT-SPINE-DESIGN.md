# CODER-12 — Audit-Spine Wiring (Design)

**Status:** design for confirmation (Jorge/GUARD) before any code. **Tier:** 1 (audit trail for
financial postings). **Block:** 3 of 3 in the QUEUED-BLOCKS set. Unblocks CODER-24.

## Problem (verify-first, fresh-migrated DB + code, 2026-06-29)
Every GL posting must be traceable: `source document → posting → (reversal)`. Today the spine is
only partial:

| Poster | `transaction_source_links` | `events.log_event` |
|---|---|---|
| posting-engine.service | ✅ per line (sourceType/sourceId) | via source-doc routes¹ |
| fuel-posting/poster.service | ✅ per line | — |
| **journal-entries.service** (manual JE) | ❌ | ❌ |
| **void.service** (reversal) | ❌ | ❌ |
| **recurring.worker** | ❌ | ❌ |
| **period-close-retained-earnings.service** | ❌ | ❌ |
| **bank-recon/match.service** | ❌ | ❌ |

¹ `emitAccountingSpineEvent` (the canonical `events.log_event` caller) is invoked today by the
**source-document routes** (`invoices`, `bills`, `expenses`, `payments`, `customer-payments`), not by
the posters. So the 5 posters above post to the GL with **no spine event and no source link** — a
silent audit-trail gap.

## Non-negotiable constraints (GUARD-verified)
- **CALL `events.log_event`, never redefine it.** The prod 13-arg overload is already patched and
  byte-identical to `202606251300`. No `CREATE OR REPLACE` in the diff. Do not re-apply `202606111250`.
  Do not touch the 9-arg overload.
- **Code-only.** `events.log_event` + `accounting.transaction_source_links` already exist on prod
  (in the canonical 682 set). **No migration.** If DDL turns out necessary → STOP, tell GUARD.
- **Atomic + fail-loud.** Spine writes occur on the **same `client`/transaction** as the GL insert.
  If the spine write fails, the posting fails (no silent swallow). Entity-scoped (`operating_company_id`).
- **Additive only.** No deletes/rewrites of existing links.

## Reusable building blocks (no new infra invented)
1. **`emitAccountingSpineEvent(client, opts)`** — already calls `log_event` with the correct 13-arg
   order. **Extend its `AccountingSpineEvent` union** with the new event types below. No signature change.
2. **NEW `writeTransactionSourceLink(client, {operating_company_id, journal_entry_posting_id,
   linked_object_type, linked_object_id, relationship_role})`** — co-located in
   `accounting-spine-emit.ts`, mirrors posting-engine's existing inline INSERT (DRY). One row **per
   posting line**, same transaction.

## Per-poster spine semantics (the decisions to confirm)

| Poster | new event_type | link `linked_object_type` | `linked_object_id` | `relationship_role` |
|---|---|---|---|---|
| manual JE | `journal_entry.created` | `journal_entry` | `header.id` | `manual_entry` |
| void/reversal | `journal_entry.reversed` | `params.entityType`² | `params.entityId` | `reversal_of` |
| recurring | `recurring.posted` | `recurring_template` | `tmpl.id` | `recurring_source` |
| period-close | `period_close.posted` | `period_close` | `FY{year}` | `period_close` |
| bank-recon match | `bank_recon.posted` | `bank_transaction` | `bank_transaction_id` | `bank_reconciliation` |

² void handles `invoice`/`bill`/`journal_entry`; the link points at the **original** entity. The
**reversal chain** is already carried in the GL by `journal_entry_postings.reversal_of_line_id /
reversed_by_line_id` (posting-engine reversal path); the new link row makes `source→reversal`
queryable in `transaction_source_links` too. (Confirm: one event per batch, link per line.)

## Atomicity model
Each poster already runs header+lines on one `client`. Insert the source-link **inside the same
per-line loop** (right after the jep insert, using the returned/known posting id), and emit **one**
`log_event` per batch after the lines commit-in-transaction. No `RETURNING`-less poster needs a new
read — manual JE/void/recurring/period-close will be switched to capture the inserted posting id
(add `RETURNING id`) so the link can FK to it. (Open Q: BLOCK 2 added `ON CONFLICT DO NOTHING` to
these — on a dedup no-op there is no row to link; the link write must be conditional on an actual
insert. Plan: `RETURNING id` → if no row (conflict), skip the link for that line, since the original
line already carries its link.)

## Test matrix (backend vitest, green before hand-off)
- A posting batch from each of the 5 posters → exactly one `events.log_event` row + one
  `transaction_source_links` row **per line**, both entity-scoped, both in the same transaction.
- A void → a link referencing the original entity (`relationship_role='reversal_of'`).
- Spine-write failure → the whole posting rolls back (no orphan GL line).
- `verify:arch-design` green; no `CREATE OR REPLACE events.log_event` in the diff (guard/grep).

## Scope (files)
`accounting-spine-emit.ts` (extend union + add link helper) · the 5 posters above · matching tests.
**Disjoint from BLOCK 2** (merged) and does **not** touch shared registries
(`index.ts`/`App.tsx`/`verify-pre-commit.mjs`/`verify-architectural-design.ts`).

## Open questions for Jorge/GUARD
1. Confirm the per-poster `linked_object_type`/`relationship_role` conventions above (or supply the
   house vocabulary).
2. Confirm **link granularity = per posting line** (matches posting-engine) vs per batch.
3. Confirm adding `RETURNING id` to the 4 BLOCK-2 posters is acceptable (needed to FK the link), and
   the conflict-skip-link behavior.
4. Merge path: build-and-hold for GUARD, or self-merge-if-confident per your standing directive?
