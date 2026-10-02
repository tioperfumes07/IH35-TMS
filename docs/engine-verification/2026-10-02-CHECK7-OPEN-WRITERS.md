# Check-7 writers map (strict + human pass 1)

| verdict | n |
|---|---:|
| CODE PRESENT | 164 |
| VERIFIED-NONE | 176 |
| OPEN | 8 |

CSV: `2026-10-02-CHECK7-WRITERS-DRAFT.csv`

## OPEN remaining (8) — lease / payment apply / reclassify / transfer / loan

- `accounting/lease-asc842/lease-posting.service.ts`
- `accounting/payments/apply.service.ts`
- `accounting/reclassify/reclassify.service.ts`
- `finance/amortization/amortization.service.ts`
- `integrations/relay-payments/relay-deposit-stage1-transfer.service.ts`
- `leases/lease-buyout.service.ts`
- `leases/lease-engine.service.ts`
- `leases/lessee-posting.service.ts`

## Method note
`reverseJournalEntryNoFlip` alone never counts. Same-module void/reverse/unmatch or explicit allowlist only.

NO production writes.
