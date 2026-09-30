# A-22 — the 120 unresolved item_ids: report, not resolved

CC-1, 2026-09-30. Per r294c A-22: report only, do not guess a mapping to close the count. A named
unresolved line is honest; a guessed item_id is a lie in the ledger. The owner decides.

## This is a re-delivery, not new analysis

The full pattern analysis, method, and per-group reasoning already exist in
`docs/bus/2026-09-30-CC1-DOCUMENT-INTEGRITY-EXPENSE-LINES-639.md` §4 (merged in PR #23380, before
this ROUND 294 order was issued — the order's own text, "519/639 resolved, 120 left at $4,901.31,"
quotes that doc's numbers directly). Re-verified live today: still exactly **120 rows, $4,901.31**,
unchanged. That doc deferred the full row list to "the live query behind this doc" rather than
printing it — this report supplies the missing literal enumeration.

## Live re-verification

```sql
SELECT count(*) FROM accounting.expense_lines el JOIN accounting.expenses e ON e.id = el.expense_id
WHERE e.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND el.item_id IS NULL
```
→ **120** (matches PR #23380 exactly, no drift).

## Pattern breakdown (same groups as §4 of the source doc)

- **~90 bare "AT settl NNNN #N $X.XX load NNNN inv XXXXXXX — Drv" rows** — no category text, no
  "AT settl" sibling carrying one. Embedded invoice numbers match real `fuel.fuel_transactions`
  rows by reference, but the fuel transaction's own total never equals the line's amount, and some
  references are shared across multiple different fuel_transactions rows (including different
  load_ids) — not a safe 1:1 join. Evidence that WOULD resolve: the original settlement-source PDF
  or driver-submitted receipt for each specific charge, not derivable from any table already in
  the system.
- **7 "Drv — settl NNNN load NNNN" rows** — same shape, no category, no resolvable source. Same
  evidence gap.
- **~17 other named-ambiguous rows** — "AT settl" rows with a load/invoice reference but no category
  ("Drv" suffix with no item detail), 2 "AlwaysTrack...Honda $10.00" driver-paid rows (merchant name
  alone is not a category), 1 "Company expense (settlement 5790) — inv CE-13554" with no category
  anywhere in its text. Evidence needed: same as above, the original source document per line.
- **6 synthetic proof-line rows** (5 AUTH-117/120/122/125/126 $1.00 rows + 1 "CC-2 live-test check"
  $25.00) — not real vendor/driver costs at all; this is the exact overlap with A-23's enumeration
  (see `docs/bus/2026-09-30-CC1-A23-TEST-ROWS-ENUMERATION.md`). These need a different resolution
  path entirely (already void + reversed, per A-23) than a real item_id — they are not a document-
  integrity gap, they are the standing-law test-row issue.

## Full 120-row enumeration (id, amount, expense_number, transaction_date, description)

| id (short) | amount | expense_number | transaction_date | description |
|---|---|---|---|---|
| 41005496 | $49.50 | 13522-5 | 2026-08-20 | AT settl 5784 #10 $49.50 load 13522 inv 042328496 — Drv |
| fbe7ddd9 | $44.63 | 13522-6 | 2026-08-20 | AT settl 5784 #11 $44.63 load 13522 inv 042172057 — Drv |
| 8faf957d | $55.21 | 13522-3 | 2026-08-14 | AT settl 5784 #4 $55.21 load 13522 inv 01040479 — Drv |
| 793b819f | $10.00 | 13531-1 | 2026-08-21 | AT settl 5785 #2 $10.00 load 13531 inv none — Drv |
| 4bd2a319 | $22.00 | 13549-2 | 2026-08-22 | AT settl 5787 #1 $22.00 load 13549 inv 5320194 — Drv |
| 86698093 | $20.80 | 13542-6 | 2026-08-22 | AT settl 5790 #1 $20.80 load 13542 inv none — PAGO DE CRUCE T174 |
| 5e8ad330 | $15.25 | 13565-3 | 2026-08-31 | AT settl 5793 #1 $15.25 load 13565 inv 6243006 — Drv |
| 25d25b4b | $15.25 | 13565-4 | 2026-08-25 | AT settl 5793 #4 $15.25 load 13565 inv 2047749 — Drv |
| 93dae002 | $11.76 | 13565-5 | 2026-08-24 | AT settl 5793 #5 $11.76 load 13565 inv none — Drv |
| 5c0955a3 | $49.32 | 13558-12 | 2026-08-31 | AT settl 5794 #12 $49.32 load 13558 inv 11012948 — Drv |
| 082a1658 | $30.30 | 13558-8 | 2026-08-29 | AT settl 5794 #5 $30.30 load 13558 inv 2885954 — Drv |
| 76639361 | $22.14 | 13558-9 | 2026-08-29 | AT settl 5794 #6 $22.14 load 13558 inv 4110126 — Drv |
| 5ef2d544 | $37.63 | 13569-8 | 2026-09-02 | AT settl 5797 #5 $37.63 load 13569 inv 1546106 — Drv |
| 5b810533 | $30.30 | 13551-15 | 2026-08-29 | AT settl 5800 #3 $30.30 load 13551 inv 2885953 — Drv |
| e4ac93cf | $67.84 | 13508-4 | 2026-08-07 | ATGTx settl 5769 #1 $67.84 load 13508 inv 2870483 |
| e38ce215 | $30.71 | 13503-2 | 2026-08-05 | ATGTx settl 5770 #1 $30.71 load 13503 inv 99301244 |
| 2d83143a | $37.10 | 13503-3 | 2026-08-06 | ATGTx settl 5770 #2 $37.10 load 13503 inv 99442334 |
| f2ff3cea | $37.24 | 13503-4 | 2026-08-09 | ATGTx settl 5770 #3 $37.24 load 13503 inv 99444239 |
| b7995b4f | $40.02 | 13504-2 | 2026-08-05 | ATGTx settl 5771 #1 $40.02 load 13504 inv 99083185 |
| 14e7efda | $41.68 | 13504-3 | 2026-08-06 | ATGTx settl 5771 #2 $41.68 load 13504 inv 99442342 |
| a02cebb5 | $34.21 | 13510-6 | 2026-08-09 | ATGTx settl 5771 #3 $34.21 load 13510 inv 99444242 |
| d3c76f4f | $36.43 | 13510-7 | 2026-08-10 | ATGTx settl 5771 #4 $36.43 load 13510 inv 99518851 |
| f9a88b69 | $66.05 | 13502-2 | 2026-08-03 | ATGTx settl 5772 #1 $66.05 load 13502 inv 1910313 |
| 0a8e75e1 | $67.22 | 13512-3 | 2026-08-10 | ATGTx settl 5772 #2 $67.22 load 13512 inv 99975493 |
| f8276bb6 | $41.14 | 13513-2 | 2026-08-11 | ATGTx settl 5772 #3 $41.14 load 13513 inv 99014843 |
| 997131fe | $15.25 | 13502-3 | 2026-08-13 | ATGTx settl 5772 #4 $15.25 load 13502 inv none |
| 99d898d5 | $24.12 | 13497-2 | 2026-08-04 | ATGTx settl 5773 #1 $24.12 load 13497 inv 99513946 |
| 647fddca | $51.17 | 13497-3 | 2026-08-05 | ATGTx settl 5773 #2 $51.17 load 13497 inv 1235975 |
| e529231c | $44.96 | 13497-4 | 2026-08-07 | ATGTx settl 5773 #3 $44.96 load 13497 inv 99564446 |
| 4995f72f | $38.93 | 13511-6 | 2026-08-08 | ATGTx settl 5773 #4 $38.93 load 13511 inv 99061371 |
| 83da05ef | $37.76 | 13511-7 | 2026-08-10 | ATGTx settl 5773 #5 $37.76 load 13511 inv 99886347 |
| c573e430 | $5.32 | 13517-5 | 2026-08-07 | ATGTx settl 5774 #1 $5.32 load 13517 inv 9982105 |
| ea445eeb | $32.07 | 13517-6 | 2026-08-09 | ATGTx settl 5774 #2 $32.07 load 13517 inv 99462767 |
| fac69049 | $45.47 | 13517-7 | 2026-08-07 | ATGTx settl 5774 #3 $45.47 load 13517 inv 01049493 |
| 8e211e49 | $18.70 | 13518-9 | 2026-08-12 | ATGTx settl 5774 #4 $18.70 load 13518 inv 99121316 |
| 783a517b | $70.00 | 13517-8 | 2026-08-12 | ATGTx settl 5774 #5 $70.00 load 13517 inv 01011813 |
| 13b5c2c9 | $1,084.80 | 13517-9 | 2026-08-12 | ATGTx settl 5774 #6 $1084.80 load 13517 inv none |
| b36c605a | $34.39 | 13506-6 | 2026-08-05 | ATGTx settl 5775 #1 $34.39 load 13506 inv 1911564 |
| c78b1c03 | $14.72 | 13506-7 | 2026-08-06 | ATGTx settl 5775 #2 $14.72 load 13506 inv 99515499 |
| 9d53ec44 | $15.25 | 13506-8 | 2026-08-06 | ATGTx settl 5775 #3 $15.25 load 13506 inv 1360475 |
| 3d393425 | $38.55 | 13506-9 | 2026-08-08 | ATGTx settl 5775 #4 $38.55 load 13506 inv 99648329 |
| d2153fbd | $24.40 | 13514-10 | 2026-08-11 | ATGTx settl 5775 #5 $24.40 load 13514 inv 2402527 |
| c7aca293 | $24.88 | 13514-11 | 2026-08-12 | ATGTx settl 5775 #6 $24.88 load 13514 inv 6092647 |
| e6291e9f | $15.25 | 13506-10 | 2026-08-10 | ATGTx settl 5775 #7 $15.25 load 13506 inv 2066083 |
| 8604cfad | $15.25 | 13506-11 | 2026-08-13 | ATGTx settl 5775 #8 $15.25 load 13506 inv 1597129 |
| f6854df8 | $58.71 | 13505-5 | 2026-08-05 | ATGTx settl 5776 #1 $58.71 load 13505 inv 2876136 |
| cadd72b0 | $5.25 | 13505-11 | 2026-08-14 | ATGTx settl 5776 #10 $5.25 load 13505 inv 40016373 |
| 08cbe94f | $5.25 | 13505-6 | 2026-08-05 | ATGTx settl 5776 #2 $5.25 load 13505 inv 2876169 |
| de46ccff | $15.25 | 13505-7 | 2026-08-05 | ATGTx settl 5776 #3 $15.25 load 13505 inv 2876154 |
| 7d1dcc36 | $57.56 | 13515-12 | 2026-08-09 | ATGTx settl 5776 #4 $57.56 load 13515 inv 99822323 |
| f910de2f | $50.82 | 13515-13 | 2026-08-12 | ATGTx settl 5776 #5 $50.82 load 13515 inv 99106176 |
| 2c37fac6 | $20.17 | 13515-14 | 2026-08-13 | ATGTx settl 5776 #6 $20.17 load 13515 inv 99887970 |
| 477c9aeb | $5.25 | 13505-8 | 2026-08-11 | ATGTx settl 5776 #7 $5.25 load 13505 inv 1295098 |
| 709fea4a | $15.25 | 13505-9 | 2026-08-11 | ATGTx settl 5776 #8 $15.25 load 13505 inv 1295089 |
| 59a3b30b | $15.25 | 13505-10 | 2026-08-14 | ATGTx settl 5776 #9 $15.25 load 13505 inv 39016214 |
| 51c09a51 | $47.45 | 13519-3 | 2026-08-13 | ATGTx settl 5777 #1 $47.45 load 13519 inv 99448116 |
| 02993abd | $32.90 | 13521-5 | 2026-08-15 | ATGTx settl 5777 #2 $32.90 load 13521 inv 99450055 |
| f66d2b05 | $20.20 | 13524-6 | 2026-08-13 | ATGTx settl 5778 #1 $20.20 load 13524 inv 99694065 |
| cbce1a15 | $18.00 | 13524-7 | 2026-08-14 | ATGTx settl 5778 #2 $18.00 load 13524 inv none |
| 928a22ac | $32.98 | 13524-8 | 2026-08-16 | ATGTx settl 5778 #3 $32.98 load 13524 inv 99366495 |
| 58cef730 | $15.25 | 13524-9 | 2026-08-08 | ATGTx settl 5778 #4 $15.25 load 13524 inv 1842133 |
| 22bebe4b | $17.21 | 13524-10 | 2026-08-08 | ATGTx settl 5778 #5 $17.21 load 13524 inv 99517553 |
| 25819d51 | $30.17 | 13524-11 | 2026-08-10 | ATGTx settl 5778 #6 $30.17 load 13524 inv 99418954 |
| d90e05c0 | $27.37 | 13526-4 | 2026-08-17 | ATGTx settl 5779 #1 $27.37 load 13526 inv 99264345 |
| e8e5fd9c | $15.25 | 13526-5 | 2026-08-17 | ATGTx settl 5779 #2 $15.25 load 13526 inv 2027277 |
| 106fa736 | $21.27 | 13526-6 | 2026-08-19 | ATGTx settl 5779 #3 $21.27 load 13526 inv 99291854 |
| 786b9879 | $47.91 | 13527-2 | 2026-08-14 | ATGTx settl 5779 #4 $47.91 load 13527 inv 2880342 |
| 06e3e950 | $30.96 | 13527-3 | 2026-08-16 | ATGTx settl 5779 #5 $30.96 load 13527 inv 1132371 |
| a2647606 | $48.71 | 13530-4 | 2026-08-18 | ATGTx settl 5780 #1 $48.71 load 13530 inv 00040979 |
| 94b35755 | $49.50 | 13522-13 | 2026-08-20 | ATGTx settl 5784 #10 $49.50 load 13522 inv 042328496 |
| e64fbbd2 | $44.63 | 13522-14 | 2026-08-20 | ATGTx settl 5784 #11 $44.63 load 13522 inv 042172057 |
| a67e620d | $55.21 | 13522-11 | 2026-08-14 | ATGTx settl 5784 #4 $55.21 load 13522 inv 01040479 |
| 9a9fdbed | $10.00 | 13531-3 | 2026-08-21 | ATGTx settl 5785 #2 $10.00 load 13531 inv none |
| 3ab17e66 | $22.00 | 13549-7 | 2026-08-22 | ATGTx settl 5787 #1 $22.00 load 13549 inv 5320194 |
| 7f0928bd | $20.80 | 13542-10 | 2026-08-22 | ATGTx settl 5790 #1 $20.80 load 13542 inv none |
| 49c55505 | $15.25 | 13565-8 | 2026-08-31 | ATGTx settl 5793 #1 $15.25 load 13565 inv 6243006 |
| e4aa1266 | $15.25 | 13565-9 | 2026-08-25 | ATGTx settl 5793 #4 $15.25 load 13565 inv 2047749 |
| e05b0c61 | $11.76 | 13565-10 | 2026-08-24 | ATGTx settl 5793 #5 $11.76 load 13565 inv none |
| 2fca89ff | $49.32 | 13558-21 | 2026-08-31 | ATGTx settl 5794 #12 $49.32 load 13558 inv 11012948 |
| 9d0726b9 | $22.14 | 13558-14 | 2026-08-29 | ATGTx settl 5794 #2 $22.14 load 13558 inv 4110126 |
| f5f61b48 | $30.30 | 13558-17 | 2026-08-29 | ATGTx settl 5794 #5 $30.30 load 13558 inv 2885954 |
| 9f9dee70 | $22.14 | 13558-18 | 2026-08-29 | ATGTx settl 5794 #6 $22.14 load 13558 inv 4110126 |
| c6a1ec8c | $37.88 | 13577-3 | 2026-09-03 | ATGTx settl 5797 #1 $37.88 load 13577 inv 1343482 |
| c06de7f3 | $3.09 | 13577-4 | 2026-09-06 | ATGTx settl 5797 #2 $3.09 load 13577 inv 99506013 |
| 586f646a | $37.63 | 13569-11 | 2026-09-02 | ATGTx settl 5797 #5 $37.63 load 13569 inv 1546106 |
| bff0f8a1 | $25.58 | 13572-3 | 2026-09-02 | ATGTx settl 5798 #1 $25.58 load 13572 inv 2888318 |
| 91cb487c | $25.78 | 13572-4 | 2026-09-03 | ATGTx settl 5798 #2 $25.78 load 13572 inv 99463584 |
| 731b0021 | $70.61 | 13571-1 | 2026-08-31 | ATGTx settl 5799 #1 $70.61 load 13571 inv 99794138 |
| 9280384c | $34.72 | 13571-2 | 2026-09-03 | ATGTx settl 5799 #2 $34.72 load 13571 inv 99144063 |
| 60760fa7 | $21.73 | 13571-3 | 2026-09-03 | ATGTx settl 5799 #3 $21.73 load 13571 inv 99466323 |
| 7ee2fd6f | $531.26 | 13571-4 | 2026-09-06 | ATGTx settl 5799 #4 $531.26 load 13571 inv 8031921 |
| e0c5aa03 | $30.30 | 13551-20 | 2026-08-29 | ATGTx settl 5800 #3 $30.30 load 13551 inv 2885953 |
| 54a99fc8 | $19.56 | 13570 | 2026-09-02 | ATGTx settl 5801 #1 $19.56 load 13570 inv 99407022 |
| 12171edd | $14.69 | 13570-1 | 2026-09-02 | ATGTx settl 5801 #2 $14.69 load 13570 inv 99143994 |
| 79fa3a3a | $15.25 | 13570-2 | 2026-09-01 | ATGTx settl 5801 #3 $15.25 load 13570 inv 2050188 |
| d1c61e66 | $5.25 | 13570-3 | 2026-09-01 | ATGTx settl 5801 #4 $5.25 load 13570 inv 1926967 |
| 2571e87f | $9.97 | 13580 | 2026-09-09 | ATGTx settl 5801 #5 $9.97 load 13580 inv 99150047 |
| 06c9e6e3 | $40.00 | 13570-4 | 2026-09-09 | ATGTx settl 5801 #6 $40.00 load 13570 inv 99877734 |
| 8599aa80 | $15.25 | 13570-5 | 2026-09-08 | ATGTx settl 5801 #7 $15.25 load 13570 inv 1129293 |
| c0485dc1 | $10.00 | 13579-3 | 2026-09-05 | ATGTx settl 5802 #1 $10.00 load 13579 inv 38031247 |
| cba1d062 | $38.30 | 13579-4 | 2026-09-08 | ATGTx settl 5802 #2 $38.30 load 13579 inv 99034356 |
| 31b82583 | $19.18 | 13589 | 2026-09-10 | ATGTx settl 5802 #3 $19.18 load 13589 inv 99471354 |
| 0a69b63d | $30.11 | 13589-1 | 2026-09-10 | ATGTx settl 5802 #4 $30.11 load 13589 inv 99186757 |
| bf2fa4a7 | $24.99 | 13579-5 | 2026-09-08 | ATGTx settl 5802 #5 $24.99 load 13579 inv 2181543 |
| bcd206af | $1.00 | NULL | 2026-09-28 | AUTH-117 proof line $1.00 |
| 03acd9a5 | $1.00 | NULL | 2026-09-28 | AUTH-120 proof line $1.00 |
| b628c340 | $1.00 | NULL | 2026-09-28 | AUTH-122 print-path $1.00 |
| 1f717c3b | $1.00 | NULL | 2026-09-29 | AUTH-125 R222 chain $1.00 |
| 3d38acc5 | $1.00 | NULL | 2026-09-29 | AUTH-126 R224 chain $1.00 |
| dc551610 | $10.00 | 13582-4 | 2026-09-08 | AlwaysTrack settl 5805 Honda $10.00 load 13582 LOVES inv 16049982 (driver-paid, Cr 2175) |
| 15f80f5d | $10.00 | 13597-4 | 2026-09-12 | AlwaysTrack settl 5808 Honda $10.00 load 13597 ROAD RANGER inv 00034608 (driver-paid, Cr 2175) |
| d7979694 | $25.00 | NULL | 2026-09-28 | CC-2 live-test check |
| 43b22f28 | $20.80 | 13554 | 2026-08-31 | Company expense (settlement 5790) — inv CE-13554 — $20.80 (settlement 5790) |
| 7e805a78 | $15.25 | 13502-1 | 2026-08-13 | Drv — settl 5772 load 13502 |
| 0eafe86b | $70.00 | 13517-4 | 2026-08-12 | Drv — settl 5774 load 13517 |
| 7d3133c1 | $45.47 | 13517-1 | 2026-08-07 | Drv — settl 5774 load 13517 |
| 32748267 | $15.25 | 13506-3 | 2026-08-10 | Drv — settl 5775 load 13506 |
| 08f4e5b4 | $15.25 | 13505-4 | 2026-08-05 | Drv — settl 5776 load 13505 |
| 671b21ad | $5.25 | 13505-3 | 2026-08-05 | Drv — settl 5776 load 13505 |
| e4c9fc86 | $15.25 | 13524-4 | 2026-08-08 | Drv — settl 5778 load 13524 |

## Total

**120 rows, $4,901.31.** Not resolved here. Not guessed. No item_id assigned.
