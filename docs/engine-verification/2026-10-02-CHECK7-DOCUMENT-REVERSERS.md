# Check 7 — document reversers (not JE-only)

**Rule (owner):** For every engine marked with a money write / CODE PRESENT path, name the engine that
reverses the **DOCUMENT**, not `reverseJournalEntryNoFlip` alone. That helper reverses any JE by id
and proves nothing about a document class. Where no document reverser exists: **VERIFIED-NONE** +
accounting reason (QBO voidable set is short; system artifacts may legitimately have none).

**Population:** writers from `artifacts/engine-audit-632/engines-632.csv` (348). This file is filled
incrementally — write each class the hour it is proven.

## High-value seed (2026-10-02)

| Engine | Document created | Document reverser | Proof |
|---|---|---|---|
| `accounting/bank-recon/recon-worklist.service.ts` / match accept | Bank match stamp + JE | `unmatchBankTransaction` | `recon-worklist.service.ts:283` — clears stamp + reverses JE same txn when JE exists |
| `accounting/bank-recon/bank-match-fuel-post.service.ts` | Fuel expense on match | same `unmatchBankTransaction` (match is the document) | Fuel posts only inside match txn; unmatch reverses the match JE |
| `accounting/bills.service.ts` | Bill (AP) | `voidBill` / `voidBillInClientTx` | `bills.service.ts:3532` / `:3860` |
| `accounting/bills.service.ts` | Bill payment | `voidBillPayment` / `voidBillPaymentInClientTx` | `bills.service.ts:3970` / `:3688` |
| `accounting/journal-entries.service.ts` | Manual JE | `reverseJournalEntryNoFlip` | **Legitimate** — the document IS the JE (QBO voidable set) |
| `driver-finance` settlement close / payrun | Settlement / pay run | `reverseSettlementForVoid` / `reverseSettlementPayRun` / `reverseSettlementGlPosting` | `void-document-callees.service.ts:70`, `settlement-payrun-reverse.service.ts:77`, `settlement-posting.service.ts:585` |
| Expense create | Expense | **open — hunt voidExpense** | no `export async function voidExpense` hit on tip; likely via `accounting/void.service` / universal void — next batch |
| Invoice create | Invoice | **open — hunt voidInvoice** | `voidInvoiceInBulk` exists (`bulk-void.service.ts:40`); single-doc void next batch |
| Factoring advance post | Factoring advance | `reverseFactoringAdvanceEvent` / `InClientTx` | `factoring-posting/poster.service.ts:1640` / `:1675` |
| Depreciation autopost | Depreciation JE periods | schedule un-post / `reverseDepreciation` | period-idempotent post; reverse exists in amortization-posting |
| Recurring bill generator | Bill from template | `voidBill` on generated bill | bill is the document |
| Drift alerts / compliance notification_log / integration_sync_log | System artifact | **VERIFIED-NONE** | Not a human money document; QBO has no void for detector logs / sync logs. Close/resolve or TTL cleanup is the lifecycle. |
| Idempotency cleanup | HTTP cache row delete | **VERIFIED-NONE** | TTL cache, not a financial document (CLEARED in P0). |

## Method for the remaining writers

1. From CSV `isWriter=YES`, open the file.
2. Identify the primary document table INSERT.
3. Grep for void/reverse/unmatch/cancel that targets that document (same module or void.service).
4. Record function + file:line, or VERIFIED-NONE + reason.
5. Append here the same hour — never batch at the end.

**Remaining:** ~340 writer rows after this seed. Continue in batches of 20; money writers first.

NO production writes. Harness voids only on Neon forks deleted after.
