# 2410 Owner / Related-Party Loan Payable — the 50 bank lines, for the owner and Martin to assign (2026-10-08)

Every line below is on **2410** (parent). None is re-coded to the four sub-accounts (2410-00-001 Jorge Pablo Guadalupe Muñoz Gonzalez, -002 Scentsx, -003 Tio Perfumes 2, -004 Laura Muñoz) — which person each belongs to is the owner's knowledge (Lead 441.16 #4).

- **IN** = money received (credited 2410). The 20 IN lines are DEPOSIT documents (DEP-…) created by the ROUND 441.5 conversion; ruling pending on whether they stay (see OUTBOX).
- **OUT** = money paid (debited 2410). The 30 OUT lines are CHAIN-05 row A″ journal entries, Dr 2410 / Cr 1000 — correct as posted.
- Net: 2410 carries a **$22,130.00 DEBIT** = OUT $53,985.00 − IN $31,855.00: more paid out to the related parties than received from them. Not a posting error — the entries are balanced and on the right sides. Either some OUT lines are not loan repayments (e.g. owner draws → 3000, or expenses), or loan receipts exist that are not categorized yet. One candidate: **2025-12-12 $2,775.00** "Online transfer from CHK 9779 … OAK S" — categorized to 2410 then reversed by Martin on 2026-10-06 21:24; it sits in For review uncategorized.

