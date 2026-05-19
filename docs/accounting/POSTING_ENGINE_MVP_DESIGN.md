# Posting Engine MVP Design

This note defines the design contract for `feat/accounting-posting-engine-mvp`.

Authoritative inputs:
- `docs/accounting/IH35_ACCOUNTING_BACKBONE_SPEC.md`
- `docs/accounting/JE_LINE_CONTRACT_DECISION.md`
- `db/migrations/0195_accounting_posting_backbone_schema.sql`

Implementation constraints:
- Docs-only note. No feature code, schema code, migration code, UI code, or production DB actions are part of this document.

## 1. Supported transaction types for MVP

MVP supports exactly four source transaction types:
- `invoice`
- `bill`
- `customer_payment`
- `bill_payment`

Double-entry rules (from backbone spec posting rules):
- `invoice`
  - Dr Accounts Receivable
  - Cr Revenue
- `bill`
  - Dr Expense or COGS (mapped from bill category/account)
  - Cr Accounts Payable
- `customer_payment`
  - Dr Cash/Undeposited Funds
  - Cr Accounts Receivable
- `bill_payment`
  - Dr Accounts Payable
  - Cr Cash/Bank

Evidence paths:
- Posting rule source: `docs/accounting/IH35_ACCOUNTING_BACKBONE_SPEC.md`
- Existing transaction APIs/routes:
  - `apps/backend/src/accounting/invoices.routes.ts`
  - `apps/backend/src/accounting/bills.routes.ts`
  - `apps/backend/src/accounting/customer-payments.routes.ts`
  - `apps/backend/src/accounting/vendor-bill-payments.routes.ts`

Everything else is out of MVP scope.

## 2. Source key normalization rules

These rules normalize `source_transaction_type`, `source_transaction_id`, `source_transaction_line_id` stored on `accounting.journal_entry_postings` (added in `db/migrations/0195_accounting_posting_backbone_schema.sql`).

### 2.1 `source_transaction_type` canonical form
- Canonical values (lowercase snake case):
  - `invoice`
  - `bill`
  - `customer_payment`
  - `bill_payment`
- Reject any other casing/spelling at service boundary.
- No aliases accepted (for example `payment`, `customerPayment`, `bill-payment` are rejected).

### 2.2 `source_transaction_id` canonical form (polymorphic text)
- Input accepted as text; normalize to:
  - trim leading/trailing whitespace
  - collapse internal control chars (reject if present)
  - if UUID parse succeeds, store lowercase canonical UUID string
  - if non-UUID, store exact trimmed string (case preserved unless source-specific rule exists)
- Empty string after trim is invalid.
- Because column is polymorphic text, non-UUID legacy/external refs are allowed by design.

### 2.3 `source_transaction_line_id` canonical form
- Set when posting corresponds to a distinct source line.
  - Examples: invoice line id, bill line id, payment application id (if line-granular model is used).
- Leave NULL only when the source has no line-level object in MVP.
- If set:
  - same normalization as `source_transaction_id`
  - must never be empty string

### 2.4 Service-level duplicate prevention key input
- Service must normalize all three source fields first, then use normalized values for duplicate checks and idempotency key generation.
- This is required before DB insert (do not rely only on DB unique index).

Existing evidence:
- New source columns on JE line table: `db/migrations/0195_accounting_posting_backbone_schema.sql`
- Canonical line table decision: `docs/accounting/JE_LINE_CONTRACT_DECISION.md`

## 3. Idempotency key format

Idempotency key must be deterministic, stable, and unique per `(operating_company_id, source transaction identity, posting purpose)`.

### 3.1 Exact format

```
ih35:posting-mvp:v1:{operating_company_id}:{source_transaction_type}:{normalized_source_transaction_id}:{normalized_source_transaction_line_id_or_dash}:{posting_purpose}
```

Where:
- `operating_company_id` is lowercase UUID string.
- `source_transaction_type` is canonical normalized value from Section 2.
- `normalized_source_transaction_id` is normalized per Section 2.
- `normalized_source_transaction_line_id_or_dash` is normalized line id, else `-` when NULL.
- `posting_purpose` for MVP:
  - `initial_post`
  - `reversal`

