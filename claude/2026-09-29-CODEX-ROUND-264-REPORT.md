CODEX | 2026-09-29 4:09 PM CT (2026-09-29 21:09Z) | ROUND 264 comparison evidence

## Result and measurement boundary

Read-only USMCA comparison. Snapshot times: transaction export 2026-09-29 3:58:05 PM CT (20:58:05Z), company report execution 4:04:42 PM CT (21:04:42Z). No transaction was created, corrected, voided, or reassigned.

Workbook: `docs/evidence/round264/09-30-2026-ALWAYSTRACK-vs-APP-SETTLEMENT-COMPARISON-R264.xlsx`, also delivered in Downloads under that basename. Exactly COMPANY SETTLEMENTS and DRIVER SETTLEMENTS. The company tab has per-settlement concepts, per-load concepts, source IDs, allocation evidence, variance formulas, excluded-load column, summaries and ranked findings.

Company: **0 green / 48 red when all seven concepts include the app's actual displayed margin**. The source of those margin values is the deployed `buildCompanySettlementReport` function executed against production in a read-only transaction, not the old workbook's homemade formula. Source file SHA256 is `dc200ab38365ae138c4741060fb7954aa2d6ead34e453134f61a15f380516950`, identical in the inspected checkout and live backend commit `fd8c2f6b65368ae024f63f00a4da18b347f06194`. Health endpoint returned HTTP 200 and that git_sha. This report does not imply a new deployment.

**Separate the underlying records from their presentation:** 32/48 settlements match normalized transaction concept totals; 16/48 differ. The 16 have $22,537.08 total absolute transaction-concept variance. This sum uses disjoint concepts; it excludes the repairs subset and margin, avoiding double counting. All 48 report margins differ; their absolute-magnitude variance is $96,516.32. Preserving profit/loss signs instead gives $228,159.78 total absolute margin variance. These two margin measures are alternatives, never amounts to add together or to the transaction variance.

## The five requested classes (overlapping)

| Class | Settlements | Dollars and meaning |
|---|---:|---|
| Genuine differences | 48 | All 48 have report-margin differences. Of these, 16 also have $22,537.08 transaction-concept variance. |
| Wrong-load-split | 20 | At least $1,188.44 misplaced; the settlement expense totals agree in these cases. This is allocation exposure, not additional cost. |
| Transportation-shared | 3 | $12,150.00 AT-only revenue excluded under the owner ruling; excluded membership itself produces no red. |
| AUTH-089 class | 0 | $0 outstanding measured shortage matching a repeated charge. 5787 now has both $15.25 expense documents and $140.20 total non-diesel expenses. |
| Concept and quantity match | 0 | No settlement matches all seven concepts including the actual app report margin. |

Counts overlap: a shared settlement may have a separate allocation or margin defect. The shared cases are 5773 / AT-only load 13497 ($7,200), 5780 / 13530 ($1,500), and 5786 / 13533 ($3,450). All three load numbers are absent from the live USMCA load set. The class follows the owner's shared-settlement ruling; no frozen company was queried to infer ownership. All settlement costs are retained and the excluded load is shown separately.

## Rank the actual transaction differences

| Concept | Settlements | Absolute variance |
|---|---:|---:|
| Line haul | 4 | $13,500.00 |
| Fuel | 2 | $4,622.99 |
| Expenses | 12 | $2,386.62 |
| Driver pay | 2 | $2,027.47 |

By count: expenses, line haul, fuel/driver pay. By dollars: line haul, fuel, expenses, driver pay. Settlement counts overlap. Extra pay/reimbursements and repairs have no remaining total variance after concept mapping.

## Root causes resolved in the comparator

* The earlier extractor compared section titles and differently formatted strings. The replacement uses integer cents and `(load_number, concept)` keys; string order, currency symbols and deduction sign conventions cannot create a mismatch.
* Fuel transaction and its linked Expense are one cost. An Expense with `source_fuel_transaction_id` is classified using the referenced fuel type and counted once, including when its original fuel row was archived. Counting both created false fuel/expense differences. Standalone active fuel records without a corresponding Expense remain represented.
* App `extra_pay` combines additional pay and driver reimbursement amounts in these records. The comparable AlwaysTrack group is printed Additional Driver Pay plus expenses explicitly marked `Drv`. The workbook labels the mapping; it never changes app values to force a match. Reimbursement remains an expense cost once for company cost analysis.
* Shared-settlement line haul is compared on the USMCA load subset; excluded source revenue is retained in a separate column.
* Settlement 5816 has a real first/last-load FK but zero settlement lines. The app report therefore displays an empty report. The comparator finds the real load through the header, with the missing report linkage identified explicitly.

