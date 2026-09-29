# Factoring-advance duplicate-JE comparison — 25 groups, 53 JE rows, 28 excess copies

**For owner review: pick the surviving copy per group below, then the voids run, then the $39,108 sweep, then the threshold change.**

Every group differs between copies (fingerprinted by account:side:amount, per independent verification) —
"void the duplicate" is undefined without a human picking which copy is correct. No voids have been run.

**18 of 25 groups** differ only in how the wire/factoring fee splits between account 6300 (Bank
Service Charges & Wire Fees) and 6400 (Factoring Fees) — the core money lines (1090 Undeposited
Funds, 1230 Factoring Reserves, 2150 Factoring Advance liability) are byte-identical between
copies in these. Later copies consistently carry an explicit $10.00 line in 6300 that earlier
copies fold into 6400 instead — looks like a fee-categorization fix that got re-run without voiding
the original, not a money amount correction.

**7 of 25 groups need closer owner attention because a CORE money line differs, not just the fee
split:** Group 7, Group 8, Group 12, Group 14, Group 19, Group 21, Group 23. Flagging Group 8
specifically — its `factoring_advances.advance_amount_cents` is $0.00 on record (no invoice number
either), and one copy posts the full $582.00 to **6300 Bank Service Charges** (an expense account)
while the other posts that same $582.00 to **1090 Undeposited Funds** (the cash-clearing asset
account) — one of these two copies is posting real deposit money to the wrong account entirely,
independent of the duplication question.

---
### Group 1 — invoice 71 — fa_id `1599162c-8fc8-479f-ae16-f66a243b5c11` — 2 copies

advance_amount_cents on record: $5325.00 | entry_date: 2026-09-14