### 3.2 Stability rule
- Same normalized input fields always produce the same idempotency key.
- Retry calls with same source/purpose must produce same key.

### 3.3 Uniqueness enforcement
- Service checks for existing posting batch and/or JE line rows using the normalized key before insert.
- DB-level backup guard exists:
  - `uq_posting_batches_company_idempotency_key`
  - `uq_jep_source_posting_batch`
  - Both defined in `db/migrations/0195_accounting_posting_backbone_schema.sql`

## 4. Posting batch lifecycle

Table: `accounting.posting_batches` (`db/migrations/0195_accounting_posting_backbone_schema.sql`)

### 4.1 Batch statuses (contract)
- `queued` - batch reserved, not executing yet.
- `in_progress` - posting pipeline executing inside transactional boundary.
- `posted` - ledger rows committed successfully.
- `reversed` - compensating reversal batch committed.
- `failed` - attempt failed with no partial ledger write committed.

### 4.2 Valid transitions
- `queued -> in_progress`
- `in_progress -> posted`
- `in_progress -> failed`
- `posted -> reversed` (only through reversal flow; original rows not edited)

No other transitions are valid.

### 4.3 Status ownership
- Only posting engine service mutates `batch_status`.
- Manual status edits are out of contract.

## 5. Draft vs posted behavior

Boundary rule:
- Draft/approved source transactions generate **no ledger rows** (`accounting.journal_entry_postings`) and no posting batch transitions beyond optional pre-validation.
- Ledger impact is created only once source transaction is in `posted` state.

MVP service must check source status before posting:
- `invoice`: posted-equivalent state required (design contract to map actual invoice status to “posting eligible”).
- `bill`: posted/open AP document required.
- `customer_payment`: posted payment required.
- `bill_payment`: posted bill-payment required.

If posting eligibility is false, return non-destructive rejection and write no ledger rows.

Evidence:
- Existing JE writes are currently explicit API writes, not background posting engine:
  - `apps/backend/src/accounting/journal-entries.service.ts`
- Existing transaction routes for source documents:
  - `apps/backend/src/accounting/invoices.routes.ts`
  - `apps/backend/src/accounting/bills.routes.ts`
  - `apps/backend/src/accounting/customer-payments.routes.ts`
  - `apps/backend/src/accounting/vendor-bill-payments.routes.ts`

## 6. Reversal / void behavior

Rules:
- Posted rows in `accounting.journal_entry_postings` are append-only.
- Reversal creates new compensating JE lines:
  - each new line references original via `reversal_of_line_id`
  - original line marks reverse link via `reversed_by_line_id`
- No edit/delete of posted line amounts or debit/credit direction.
- Reversal uses `posting_purpose = reversal` in idempotency key format.

Evidence:
- Reversal link columns exist on canonical line table:
  - `db/migrations/0195_accounting_posting_backbone_schema.sql`
- Header-level void pattern already exists for manual JE:
  - `apps/backend/src/accounting/journal-entries.service.ts`

## 7. Closed-period guard

Guard must run before any posting insert and before batch transitions to `posted`.

Check:
- Resolve transaction posting date.
- Reject posting when date is in or before closed period cutoff for company.

Source of truth for closed-period behavior:
- `accounting.periods` + trigger functions in:
  - `db/migrations/0183_p7_w2_accounting_periods_close.sql`

Service behavior:
- Engine pre-checks period status using same company scope context pattern (`app.operating_company_id`) before insert.
- If rejected, return explicit `period_locked` style error and commit nothing.

Evidence of current closed-period signaling pattern:
- `apps/backend/src/accounting/p7-wave2.routes.ts` (`IH35_CLOSED_PERIOD` mapping).

## 8. QBO sync relationship

Posting engine ownership (internal):
- Create/validate posting batches.
- Create canonical JE header/line impact.
- Manage source normalization, idempotency, reversal links.

QBO ownership/relationship (current phase):
- Existing outbound sync remains active and must continue to function.
- Engine must not bypass or break queue-based outbound processes.

Integration principle:
- Internal posting is authoritative for IH35 ledger state.
- QBO sync remains downstream/integration concern in current strategy.

