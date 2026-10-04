# CC-3 → Lead — the four DEF rows: what the SIGNED settlements say (for your ruling) — 2026-10-04

Source read: Company_Settlement_5770 / 5794 (signed PDFs, ~/Downloads/Settlements; text at
03-SOURCE-DOCUMENTS/settlement-text). Nothing moved.

## CORRECTION FIRST — I was wrong about the receipt numbers
I said the settlement lines "print no receipt number". That came from feed_input.json, which DROPPED the Invoice column.
The signed documents print one on every DEF line. AUTH-212/214 set the reference and memo to BLANK — blank is now
LESS true than the source. Recommend: write the printed receipt numbers (below) — your ruling.

## Signed document vs TMS
| TMS row | TMS load / date / ref | Signed: date | Signed: Invoice | Signed: whose load (same receipt's diesel line) |
|---|---|---|---|---|
| 6171784d $30.71 | 13509 / 08-10 / blank | **2026-08-05** | **99301244** | **13503** (diesel b5124f36 on 13503, same receipt) |
| 9b2b027e $37.10 | 13509 / 08-10 / blank | **2026-08-06** | **99442334** | **13503** (diesel 9c98b123 on 13503, same receipt) |
| 24b04710 $37.24 | 13509 / 08-10 / blank | **2026-08-09** | **99444239** | 13509 (its fuel line prints 9944239 — one digit short on the source itself) |
| 0f1bb337 $30.30 | 13568 / 09-03 / blank | **2026-08-29** | **2885954** | **13558** (Driver_Settlement_5794: "Load 13558 LOVES Driver Reimbursement-Fuel-Def 30.30") |

Also on 5794 and NOT IN TMS at all: DEF **$17.99** 08-29 inv 99602755 and DEF **$17.29** 08-30 inv 99912182
(load 13558 — their diesel lines 66f765d3 / e0c667fe are in TMS on 13558).

## Which side is the defect
The SOURCE supports the document dates, receipts and loads; the TMS rows are the defect. The WRITER:
scripts/feed/feed-settlement-day.mts. Today it dates fuel by `documentLineDate()` (R-177, the document purchase date) —
these four rows were written 09-24, before R-177, when it stamped the period date. Two defects remain in the writer:
(1) its input (feed_input.json) carries no Invoice column, so it could never write the receipt; (2) it assigns every
fuel line of a settlement record to that record's load, but the EXPENSES section is not per-load — the receipt ties a
DEF line to the load whose fuel section carries the same receipt.

## Recommendation (needs your ruling — dates drive period)
1. Writer: read Invoice from the settlement text into the feed input; attach a DEF line to the load whose fuel section
   carries the same receipt; refuse (not guess) when no receipt matches. Guard + selftest on 5770/5794.
2. Rows: date, receipt and load corrected to the signed document — through the engine (void + re-create, since load and
   date change period/GL), dry run first, own AUTH.
3. The two missing DEF fills ($17.99, $17.29 on 13558) created through the same path.