```
SET
dir | transaction_date | amount | doc | description
IN | 2026-01-30 | 400.00 | DEP-2026-00011 | Mobile transfer from CHK 4098 Confirmation# yuls47hea; MUNOZ, JORGE
IN | 2026-03-31 | 2,100.00 | DEP-2026-00002 | Mobile transfer from CHK 4098 Confirmation# y64hn1g65; MUNOZ, JORGE
IN | 2026-04-14 | 300.00 | DEP-2026-00001 | Online transfer from CHK 2080 Confirmation# d3veahbj0; SCENTSX LLC
IN | 2026-04-30 | 100.00 | DEP-2026-00006 | Mobile transfer from CHK 4098 Confirmation# scqttup62; MUNOZ, JORGE
IN | 2026-05-06 | 500.00 | DEP-2026-00010 | Mobile transfer from CHK 4098 Confirmation# u9fu1b4ng; MUNOZ, JORGE
IN | 2026-05-13 | 600.00 | DEP-2026-00019 | Mobile transfer from CHK 4098 Confirmation# whsq20aw3; MUNOZ, JORGE
IN | 2026-05-26 | 300.00 | DEP-2026-00008 | Mobile transfer from CHK 2080 Confirmation# c7fopz1cn; SCENTSX LLC
IN | 2026-05-28 | 400.00 | DEP-2026-00012 | Mobile transfer from CHK 2080 Confirmation# fjifp8seo; SCENTSX LLC
IN | 2026-06-02 | 450.00 | DEP-2026-00015 | Mobile transfer from CHK 4098 Confirmation# vak3t40fb; MUNOZ, JORGE
IN | 2026-06-08 | 755.00 | DEP-2026-00016 | Mobile transfer from CHK 4098 Confirmation# sn49yjx9w; MUNOZ, JORGE
IN | 2026-06-24 | 5,000.00 | DEP-2026-00022 | Mobile transfer from CHK 2080 Confirmation# fd9mlt6jy; SCENTSX LLC
IN | 2026-07-21 | 2,000.00 | DEP-2026-00004 | Mobile transfer from CHK 2080 Confirmation# ahx5rnbih; SCENTSX LLC
IN | 2026-07-27 | 50.00 | DEP-2026-00017 | Mobile transfer from CHK 2080 Confirmation# hg2u5vias; SCENTSX LLC
IN | 2026-07-28 | 4,900.00 | DEP-2026-00014 | Online transfer from CHK 2080 Confirmation# l4yfuhrhr; SCENTSX LLC
IN | 2026-08-14 | 2,000.00 | DEP-2026-00007 | Zelle payment from LAURA MUNOZ Conf# bygt5bq7w
IN | 2026-08-21 | 3,000.00 | DEP-2026-00020 | Mobile transfer from CHK 4098 Confirmation# sqdk7u81d; MUNOZ, JORGE
IN | 2026-08-25 | 3,500.00 | DEP-2026-00013 | Zelle payment from LAURA MUNOZ Conf# il32pq04a
IN | 2026-09-23 | 500.00 | DEP-2026-00018 | Online transfer from CHK 2080 Confirmation# chjhr3hco; SCENTSX LLC
IN | 2026-10-01 | 3,000.00 | DEP-2026-00005 | Zelle payment from LAURA MUNOZ for "Diesel Veon"; Conf# b976fa232
IN | 2026-10-02 | 2,000.00 | DEP-2026-00021 | Zelle payment from LAURA MUNOZ Conf# iumxabc6b
OUT | 2026-04-06 | 2,050.00 | JE | Online transfer to CHK 4098 Confirmation# xbrdwbo85; Munoz
OUT | 2026-06-26 | 1,000.00 | JE | Zelle payment to Laura Munoz Conf# z280owv82
OUT | 2026-07-07 | 100.00 | JE | Zelle payment to Laura Munoz Conf# xgecyxbga
OUT | 2026-07-10 | 85.00 | JE | Mobile transfer to CHK 4098 Confirmation# ys054lx4s; Munoz
OUT | 2026-07-22 | 2,000.00 | JE | Returned: Mobile transfer from CHK 2080 Confirmation# ahx5rnbih; SCENTSX LLC
OUT | 2026-08-21 | 800.00 | JE | Zelle payment to Laura Munoz Conf# wz0vni12c
OUT | 2026-08-24 | 1,000.00 | JE | Zelle payment to Laura Munoz Conf# tw7ptx3qh
OUT | 2026-08-26 | 250.00 | JE | Zelle payment to Laura Munoz Conf# w1a8z8sb7
OUT | 2026-09-04 | 3,000.00 | JE | Zelle payment to Laura Munoz Conf# yv4xqxs4y
OUT | 2026-09-08 | 3,000.00 | JE | Zelle payment to Laura Munoz Conf# texmy6rp4
OUT | 2026-09-08 | 1,000.00 | JE | Zelle payment to Laura Munoz Conf# z97489gcx
OUT | 2026-09-08 | 3,000.00 | JE | Zelle payment to Laura Munoz Conf# tt9ptt2bs
OUT | 2026-09-08 | 1,000.00 | JE | Zelle payment to Laura Munoz Conf# z7qxpglgr
OUT | 2026-09-08 | 1,000.00 | JE | Zelle payment to Laura Munoz Conf# vtzm6nq17
OUT | 2026-09-09 | 6,000.00 | JE | Zelle payment to Laura Munoz Conf# yt4mied1l
OUT | 2026-09-10 | 4,500.00 | JE | Zelle payment to Laura Munoz Conf# u8rne1gag
OUT | 2026-09-14 | 1,000.00 | JE | Zelle payment to Laura Munoz Conf# uwz3vkquf
OUT | 2026-09-18 | 2,000.00 | JE | Zelle payment to Laura Munoz Conf# zic7jk4um
OUT | 2026-09-21 | 600.00 | JE | CITI CARD ONLINE DES:PAYMENT ID:XXXXXXXXXX02168 INDN:LAURA Y MUNOZ CO ID:CITICTP
OUT | 2026-09-21 | 3,000.00 | JE | Zelle payment to Laura Munoz Conf# tskow4uuu
OUT | 2026-09-24 | 200.00 | JE | Zelle payment to Laura Munoz Conf# tr9v1rfpf
OUT | 2026-09-24 | 400.00 | JE | Online transfer to CHK 4098 Confirmation# swa25il01; Munoz
OUT | 2026-09-24 | 600.00 | JE | Mobile transfer to CHK 4098 Confirmation# v2evn4x8q; Munoz
OUT | 2026-09-24 | 700.00 | JE | Mobile transfer to CHK 4098 Confirmation# vk30c7kvr; Munoz
OUT | 2026-09-25 | 750.00 | JE | Zelle payment to Laura Munoz Conf# xah9k9o4v
OUT | 2026-09-29 | 100.00 | JE | Zelle payment to Laura Munoz Conf# xyb46pegc
OUT | 2026-09-30 | 200.00 | JE | Zelle payment to Laura Munoz Conf# s96kd8lun
OUT | 2026-10-02 | 5,200.00 | JE | Online transfer to CHK 4098 Confirmation# u4vb1ticf; Munoz
OUT | 2026-10-05 | 5,450.00 | JE | Mobile transfer to CHK 4098 Confirmation# z8f9mq3v0; Munoz
OUT | 2026-10-07 | 4,000.00 | JE | ZELLE PAYMENT TO Laura Munoz
```