Evidence:
- Ownership table and strategy: `docs/accounting/IH35_ACCOUNTING_BACKBONE_SPEC.md`
- Existing outbound queue/sync services:
  - `apps/backend/src/integrations/qbo/qbo-sync.service.ts`
  - `apps/backend/src/integrations/qbo/sync-outbound-accounting.ts`
  - `apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts`

## 9. Error handling

All errors must fail safely with no partial ledger writes.

- Unbalanced entry (`debits != credits`)
  - Fail validation before commit; no line inserts.
- Duplicate posting attempt
  - Service-level duplicate detection on normalized keys before insert; return idempotent success (existing result) or deterministic duplicate error.
- Missing account mapping
  - Reject posting and return mapping error; no batch marked `posted`.
- Closed period
  - Reject posting with period-locked error; no ledger impact.
- Unknown source type
  - Reject at API/service boundary; no DB writes.

Transactional requirement:
- For each posting call, header + lines + source links + batch transition commit atomically.
- On any failure, rollback all changes.

Existing similar guard evidence:
- JE balancing validation pattern in `apps/backend/src/accounting/journal-entries.service.ts`.

## 10. Service API contract

Contract-only proposal (no implementation in this note).

### 10.1 Primary service function

`postSourceTransaction(input): PostResult`

Input:
- `operating_company_id: string` (uuid)
- `source_transaction_type: "invoice" | "bill" | "customer_payment" | "bill_payment"`
- `source_transaction_id: string` (polymorphic text; normalized)
- `source_transaction_line_id?: string | null`
- `posting_purpose: "initial_post" | "reversal"`
- `requested_by_user_id: string` (uuid)

Output:
- `posting_batch_id: string`
- `journal_entry_id: string`
- `journal_entry_posting_ids: string[]`
- `idempotency_key: string`
- `result: "posted" | "already_posted" | "reversed"`

### 10.2 Idempotency behavior on retry

- Same normalized input + same posting purpose must produce same idempotency key.
- Retry outcome must be deterministic:
  - if already posted with same key, return existing posting identifiers and `result = "already_posted"`.
- Service must enforce this before attempting fresh insert.

### 10.3 Optional internal helper contracts

- `normalizeSourceKey(input): NormalizedSourceKey`
- `buildIdempotencyKey(normalized, postingPurpose): string`
- `validatePostingEligibility(source): Eligible | Rejection`
- `createCompensatingReversal(input): PostResult`

Existing contract evidence:
- Existing company-scoped service pattern:
  - `apps/backend/src/accounting/shared.ts`
  - `apps/backend/src/accounting/journal-entries.service.ts`

## 11. Exact acceptance criteria for `feat/accounting-posting-engine-mvp`

- [ ] Supports exactly four source transaction types: `invoice`, `bill`, `customer_payment`, `bill_payment`.
- [ ] All four transaction types generate balanced JE postings (debits == credits).
- [ ] Auto-posted rows always set normalized:
  - `source_transaction_type`
  - `source_transaction_id`
  - `source_transaction_line_id` (or explicit NULL by contract rule)
- [ ] Service computes stable deterministic idempotency key with format from Section 3.
- [ ] Service prevents duplicate posting **before insert** using normalized keys/idempotency checks (not DB-only fallback).
- [ ] Reversal path creates compensating entries; original posted rows are never updated/deleted for financial amounts.
- [ ] Reversal link columns are populated consistently:
  - `reversal_of_line_id`
  - `reversed_by_line_id`
- [ ] Closed-period posting attempts are rejected with no ledger write.
- [ ] Posting uses `accounting.posting_batches` lifecycle states per Section 4.
- [ ] `accounting.transaction_source_links` is populated for cross-module drilldown relationships where applicable.
- [ ] Existing QBO outbound sync behavior is not broken (regression verification included).
- [ ] CI guard exists for posting-engine MVP contract.
  - Current status: **NOT FOUND IN REPO** (must be added in engine PR).

## Carry-forward requirements (must be satisfied by engine PR)

- Posting engine must normalize `source_transaction_type` / `source_transaction_id` / `source_transaction_line_id`.
- Posting engine must ALWAYS set source fields for auto-posted rows.
- Posting engine must generate a stable `idempotency_key`.
- Posting engine must prevent duplicate posting at service level BEFORE insert.
- Future live-DB verification should introspect actual DB schema, not only migration text.

