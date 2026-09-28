# ROUND 178 JOB A — dry-run of the 4-file import. No rows written. Mid tier, by hand.

Idempotency requires a real key match before any INSERT; per-category matching quality varies by
what the source file actually carries, reported honestly below rather than forcing a number.
USMCA only. All 4 files parsed directly (Python, openpyxl), matched against live DB exports
(`psql` under `SET app.bypass_rls='lucia'`, USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`).

## Files and match method

| File | Rows | Natural key available? | Matched against | Candidates unmatched |
|---|---:|---|---|---:|
| `09-25-26-DRIVER CARRIER EXPENSES.xlsx` | 90 | **Yes** — real Invoice # on most rows | `accounting.expenses` (533 live rows, invoice numbers extracted from `vendor_document_number`+`memo`) | 20 |
| `09-25-26-DRIVER CARRIER ADD PAYMENT.xlsx` | 48 | No — no document number in source | `driver_finance.settlement_lines` (337 active rows), keyed on (load#, amount), multiset-counted | 39 |
| `09-25-26-DRIVER CARRIER DEDUCTIONS.xlsx` | 51 | No — no document number in source | same, (load#, amount) multiset | 22 |
| `09-25-26-CUSTOMER CHARGES.xlsx` | 61 | No — Invoice#/Invoice Date columns are empty on every sampled row | `accounting.invoices` (130 live rows), keyed on (load#, total $), multiset | 5 |

**Total apparent unmatched: 86 of 250.** This is a dry-run candidate count, not a promise to insert
86 rows — see caveats below.

## A real duplicate-feed risk, hit before any write happened

Invoice 99460605 (load 13550, $42.38, Fuel-DEF, driver Jorge Luis Infante Corona) already exists
in `accounting.expenses` **three times** under three different `vendor_document_number` values
("ATGTx5789-2-4238", "AT5789-2-4238", "99460605") — the exact same multi-path-duplicate pattern
this session already found and fixed once this round (AUTH-090/092). A naive per-row insert keyed
loosely would risk becoming the 4th copy of a $42.38 line that's already triple-counted. My
invoice-number match correctly recognized this one as already-present and excluded it — but it is
the clearest evidence that the EXPENSES file needs invoice-number matching specifically, not a
looser key, and that the *existing* triplication is a separate residual defect worth its own
finding (not fixed here — out of scope for an import pass).

## Caveats on the 39/22/5 unmatched counts — reported honestly, not smoothed over

`ADD_PAYMENT` and `DEDUCTIONS` have **no document number in the source data at all** — Enlonada/
Desenlonada/admin-fee/escrow entries are $25/$10/$25 round amounts with no invoice or reference
number to anchor a key. Matching on (load #, amount) is the best available key but is genuinely
weak: two real $25 Enlonada+Desenlonada lines on the same load are indistinguishable from each
other by this key (only *count* matches, not which specific line), and a load with the exact same
round dollar amount from an unrelated cause would false-match. `CUSTOMER_CHARGES`' own Invoice#/
Invoice Date columns are blank on every row I sampled — invoices are keyed on the same (load#,
amount) proxy, same caveat.

**I am not inserting 86 rows off a proxy key this weak.** That's exactly the kind of "fabricate to
fill a screen" risk the round's own standing law forbids, just via imprecision instead of
invention. Reporting the dry-run honestly instead of forcing an apply step.

## What real import needs, as the concrete next step

1. **EXPENSES** (the one file with a real key): safe to build a real idempotent import now, INSERT
   keyed on invoice number, routed through the same expense-creation path the app's own `POST
   /api/v1/expenses` route uses (not raw SQL) — 20 real candidates, each individually named and
   traceable to its own row in the source file.
2. **ADD_PAYMENT / DEDUCTIONS**: need a stronger key before any write is safe. The source data
   itself carries `Settlement #` — cross-referencing against `driver_settlements.source_document_ref`
   (not just load number) narrows the match significantly and is the next concrete step, not
   attempted in this pass given remaining scope.
3. **CUSTOMER_CHARGES**: same — `Settlement#` in the file, cross-reference against
   `driver_settlements.source_document_ref` before writing anything to `accounting.invoices`.

Nothing written. Nothing fabricated. Dry-run counts and the duplicate-feed finding are the real
deliverable of this pass.

— CC-2, tier: mid (Sonnet-class). Sequential, no forks, all matching done directly against live
exports in one pass per file.
