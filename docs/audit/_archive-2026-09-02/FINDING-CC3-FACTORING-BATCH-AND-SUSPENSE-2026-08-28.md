# FINDING — CC-3 factoring batch + USMCA 9000 suspense (Cursor re-query 2026-08-28)

Author: Cursor (lead). Claude orchestrator narrative is **not** taken on trust.

Verified: Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, `set_config('app.bypass_rls','lucia',true)` in the same transaction.

## Independent Neon (Cursor)

| Claim | Cursor query result |
|---|---|
| Batch `583d6d03-e545-4c86-9ec7-0c9af3e38b52` | `BATCH-20260828-053812-5U73`, `submitted`, **`factor_id` NULL**, advance 0.9500, fee 0.0250, face 5000 |
| Invoice `6708d422` | `display_id=L-20260827-0857`, `status=sent`, **`factoring_status=not_factored`** |
| `factoring.batch` columns | `factor_id` exists; **no** `is_sample_data`; **no** `created_at` |
| USMCA 9000 | `Ask My Accountant`, **22** posting lines, net **$2,410.00** (`241000` cents), first 2026-08-08, last 2026-08-28 06:02 UTC |

Claude's 21 lines / $2,260 was **stale by one later posting**. Do not copy the old dollars.

## FACT-F1 — submit with null factor + default rates

SOURCE-OF-TRUTH: `apps/backend/src/factoring/batch.service.ts` `createDraftBatch` — `resolvedFactorId` may be null (~176); `advanceRate`/`feeRate` default 0.95/0.025 (~178–179); INSERT writes `$9::uuid` factor_id (~236). `submitBatch` (~243–284) sets `submitted` **without** requiring `factor_id`.
I QUERIED: `SELECT id, batch_number, status, factor_id, advance_rate, fee_rate, total_face_cents FROM factoring.batch WHERE id = '583d6d03-e545-4c86-9ec7-0c9af3e38b52'` after lucia.
NOT CHECKED: whether a customer had a live `getFactorForCustomer` row that the wizard skipped; TRANSP/TRK.

## FACT-F2 — invoice still not_factored (double-pledge exposure)

SOURCE-OF-TRUTH: `submitBatch` updates **only** `factoring.batch`. Invoice reverse lives on other paths (`invoices-bulk.routes.ts` / `factoring-advances.routes.ts` set `factoring_status`).
I QUERIED: `SELECT display_id, factoring_status, status FROM accounting.invoices WHERE id = '6708d422-35c5-44c2-842e-b789991c7c3f'`.
NOT CHECKED: whether a second batch insert is still allowed by `NOT EXISTS (... invoice_ids)` only (batch-side) vs invoice-side.

## FACT-F3 — unflaggable batch

SOURCE-OF-TRUTH: `information_schema.columns` for `factoring.batch`.
I QUERIED: columns `is_sample_data` / `created_at` / `factor_id` — only `factor_id` present.
NOT CHECKED: other factoring tables' sample flags.

## FACT-F4 — pledged sent invoice, Event 2 A/R still missing

SOURCE-OF-TRUTH: Option B Event 2 (`OWNER-DECISION-ACCT-F5692-OPTION-B`) + existing Event 1 path. Missing **batch** JE at submit is OK (funding posts). Missing **A/R** is the defect.
I QUERIED: invoice sent + batch submitted (above). Did **not** re-walk JE `1d43be14` this turn.
NOT CHECKED: Event 1 vs Event 2 JE ids on this load (Claude named `1d43be14`; Cursor did not re-open that UUID).

## ACCT-F-9000 — suspense succeeds

SOURCE-OF-TRUTH: `catalogs.accounts` USMCA `account_number='9000'` joined `accounting.journal_entry_postings` (`amount_cents` + `debit_or_credit`).
I QUERIED: net cents 241000, n=22, name Ask My Accountant.
NOT CHECKED: category→account resolver file:line that chose 9000; whether any line is sample; TRANSP.

Do **not** reclass the $2,410 as the fix. Fail-closed resolver (CC-1) + detector (CC-2).

## INV-F-DISPLAYID — RETRACTED as defect

SOURCE-OF-TRUTH: `apps/backend/src/accounting/from-load.ts` ~170–180 — owner 2026-08-24 **INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER**.
I QUERIED: invoice `display_id = L-20260827-0857` (matches load-number shape).
NOT CHECKED: historical `LUSMCAFREIGHT-*` mint path.

KEEP batch + invoice. No revert of CC-3 `40c1870aa`.