| Account | Copy 1 (2026-09-24 23:01 UTC) | Copy 2 (2026-09-25 23:09 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $5325.00 | Dr $5325.00 |
| 1230 Factoring Reserves | Dr $82.50 | Dr $82.50 |
| 2150 Factoring Advance | Cr $5500.00 | Cr $5500.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $92.50** | **Dr $82.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 2 — invoice 64 — fa_id `24052c2c-9095-4239-8aa2-0b7598dc2b2e` — 2 copies

advance_amount_cents on record: $4743.00 | entry_date: 2026-09-11

| Account | Copy 1 (2026-09-24 23:01 UTC) | Copy 2 (2026-09-25 23:08 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $4743.00 | Dr $4743.00 |
| 1230 Factoring Reserves | Dr $73.50 | Dr $73.50 |
| 2150 Factoring Advance | Cr $4900.00 | Cr $4900.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $83.50** | **Dr $73.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 3 — invoice 21 — fa_id `27e4edc0-048f-46dd-bc16-52662fd3cacf` — 2 copies

advance_amount_cents on record: $3191.00 | entry_date: 2026-08-24

| Account | Copy 1 (2026-09-24 01:59 UTC) | Copy 2 (2026-09-25 23:07 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $3191.00 | Dr $3191.00 |
| 1230 Factoring Reserves | Dr $49.50 | Dr $49.50 |
| 2150 Factoring Advance | Cr $3300.00 | Cr $3300.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $59.50** | **Dr $49.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 4 — invoice 19 — fa_id `31f8630a-95a9-4b24-bf78-4d0910e55d14` — 2 copies

advance_amount_cents on record: $3385.00 | entry_date: 2026-08-19

| Account | Copy 1 (2026-09-24 01:39 UTC) | Copy 2 (2026-09-25 23:06 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $3385.00 | Dr $3385.00 |
| 1230 Factoring Reserves | Dr $52.50 | Dr $52.50 |
| 2150 Factoring Advance | Cr $3500.00 | Cr $3500.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $62.50** | **Dr $52.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 5 — invoice 1 — fa_id `4c4a8f23-1975-4235-8d22-14175a69db7a` — 2 copies

advance_amount_cents on record: $3482.00 | entry_date: 2026-08-11

| Account | Copy 1 (2026-09-23 22:07 UTC) | Copy 2 (2026-09-25 23:06 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $3482.00 | Dr $3482.00 |
| 1230 Factoring Reserves | Dr $54.00 | Dr $54.00 |
| 2150 Factoring Advance | Cr $3600.00 | Cr $3600.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $64.00** | **Dr $54.00** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 6 — invoice 41 — fa_id `5207bfad-87f1-4441-9489-10f4674f4e34` — 2 copies

advance_amount_cents on record: $3385.00 | entry_date: 2026-08-28

| Account | Copy 1 (2026-09-24 02:42 UTC) | Copy 2 (2026-09-25 23:07 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $3385.00 | Dr $3385.00 |
| 1230 Factoring Reserves | Dr $52.50 | Dr $52.50 |
| 2150 Factoring Advance | Cr $3500.00 | Cr $3500.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $62.50** | **Dr $52.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 7 — invoice 4 — fa_id `5985201f-b957-4db8-8985-9792d0dc8b6b` — 3 copies

advance_amount_cents on record: $1639.00 | entry_date: 2026-08-12

| Account | Copy 1 (2026-09-23 22:16 UTC) | Copy 2 (2026-09-25 23:06 UTC) | Copy 3 (2026-09-26 04:13 UTC) |
|---|---|---|---|
| 1090 Undeposited Funds | Dr $1639.00 | Dr $1639.00 | Dr $1639.00 |
| 1230 Factoring Reserves | **Dr $25.50** | **Dr $25.50** | **—** |
| 1235 Faro Cash Reserve | **—** | **—** | **Dr $25.50** |
| 2150 Factoring Advance | Cr $1700.00 | Cr $1700.00 | Cr $1700.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $35.50** | **Dr $25.50** | **Dr $25.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 8 — invoice (none) — fa_id `5e38e177-02b5-4d39-841c-b7492781eb9f` — 2 copies

advance_amount_cents on record: $0.00 | entry_date: 2026-09-03

| Account | Copy 1 (2026-09-24 20:59 UTC) | Copy 2 (2026-09-28 16:18 UTC) |
|---|---|---|
| 1090 Undeposited Funds | **—** | **Dr $582.00** |
| 1230 Factoring Reserves | Dr $9.00 | Dr $9.00 |
| 2150 Factoring Advance | Cr $600.00 | Cr $600.00 |
| 6300 Bank Service Charges & Wire Fees | **Dr $582.00** | **—** |
| 6400 Factoring Fees | Dr $9.00 | Dr $9.00 |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 9 — invoice 33 — fa_id `5eb7dc10-9784-4479-8e32-530469eee480` — 2 copies

advance_amount_cents on record: $2221.00 | entry_date: 2026-08-28

| Account | Copy 1 (2026-09-24 02:15 UTC) | Copy 2 (2026-09-25 23:07 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $2221.00 | Dr $2221.00 |
| 1230 Factoring Reserves | Dr $34.50 | Dr $34.50 |
| 2150 Factoring Advance | Cr $2300.00 | Cr $2300.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $44.50** | **Dr $34.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 10 — invoice 27 — fa_id `6059a238-b5ee-4e86-9ac5-80202f6deb7d` — 2 copies

advance_amount_cents on record: $2415.00 | entry_date: 2026-08-26

| Account | Copy 1 (2026-09-24 02:07 UTC) | Copy 2 (2026-09-25 23:07 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $2415.00 | Dr $2415.00 |
| 1230 Factoring Reserves | Dr $37.50 | Dr $37.50 |
| 2150 Factoring Advance | Cr $2500.00 | Cr $2500.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $47.50** | **Dr $37.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 11 — invoice 12 — fa_id `69d515e1-4ebc-45d6-a280-2db5b674225c` — 2 copies

advance_amount_cents on record: $3870.00 | entry_date: 2026-08-14

| Account | Copy 1 (2026-09-24 01:25 UTC) | Copy 2 (2026-09-25 23:06 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $3870.00 | Dr $3870.00 |
| 1230 Factoring Reserves | Dr $60.00 | Dr $60.00 |
| 2150 Factoring Advance | Cr $4000.00 | Cr $4000.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $70.00** | **Dr $60.00** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 12 — invoice 16 — fa_id `93c0d5b0-480c-4def-9ba6-ceffec6f5de8` — 3 copies

advance_amount_cents on record: $3676.00 | entry_date: 2026-08-18

| Account | Copy 1 (2026-09-24 12:58 UTC) | Copy 2 (2026-09-25 23:08 UTC) | Copy 3 (2026-09-26 04:16 UTC) |
|---|---|---|---|
| 1090 Undeposited Funds | Dr $3676.00 | Dr $3676.00 | Dr $3676.00 |
| 1230 Factoring Reserves | **Dr $57.00** | **Dr $57.00** | **—** |
| 1235 Faro Cash Reserve | **—** | **—** | **Dr $57.00** |
| 2150 Factoring Advance | Cr $3800.00 | Cr $3800.00 | Cr $3800.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $67.00** | **Dr $57.00** | **Dr $57.00** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 13 — invoice 82 — fa_id `9b71a066-292c-43f9-bd35-1b53390c32e1` — 2 copies

advance_amount_cents on record: $4743.00 | entry_date: 2026-09-18

| Account | Copy 1 (2026-09-24 23:01 UTC) | Copy 2 (2026-09-25 23:09 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $4743.00 | Dr $4743.00 |
| 1230 Factoring Reserves | Dr $73.50 | Dr $73.50 |
| 2150 Factoring Advance | Cr $4900.00 | Cr $4900.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $83.50** | **Dr $73.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 14 — invoice 8 — fa_id `9ed5dc2a-2233-49b7-abab-c5360c877dc4` — 2 copies

advance_amount_cents on record: $509.24 | entry_date: 2026-08-14

| Account | Copy 1 (2026-09-24 01:19 UTC) | Copy 2 (2026-09-26 04:13 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $509.24 | Dr $509.24 |
| 1230 Factoring Reserves | **Dr $7.88** | **—** |
| 1235 Faro Cash Reserve | **—** | **Dr $7.88** |
| 2150 Factoring Advance | Cr $525.00 | Cr $525.00 |
| 6400 Factoring Fees | Dr $7.88 | Dr $7.88 |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 15 — invoice 6 — fa_id `a1053942-4bb7-4921-bc59-500aa641b65d` — 2 copies

advance_amount_cents on record: $2512.00 | entry_date: 2026-08-13

| Account | Copy 1 (2026-09-23 22:52 UTC) | Copy 2 (2026-09-25 23:06 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $2512.00 | Dr $2512.00 |
| 1230 Factoring Reserves | Dr $39.00 | Dr $39.00 |
| 2150 Factoring Advance | Cr $2600.00 | Cr $2600.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $49.00** | **Dr $39.00** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 16 — invoice 50 — fa_id `c450edb2-b55c-40d2-9385-51c0dfda19d0` — 2 copies

advance_amount_cents on record: $3870.00 | entry_date: 2026-09-04

| Account | Copy 1 (2026-09-24 22:50 UTC) | Copy 2 (2026-09-25 23:08 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $3870.00 | Dr $3870.00 |
| 1230 Factoring Reserves | Dr $60.00 | Dr $60.00 |
| 2150 Factoring Advance | Cr $4000.00 | Cr $4000.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $70.00** | **Dr $60.00** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 17 — invoice 51 — fa_id `ce860d8d-71b7-40fe-8fde-b9d2b51ddaa0` — 2 copies

advance_amount_cents on record: $2900.00 | entry_date: 2026-09-03

| Account | Copy 1 (2026-09-24 03:38 UTC) | Copy 2 (2026-09-25 23:08 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $2900.00 | Dr $2900.00 |
| 1230 Factoring Reserves | Dr $45.00 | Dr $45.00 |
| 2150 Factoring Advance | Cr $3000.00 | Cr $3000.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $55.00** | **Dr $45.00** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 18 — invoice 42 — fa_id `da9d0965-df7e-4000-a89c-005fe4e2e00b` — 2 copies

advance_amount_cents on record: $3676.00 | entry_date: 2026-09-01

| Account | Copy 1 (2026-09-24 03:26 UTC) | Copy 2 (2026-09-25 23:07 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $3676.00 | Dr $3676.00 |
| 1230 Factoring Reserves | Dr $57.00 | Dr $57.00 |
| 2150 Factoring Advance | Cr $3800.00 | Cr $3800.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $67.00** | **Dr $57.00** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 19 — invoice 7 — fa_id `e93a0d50-2082-492b-befd-d29b1d7692f8` — 2 copies

advance_amount_cents on record: $339.50 | entry_date: 2026-08-13

| Account | Copy 1 (2026-09-23 22:56 UTC) | Copy 2 (2026-09-26 04:13 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $339.50 | Dr $339.50 |
| 1230 Factoring Reserves | **Dr $5.02** | **—** |
| 1235 Faro Cash Reserve | **—** | **Dr $5.02** |
| 2150 Factoring Advance | Cr $350.00 | Cr $350.00 |
| 6400 Factoring Fees | Dr $5.48 | Dr $5.48 |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 20 — invoice 78 — fa_id `f1416aac-eb53-43b1-946f-1ed45476f1c7` — 2 copies

advance_amount_cents on record: $3870.00 | entry_date: 2026-09-17

| Account | Copy 1 (2026-09-24 22:55 UTC) | Copy 2 (2026-09-25 23:08 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $3870.00 | Dr $3870.00 |
| 1230 Factoring Reserves | Dr $60.00 | Dr $60.00 |
| 2150 Factoring Advance | Cr $4000.00 | Cr $4000.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $70.00** | **Dr $60.00** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 21 — invoice 3 — fa_id `f2feaa5e-a306-4fe2-88d3-dadf64d766be` — 3 copies

advance_amount_cents on record: $2415.00 | entry_date: 2026-08-10

| Account | Copy 1 (2026-09-23 21:49 UTC) | Copy 2 (2026-09-25 23:04 UTC) | Copy 3 (2026-09-26 04:13 UTC) |
|---|---|---|---|
| 1090 Undeposited Funds | Dr $2415.00 | Dr $2415.00 | Dr $2415.00 |
| 1230 Factoring Reserves | **Dr $30.90** | **Dr $30.90** | **—** |
| 1235 Faro Cash Reserve | **—** | **—** | **Dr $30.90** |
| 2150 Factoring Advance | Cr $2500.00 | Cr $2500.00 | Cr $2500.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $54.10** | **Dr $44.10** | **Dr $44.10** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 22 — invoice 24 — fa_id `f4a4315b-027d-48bf-ae69-ec37ea13d6af` — 2 copies

advance_amount_cents on record: $3870.00 | entry_date: 2026-08-21

| Account | Copy 1 (2026-09-24 01:53 UTC) | Copy 2 (2026-09-25 23:07 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $3870.00 | Dr $3870.00 |
| 1230 Factoring Reserves | Dr $60.00 | Dr $60.00 |
| 2150 Factoring Advance | Cr $4000.00 | Cr $4000.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $70.00** | **Dr $60.00** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 23 — invoice 11 — fa_id `f746d306-6c3b-4d6f-baed-1cc8f2b1327c` — 2 copies

advance_amount_cents on record: $679.00 | entry_date: 2026-08-14

| Account | Copy 1 (2026-09-23 23:56 UTC) | Copy 2 (2026-09-26 04:13 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $679.00 | Dr $679.00 |
| 1230 Factoring Reserves | **Dr $9.11** | **—** |
| 1235 Faro Cash Reserve | **—** | **Dr $9.11** |
| 2150 Factoring Advance | Cr $700.00 | Cr $700.00 |
| 6400 Factoring Fees | Dr $11.89 | Dr $11.89 |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 24 — invoice 59 — fa_id `f7e49ab5-f86e-42a4-8da1-8e4c8c864acf` — 2 copies

advance_amount_cents on record: $3385.00 | entry_date: 2026-09-08

| Account | Copy 1 (2026-09-24 22:51 UTC) | Copy 2 (2026-09-25 23:08 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $3385.00 | Dr $3385.00 |
| 1230 Factoring Reserves | Dr $52.50 | Dr $52.50 |
| 2150 Factoring Advance | Cr $3500.00 | Cr $3500.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $62.50** | **Dr $52.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---

### Group 25 — invoice 61 — fa_id `fb640492-0d92-469c-ab34-1974eb0eae4f` — 2 copies

advance_amount_cents on record: $2027.00 | entry_date: 2026-09-10

| Account | Copy 1 (2026-09-24 22:52 UTC) | Copy 2 (2026-09-25 23:08 UTC) |
|---|---|---|
| 1090 Undeposited Funds | Dr $2027.00 | Dr $2027.00 |
| 1230 Factoring Reserves | Dr $31.50 | Dr $31.50 |
| 2150 Factoring Advance | Cr $2100.00 | Cr $2100.00 |
| 6300 Bank Service Charges & Wire Fees | **—** | **Dr $10.00** |
| 6400 Factoring Fees | **Dr $41.50** | **Dr $31.50** |

**DIFFERS between copies (not a byte-identical duplicate).**

---
