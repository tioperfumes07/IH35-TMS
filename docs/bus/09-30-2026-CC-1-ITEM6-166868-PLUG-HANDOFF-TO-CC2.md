# CC-1 → CC-2: Item 6 handoff — the $166,868.94 plug (LEAD RULING 282.7)

Per LEAD RULING 282.7: my lane ends at diagnosis. `banking.*` and `factoring.*` are CC-2's. Not
reversing the JE, not matching any transaction, not touching `banking.*` — handing off and
stopping here.

## 1. The two manual JEs (full line detail, live)

**JE `43d6f4bf-a6ea-4c78-b074-4b1b4a9dcf78`** (entry_date 2026-09-24):
memo: `ACCT-F20260925i TB close: reverse orphan 2100 release; backfill CA issuance DR 1245;
deposit 1090→1000 — deposit Faro Undeposited Funds residual to Operating`
| line | account | debit_or_credit | amount |
|---|---|---|---|
| 1 | 1000 Bank of America - Operating (USMCA) | debit | $166,743.94 |
| 2 | 1090 Undeposited Funds | credit | $166,743.94 |

**JE `36223f47-f279-4993-abb1-e8e8f670a509`** (entry_date 2026-09-24):
memo: `ACCT-F20260925j clear residual Undeposited Funds (escrow-release counterpart after TB close)`
| line | account | debit_or_credit | amount |
|---|---|---|---|
| 1 | 1000 Bank of America - Operating (USMCA) | debit | $125.00 |
| 2 | 1090 Undeposited Funds | credit | $125.00 |

Combined: $166,743.94 + $125.00 = **$166,868.94** — the full plug.

## 2. The 12 real, unmatched Faro wire-in bank_transactions (`review_state='for_review'`)

All USMCA, `is_credit=true`, `voided_at IS NULL`, description `ORIG:FARO FACTORING LLC`:

| bank_transaction_id | date | amount | description |
|---|---|---|---|
| `99ee0ead-498a-476f-8ece-6bb36f86055f` | 2026-08-13 | $3,670.50 | WIRE TYPE:WIRE IN DATE: 260813 TIME:1621 ET TRN:XXXXXXXXXX541462 SEQ:XXXXXXXXXX014182/586893 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `4cded6ac-8b24-4d41-9b09-3b935c0fdf36` | 2026-08-14 | $4,370.24 | WIRE TYPE:WIRE IN DATE: 260814 TIME:1446 ET TRN:XXXXXXXXXX510209 SEQ:XXXXXXXXXX012921/634382 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `a2a8e6f9-46a1-4621-a61f-2afa43247df6` | 2026-08-28 | $21,083.00 | WIRE TYPE:WIRE IN DATE: 260828 TIME:1627 ET TRN:XXXXXXXXXX599748 SEQ:XXXXXXXXXX016771/679680 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `a4360196-e980-40ec-a19a-5c1654a87b63` | 2026-09-08 | $11,342.70 | WIRE TYPE:WIRE IN DATE: 260908 TIME:1645 ET TRN:XXXXXXXXXX900460 SEQ:XXXXXXXXXX021834/028996 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `43ed0cad-c85a-45a4-9171-33a7e84c3903` | 2026-09-11 | $32,097.00 | WIRE TYPE:WIRE IN DATE: 260911 TIME:1639 ET TRN:XXXXXXXXXX581037 SEQ:XXXXXXXXXX026685/630809 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `077ef041-5e67-4dca-991b-b1619d2c72e3` | 2026-09-14 | $21,836.90 | WIRE TYPE:WIRE IN DATE: 260914 TIME:1730 ET TRN:XXXXXXXXXX648616 SEQ:XXXXXXXXXX024060/653221 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `ed3f8b3d-666f-473a-8ccf-17d2621c9710` | 2026-09-17 | $5,653.00 | WIRE TYPE:WIRE IN DATE: 260917 TIME:1512 ET TRN:XXXXXXXXXX510835 SEQ:XXXXXXXXXX019673/573658 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `d6765d8d-6a1a-40cd-b6aa-2d113987451f` | 2026-09-21 | $27,773.98 | WIRE TYPE:WIRE IN DATE: 260921 TIME:1514 ET TRN:XXXXXXXXXX569950 SEQ:XXXXXXXXXX017383/658073 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `88d18886-8404-46ec-b6cc-728fa74df05a` | 2026-09-24 | $15,633.12 | WIRE TYPE:WIRE IN DATE: 260924 TIME:1622 ET TRN:XXXXXXXXXX560855 SEQ:XXXXXXXXXX022731/634755 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `3d85bca5-4e85-4fa5-867b-d760e4a1bbe0` | 2026-09-25 | $19,960.50 | WIRE TYPE:WIRE IN DATE: 260925 TIME:1649 ET TRN:XXXXXXXXXX584336 SEQ:XXXXXXXXXX026404/623898 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `3feba937-1aa5-463b-9ce7-054d404c1024` | 2026-09-25 | $4,161.00 | WIRE TYPE:WIRE IN DATE: 260925 TIME:1717 ET TRN:XXXXXXXXXX596623 SEQ:XXXXXXXXXX027499/629638 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |
| `47092766-0c23-4c7e-8d81-e9b5ba01286e` | 2026-09-28 | $24,347.74 | WIRE TYPE:WIRE IN DATE: 260928 TIME:1357 ET TRN:XXXXXXXXXX624640 SEQ:XXXXXXXXXX018564/706574 ORIG:FARO FACTORING LLC ID:XXXXXXXXXX492558 SND BK:FIFTH THIRD BANK, NA ID:0031 PMT DET:PAYMEN T |

Sum of all 12: **$191,929.68**.

## 3. Arithmetic — the gap, stated plainly

$191,929.68 (sum of the 12 unmatched Faro wires) − $166,868.94 (the plug) = **$25,060.74**.

**I do not know what this $25,060.74 is.** I have not picked a subset of the 12 that happens to
sum closer to $166,868.94, and I am not going to — per the ruling, that would be plugging with
extra steps. The 12 transactions above are the FULL population matching this filter
(`review_state='for_review'`, `is_credit=true`, description `ORIG:FARO FACTORING LLC`, USMCA,
live) — nothing hand-picked out. The $25,060.74 could be: a 13th transaction outside this exact
filter (different description pattern, already `matched` but wrongly, a different account), a
partial/split deposit, fees netted differently, or something else entirely. Determining that is
matching/investigation work on `banking.*`/`factoring.*` — yours, not mine, per this ruling.

## Not done (per the ruling, deliberately)

Did not reverse either JE. Did not match any of the 12 transactions. Did not touch `banking.*` or
`factoring.*`. This document is the full diagnosis; the fix is yours.

— CC-1
