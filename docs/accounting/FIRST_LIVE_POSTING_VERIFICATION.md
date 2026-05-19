# FIRST LIVE POSTING VERIFICATION

- **Date (UTC)**: 2026-05-19
- **Transaction type**: invoice
- **Operating company**: IH 35 Transportation (`91e0bf0a-133f-4ce8-a734-2586cfa66d96`)
- **Execution mode**: live production APIs + lucia-bypass verification reads

## Test Transaction

- **Invoice id**: `06c7af5d-3f50-4d56-bf89-2f79124913b9`
- **Invoice number**: `INV-2026-00001`
- **Customer**: `TEST-CUSTOMER-4` (`1ca1bca7-4413-486a-bc3a-0c815c50f12f`)
- **Invoice marker text**: `POSTING ENGINE TEST — BLOCK 9 — REVERSE AFTER VERIFICATION`
- **Line items**: 1 line, quantity 1, unit amount 1 cent (`$0.01`)
- **Status transitions**:
  - Before send: `draft`
  - After send: `sent`

## Posting Result (Initial Post)

- **Result**: `posted`
- **Posting batch id**: `43d973de-7fd3-4831-b77b-27b0150cef6e`
- **Journal entry id**: `111edfe8-dbec-435b-b59e-6f2bcf02f771`
- **Journal entry posting ids**:
  - `17c3f0da-3374-4d10-ad5c-51a553e0dec9`
  - `7920b4ba-9206-485f-a50c-02163210e02e`
- **Idempotency key**: `ih35:posting-mvp:v1:91e0bf0a-133f-4ce8-a734-2586cfa66d96:invoice:06c7af5d-3f50-4d56-bf89-2f79124913b9:-:initial_post`

## Verification Checklist

- **Invoice exists and posting-eligible status**: `sent` (verified)
- **Posting batch created**: yes (`batch_status = posted`)
- **Journal entry created**: yes
- **Posting lines created**: 2
- **Debit total**: 1 cent
- **Credit total**: 1 cent
- **Balanced**: yes (`debit == credit`)
- **Company scope on posting rows**: yes (`operating_company_id` matches target company)
- **Source fields present on posting lines**: yes (`source_transaction_type = invoice`, `source_transaction_id = invoice_id`)
- **Idempotency key populated**: yes (batch + all posting lines + API result)
- **Transaction source links present**: yes (`accounting.transaction_source_links` exists for invoice drilldown linkage)

## Idempotency Re-run Proof

- Re-ran post route with same source + purpose (`initial_post`).
- **API result**: `already_posted`
- **posting_batches count (invoice scoped)**: `1 -> 1` (no new rows)
- **journal_entry_postings count (invoice scoped)**: `2 -> 2` (no new rows)

## Reversal Result

- **Reverse route result**: `reversed`
- **Reversal posting batch id**: `0c537d43-1831-4317-8e4c-811ab37231ee`
- **Reversal journal entry id**: `e36c6aef-11d6-4285-8121-c3c646b9632f`
- **Reversal posting ids**:
  - `7b9877c6-abe0-433f-ba5b-0cfb49fdb409`
  - `5cd3a5d5-3d44-4fe5-a21e-6d04fdb2e212`
- **Original batch status after reversal**: `reversed`

## Net Impact / Ledger State

- **Global ledger totals after reversal**:
  - debit: 2 cents
  - credit: 2 cents
  - balanced: yes
- **Test transaction net impact**:
  - invoice-linked debit: 2 cents
  - invoice-linked credit: 2 cents
  - net: 0 cents
  - **net ledger impact**: zero (verified)
- **Posted rows deleted**: no
- **Posted rows updated**: yes, original posting lines updated with `reversed_by_line_id` + `updated_at` by reversal flow (financial impact remains append-only and net-zero).

## Errors / Warnings

- **Errors**: none
- **Warnings**:
  - Reversal path updates original posting line linkage metadata (`reversed_by_line_id`, `updated_at`) while keeping financial behavior append-only.

## Recommendation

Proceed to BLOCK 10 (Trial Balance). BLOCK 9 objective is satisfied: create/send/post/idempotency/reverse verified live with balanced postings and net-zero outcome after reversal.