## Actual app report defects remain observable

The deployed report service reads fuel rows without `voided_at` / `archived_at` filters (company-settlement-report.service.ts, fuel query near line 290), also sums their Expense documents (expense query near line 335), and its margin expression subtracts both (line 373). It does not include Quick Pay in that expression, as its own header explains. Therefore matching underlying transactions can coexist with an incorrect displayed margin.

Example 5769: AlwaysTrack margin $3,684.42; actual app report margin $2,452.36. Underlying normalized line haul, base driver pay, additional pay/reimbursement, fuel and expenses tie. The DEF expense $67.84 is assigned to load 13498 in the app, while its date/vendor/receipt match the PDF fuel receipt on 13508. This is a separate allocation defect.

For 5787, the older $15.25 shortage is no longer reproduced: live expense numbers `13549-15` and `13549-19` both hold 1,525 cents. All seven non-diesel expenses total 14,020 cents on load 13549. The PDF's unique date/vendor/receipt joins support at least $49.74 on load 13555, where the app has no non-diesel Expense. Unassigned PDF expense rows are printed as unallocated; the comparator does not guess a load from position. Wrong-load-split dollars are supported lower bounds, not assumed complete allocations.

## Driver tab: closed, preserved; earlier report corrected

The delivered source workbook actually contains 15 green and 33 red markers on the driver tab. The preceding assistant's claim that its saved tab contained 47 green was false. Round 264 says not to rework that tab, so all its cells are preserved. A fresh independent NET PAY audit of each of the 48 in-scope driver PDFs versus live header values confirms **47 match / 1 differs**, which is the accepted monetary result. It is not the saved-tab marker count.

5812 prints TOTAL DUE **-$50.00**, app header **$1,502.47**. Under the explicitly requested magnitude normalization, variance is **$1,452.47**. Signed cash-direction variance is **$1,552.47**. No all-green requirement is applied and no driver record or worksheet is rewritten.

## 5782 provenance

Flat source `/Users/jorgemunoz/Downloads/Company_Settlement_5782.pdf`, two pages, embedded settlement number 5782, PDF producer FPDF 1.81, creation metadata `D:20260922172719` (timezone unspecified).

macOS `kMDItemWhereFroms` identifies:

`https://awtrack.com/webapp/accounting/settlements/settlementsPDFCompany.php?id=1954504`

and referrer `https://awtrack.com/webapp/`. PDF SHA256 `bc79a1cd4dd878fa1b3e125d538982355e774e5da9999dd2c143352f1b703570`.

The deduped company PDF folder has no 5782 PDF, so byte-for-byte equivalence with that folder cannot be claimed. The PDF's full 400-token text multiset exactly matches the archived `03-SETTLEMENTS/text/Company_Settlement_5782.txt`; differences are extraction ordering only. The archived text is a cross-check; all amounts were read from the PDF.

## Live SQL and output

All reads used `BEGIN READ ONLY; SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls='lucia'; … ROLLBACK;`.

```sql
SELECT id, display_id
FROM accounting.company_settlements
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND status = 'closed' AND voided_at IS NULL
ORDER BY display_id;
```

Output: 48 rows, display IDs 5769 through 5816 inclusive. Driver closed headers: 51, of which 48 carry these numeric/S-prefixed settlement IDs; the other three P-prefixed headers are outside this workbook.

Actual read SQL for exported source records and deployed report invocation are retained in this evidence bundle. The company service was invoked once per returned company-settlement ID, with the scoped company ID, under the same read-only transaction.

Validation: exactly two tabs; company source section sums all reconcile to printed PDF totals; 0 UNKNOWN/N/A app-value rows; 0 out-of-scope settlement rows; driver worksheet cell values unchanged; 794 variance formulas recalculated by LibreOffice with 0 errors and 0 missing formula caches. Expense allocations without source evidence show `—` with their reason. Per-load margin also shows `—`: the PDF and app publish settlement-level margin, and unallocated expense rows prevent a defensible per-load margin. These are explicit source limitations, not invented zeros or assumed agreements.

## Local-work / publication status

Work is isolated on `codex/r264-concept-comparison` in `/tmp/ih35-codex-r264`. The shared checkout contained Cursor's branch and commits; those were not this seat's work and were not pushed or merged by Codex. The report and workbook are being submitted through the normal hooks and fast-merge gate. Publication evidence is appended after the actual command results; no merge/deploy success is implied here.
