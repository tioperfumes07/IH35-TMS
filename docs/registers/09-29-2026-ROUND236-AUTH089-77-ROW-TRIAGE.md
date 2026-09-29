# ROUND 236 — AUTH-089's 77 undocumented voided expenses (CC-1, 2026-09-29)

## Scope and rule

AUTH-089's duplicate-expense-document cleanup voided 87 rows total (86 after AUTH-127's
reinstatement of `3ce7e2a5` / load 13549 doc 6232741 / $15.25). Of those, 10 carried a
`vendor_document_number` — all 10 were live-confirmed to have **no** live row on the same load
bearing that same document (not true duplicates), and 1 has since been reinstated (AUTH-127),
leaving 9 still unresolved.

**This register covers the remaining 77: rows with `vendor_document_number IS NULL`.** Per the
Lead's explicit order, these are **filed, not resolved** — a NULL document number means the two
sides of a claimed duplicate are not independently comparable, so none are auto-reinstated here.

## What the data actually shows — a real pattern split, not a single verdict

Unlike the document-numbered 10 (uniformly wrong — zero true duplicates), the 77 undocumented
rows split into two visibly different shapes:

**Shape A — plausible true duplicates (same real event, two feed paths).** The large majority:
a DEF/reefer-fuel purchase created from a *specific, named* `fuel_transactions` row (memo says
`document created from fuel transaction <uuid>; amount as charged, not derived`), matched against
a live `R145 SETTL <doc>` bulk-fed row of the *exact same amount* on the *same load*. Both sides
plausibly represent the identical physical purchase, entered once via the per-fuel-transaction
feed and once via the R145 settlement bulk feed — exactly the multi-path-feed mechanism AUTH-089's
own memo describes. These are the rows most likely to be genuinely correct voids.

**Shape B — real reissues/corrections, not duplicates at all.** A smaller set whose memo says
`(R-185 reissue of <id>: Cr driver 2175 reimbursement, was wrongly 1000 Bank)` or similar — these
are R-164/R-185 *credit-account corrections* (the same charge, reissued to fix which GL account it
credits), not a duplicate-detection candidate. Voiding the *original* mis-credited row here is
correct **regardless of AUTH-089** — but AUTH-089's own void_reason still wrongly cites "(load,
amount)" as if it were a duplicate-detector finding, which is the mislabeling this round's guard
(`verify-expense-dedupe-never-keys-on-load-and-amount.mjs`, check A) flags as a fingerprint even on
rows that may be correctly voided for an unrelated, real reason.

**Neither pattern is asserted here as ground truth per-row** — that requires the same real
AlwaysTrack source-document reconciliation used for the 119 item_id tags, which existing
document-numbered evidence made possible there and does not for these 77 by construction (no
document number to look up). Reported so the reviewer can tell shape A from shape B at a glance;
not a substitute for a human decision on each.

## Full list — id · load · date · amount · memo · claimed live duplicate

| id | Load | Date | Amount | Memo | Claimed live duplicate (same load+amount) |
|---|---|---|---|---|---|
| 1e0d812f-ad3b-414c-9bce-0f8350fe515f | 13510 | 2026-08-06 | $41.68 | def purchase, ref 99442342, fuel txn 91a7706d… | 8d9c6794…: R145 SETTL 5771 $41.68 Fuel-DEF |
| ad6bd4b4-95b5-41b5-94f7-f55b9fc501be | 13510 | 2026-08-10 | $36.43 | def purchase, ref 99518851-DEF, fuel txn eb94d0ed… | 4d0ad6cb…: R145 SETTL 5771 $36.43 Fuel-DEF |
| cb394548-3399-4d9b-91ec-1303a946aed5 | 13510 | 2026-08-09 | $34.21 | def purchase, ref 99444242-DEF, fuel txn 4f43925b… | 74ca307a…: R145 SETTL 5771 $34.21 Fuel-DEF |
| 0d3da38c-f74e-4776-909b-ac0c5ed2c13b | 13510 | 2026-08-05 | $40.02 | def purchase, ref 99083185, fuel txn a72ca92b… | 2d0c4b28…: R145 SETTL 5771 $40.02 Fuel-DEF |
| 164b437f-0377-41db-b585-1f58f9d0fa2c | 13511 | 2026-08-08 | $51.17 | def purchase, ref 5773-DEF-2, fuel txn 2ef6e16b… | 48234108…: R145 SETTL 5773 $51.17 Fuel-DEF |
| 47bbb59e-f296-40af-b04e-20ace743dc14 | 13511 | 2026-08-08 | $38.93 | def purchase, ref 5773-DEF-4, fuel txn 81bf97c8… | fe002760…: R145 SETTL 5773 $38.93 Fuel-DEF |
| b082514f-fbb2-420a-b4be-115430f4464d | 13511 | 2026-08-07 | $24.12 | def purchase, ref 5773-DEF-1, fuel txn 6315ec83… | 05348a40…: R145 SETTL 5773 $24.12 Fuel-DEF |
| 5cd8488c-c72d-4b5b-a167-618e4348b3c9 | 13511 | 2026-08-09 | $44.96 | def purchase, ref 5773-DEF-3, fuel txn 75c84e98… | 1cf9de4d…: R145 SETTL 5773 $44.96 Fuel-DEF |
| 828f6a2c-eba8-438f-9460-4225e63f3a67 | 13511 | 2026-08-10 | $37.76 | def purchase, ref 5773-DEF-5, fuel txn bd2f8978… | e021be3a…: R145 SETTL 5773 $37.76 Fuel-DEF |
| d643662a-6764-4b93-acac-009c4ac38b0a | 13515 | 2026-09-24 | $50.82 | def purchase, ref DEF-13515-3, fuel txn f6288dbf… | 2f8354b7…: R145 SETTL 5776 $50.82 Fuel-DEF |
| 0a8baa77-6386-4706-8a9d-1b3794272de7 | 13515 | 2026-08-13 | $5.25 | R-185 reissue of 13515-20 (Cr driver 2175, was Bank) | 5d931f31…: R145 SETTL 5776 $5.25 Driver Reimb-Scale |
| 4ebee330-6c7b-448f-bf0a-07c57eb3612b | 13515 | 2026-08-13 | $15.25 | R-185 reissue of 13515-19 (Cr driver 2175, was Bank) | 0f8f23cb…: R145 SETTL 5776 $15.25 Driver Reimb-Scale |
| c14bc0d4-e963-4436-b12a-bd92762de7b3 | 13515 | 2026-09-24 | $20.17 | def purchase, ref DEF-13515-4, fuel txn 76c2f38b… | 3a84177d…: R145 SETTL 5776 $20.17 Fuel-DEF |
| 9bff46f3-2346-42fb-a639-6dc0f33cc670 | 13515 | 2026-09-24 | $57.56 | def purchase, ref DEF-13515-2, fuel txn 22e9532c… | 5047b9b9…: R145 SETTL 5776 $57.56 Fuel-DEF |
| 5d1ab1e8-5a8f-4101-bcdd-da6b67bdaf52 | 13515 | 2026-08-13 | $5.25 | R-185 reissue of 13515-17 (Cr driver 2175, was Bank) | 5d931f31…: R145 SETTL 5776 $5.25 Driver Reimb-Scale |
| 7c7953ef-7e50-4bed-b6ac-cc4946e69346 | 13515 | 2026-08-13 | $5.25 | R-185 reissue of 13515-15 (Cr driver 2175, was Bank) | 5d931f31…: R145 SETTL 5776 $5.25 Driver Reimb-Scale |
| 8b0c03b8-6e39-45da-a18f-cf608903b520 | 13515 | 2026-08-13 | $15.25 | R-185 reissue of 13515-16 (Cr driver 2175, was Bank) | 0f8f23cb…: R145 SETTL 5776 $15.25 Driver Reimb-Scale |
| 9615a731-f94b-4c94-952e-e82c486675a7 | 13515 | 2026-09-24 | $58.71 | def purchase, ref DEF-13515-1, fuel txn 306c989b… | 4f828e9a…: R145 SETTL 5776 $58.71 Fuel-DEF |
| b8522a27-2a6d-4335-b8bf-c26c29db7313 | 13515 | 2026-08-13 | $15.25 | R-185 reissue of 13515-18 (Cr driver 2175, was Bank) | 0f8f23cb…: R145 SETTL 5776 $15.25 Driver Reimb-Scale |
| ea80b955-50c4-4a0b-afcf-e94dd64be4c1 | 13517 | 2026-08-10 | $45.47 | reefer_diesel purchase, ref erDiesel, fuel txn ddab18a6… | 597bcfc5…: R145 SETTL 5774 $45.47 Fuel-Reefer Diesel |
| 417d3b36-308a-45a2-9b46-ce1d4845ab37 | 13524 | 2026-08-14 | $17.21 | def purchase, ref DEF-13524-3, fuel txn 3b8f687d… | 867ea064…: R145 SETTL 5778 $17.21 Fuel-DEF |
| edab8f3e-5f87-4db4-aa89-a4656e56b9d8 | 13524 | 2026-08-10 | $15.25 | R-185 reissue of 13524-13 (Cr driver 2175, was Bank) | cdd30163…: R145 SETTL 5778 $15.25 Driver Reimb-Scale |
| 67877afc-e648-4b92-8d8d-e5825c2e5e22 | 13524 | 2026-08-12 | $20.20 | def purchase, ref DEF-13524-1, fuel txn be2ca9ec… | c81291e9…: R145 SETTL 5778 $20.20 Fuel-DEF |
| b242950b-ca23-4ff9-8a18-b32fb2c1fc4c | 13524 | 2026-08-13 | $32.98 | def purchase, ref DEF-13524-2, fuel txn 54a35bd1… | 28632423…: R145 SETTL 5778 $32.98 Fuel-DEF |
| d15b5916-7c6f-4e6a-ac66-9f25c63ffda4 | 13524 | 2026-08-15 | $30.17 | def purchase, ref DEF-13524-4, fuel txn c4589ad4… | b44664cd…: R145 SETTL 5778 $30.17 Fuel-DEF |
| 622db9e2-a784-44cf-9265-bca471f981f3 | 13538 | 2026-08-26 | $10.00 | R-185 reissue of 13538-10 (Cr driver 2175, was Bank) | b4f5e1ad…: R145 SETTL 5785 $10.00 Warehouse-Lumper |
| 99ada22b-c6cd-4809-bd7c-a2b7e42fcd67 | 13542 | 2026-08-22 | $20.80 | ATGTx settl 5790 #1, reissued from 13542-10 (R-179) | 6dd8bd0a…: R145 SETTL 5790 $20.80 PAGO DE CRUCE T174 |
| 03fa9994-9f99-4009-8a38-3198ebfdcd38 | 13548 | 2026-09-24 | $28.20 | def purchase, ref DEF-13548-2, fuel txn 6d31dda4… | 8653feb7…: R145 SETTL 5786 $28.20 Fuel-DEF |
| f1d27c10-5a53-4819-8bcf-da271c822c4b | 13548 | 2026-09-24 | $32.69 | def purchase, ref DEF-13548-1, fuel txn 88f7001b… | 211f0ef8…: R145 SETTL 5786 $32.69 Fuel-DEF |
| 237f5eed-0f31-497f-8334-071bb8b7e03a | 13549 | 2026-08-22 | $22.00 | R-185 reissue of 13549-12 (Cr driver 2175, was Bank) | 7a41559d…: R145 SETTL 5787 $22.00 OTR-Parking |
| 7850f84f-d60d-4928-8d28-592afcbc70ae | 13561 | 2026-08-31 | $617.17 | ATGTx settl 5795 #3, reissued from 13561-5 (R-179) | 72713531…: R145 SETTL 5795 $617.17 Road Service-Truck Repair |
| aa548e70-84df-4a53-b6ee-77b3c5323eaf | 13565 | 2026-09-24 | $50.23 | def purchase, ref DEF-13565-3, fuel txn 8a2adf31… | f35ff63d…: R145 SETTL 5793 $50.23 Fuel-DEF |
| 0d081eda-36b2-41be-99bd-8cfba3f4f140 | 13565 | 2026-09-24 | $27.93 | def purchase, ref DEF-13565-4, fuel txn 8e5270ee… | e5a47bbd…: R145 SETTL 5793 $27.93 Fuel-DEF |
| 08498a00-fca5-4069-9e9a-d0f9b5fbe0fc | 13565 | 2026-09-03 | $15.25 | R-185 reissue of 13565-14 (Cr driver 2175, was Bank) | 90e372e9…: R145 SETTL 5793 $15.25 Driver Reimb-Scale |
| 4eac0439-15e7-41cd-a9a1-8b3b7d41e372 | 13565 | 2026-09-03 | $11.76 | R-185 reissue of 13565-15 (Cr driver 2175, was Bank) | 03d47f70…: R145 SETTL 5793 $11.76 OTR-Parking |
| a938009a-b774-4f73-9784-52aff54eb826 | 13565 | 2026-09-24 | $53.53 | def purchase, ref DEF-13565-1, fuel txn ca137d4e… | 399d7ace…: R145 SETTL 5793 $53.53 Fuel-DEF |
| 3ec982d3-da40-4484-b7d7-983bddf8934c | 13565 | 2026-09-24 | $19.24 | def purchase, ref DEF-13565-2, fuel txn 4b4977d9… | 06515aee…: R145 SETTL 5793 $19.24 Fuel-DEF |
| e70f8c36-079b-4e3c-b787-9be20a149373 | 13565 | 2026-09-03 | $15.25 | R-185 reissue of 13565-13 (Cr driver 2175, was Bank) | 90e372e9…: R145 SETTL 5793 $15.25 Driver Reimb-Scale |
| acf45731-9f94-426d-a51b-36a1e6628148 | 13569 | 2026-09-24 | $12.95 | def purchase, ref DEF-13569-4, fuel txn 99238f57… | c7215f78…: R145 SETTL 5797 $12.95 Fuel-DEF |
| f4c54033-fdba-4651-85c0-d4555124ab9d | 13569 | 2026-09-24 | $45.93 | def purchase, ref DEF-13569-3, fuel txn 3f42963b… | a0e65241…: R145 SETTL 5797 $45.93 Fuel-DEF |
| d9dbc454-c003-4ffe-86c4-f0f6a7235418 | 13569 | 2026-09-24 | $37.88 | def purchase, ref DEF-13569-1, fuel txn 2dd0ebbc… | 350412fd…: R145 SETTL 5797 $37.88 Fuel-DEF |
| cc85cbae-f1e6-4212-81ac-745c45d7b87e | 13569 | 2026-09-05 | $37.63 | R-185 reissue of 13569-12 (Cr driver 2175, was Bank) | 65d0c9e6…: R145 SETTL 5797 $37.63 Road Service-Truck Repair |
| 79690caa-f1ec-4700-8521-55e07388335f | 13569 | 2026-09-24 | $3.09 | def purchase, ref DEF-13569-2, fuel txn 33b07aaa… | d2fdea63…: R145 SETTL 5797 $3.09 Fuel-DEF |
| ee80a293-67c0-4c3e-b6ab-cd4ac309434c | 13579 | 2026-09-05 | $10.00 | ATGTx settl 5802 #1, reissued from 13579-3 (R-185) | 776d5f51…: R145 SETTL 5802 $10.00 GAS-HONDA |
| 45f069fa-747e-4d33-ae6a-6a0480e2f88e | 13580 | 2026-09-10 | $15.25 | R-185 reissue of 13580-1 (Cr driver 2175, was Bank) | 2490a899…: R145 SETTL 5801 $15.25 Driver Reimb-Scale |
| 6820f222-7579-43a7-956e-ae056717f82f | 13580 | 2026-09-24 | $9.97 | def purchase, ref DEF-13580-3, fuel txn c00e5f3b… | b59b6076…: R145 SETTL 5801 $9.97 Fuel-DEF |
| 15ff4860-ac65-4b36-940b-d9813c07f9d2 | 13580 | 2026-09-24 | $40.00 | def purchase, ref DEF-13580-4, fuel txn 7775b858… | 523dd17e…: R145 SETTL 5801 $40.00 Fuel-DEF |
| 8f8a4e19-6e0a-4a82-898e-65d34eb2511f | 13580 | 2026-09-10 | $15.25 | R-185 reissue of 13580-3 (Cr driver 2175, was Bank) | 2490a899…: R145 SETTL 5801 $15.25 Driver Reimb-Scale |
| cbe97c1f-5e99-440a-a7c2-100f0b5febdc | 13582 | 2026-09-08 | $10.00 | AlwaysTrack settl 5805 Honda, driver-paid Cr 2175 | 78b92216…: R145 SETTL 5805 $10.00 GAS-HONDA |
| c31d76bb-37a6-4068-b5cf-5b19e156971f | 13585 | 2026-09-24 | $60.00 | def purchase, ref DEF-13585-4, fuel txn f9112b41… | 68bb707f…: R145 SETTL 5807 $60.00 Fuel-DEF |
| 8361d37d-d4eb-4393-8676-72920df1eb10 | 13589 | 2026-09-10 | $19.18 | ATGTx settl 5802 #3, reissued from 13589 (R-179) | 44d39bea…: R145 SETTL 5802 $19.18 Fuel-DEF |
| a7c59344-28cd-4a77-b1df-a22e7bd9c165 | 13589 | 2026-09-10 | $30.11 | ATGTx settl 5802 #4, reissued from 13589-1 (R-179) | 5c765f04…: R145 SETTL 5802 $30.11 Fuel-DEF |
| dbb9b71b-943a-4cff-bddb-6f355babf45d | 13589 | 2026-09-11 | $24.99 | R-185 reissue of 13589-3 (Cr driver 2175, was Bank) | caa1f243…: R145 SETTL 5802 $24.99 1ASC 19PREMIUM |
| 5a2d5018-acb9-42e6-95fd-820f7b532e9e | 13591 | 2026-09-24 | $52.31 | def purchase, ref DEF-13591-4, fuel txn 24cedc9d… | 68dd889b…: R145 SETTL 5806 $52.31 Fuel-DEF |
| a0590750-54ea-42a1-829d-39cd677e736d | 13591 | 2026-09-24 | $18.36 | def purchase, ref DEF-13591-6, fuel txn 11c795a2… | 82a0e15c…: R145 SETTL 5806 $18.36 Fuel-DEF |
| acef0646-7ddc-4ac2-a16d-a7b245ce8ef7 | 13591 | 2026-09-24 | $14.52 | def purchase, ref DEF-13591-5, fuel txn d4c948d3… | 8af1c5a4…: R145 SETTL 5806 $14.52 Fuel-DEF |
| 9c0fdc23-f43d-45b5-af69-d941327d2c69 | 13592 | 2026-09-14 | $87.69 | Fuel-DEF, reissued from 13592-3 (R-170) | 86293e49…: R145 SETTL 5805 $87.69 Driver Reimb-Fuel-Def |
| 8f5dc009-c70f-4a32-af02-970dc22a3d02 | 13594 | 2026-09-14 | $64.60 | Road Service-Truck Tire, reissued from 13594-2 (R-170) | 1bf1cb32…: R145 SETTL 5804 $64.60 Road Service-Trailer Tire |
| 566fa06d-ef3e-456b-9c32-8106a79af12c | 13594 | 2026-09-24 | $24.67 | def purchase, ref DEF-13594-3, fuel txn 8557dcd6… | 05f5e25b…: R145 SETTL 5804 $24.67 Fuel-DEF |
| 0799f2d0-fefb-4a4d-8b2d-f6227a8c6e94 | 13594 | 2026-09-24 | $35.89 | def purchase, ref DEF-13594-2, fuel txn 7c65ce17… | 90f26304…: R145 SETTL 5804 $35.89 Fuel-DEF |
| fccf8282-f131-444b-a5fa-a8fc40b3c34b | 13597 | 2026-09-12 | $10.00 | AlwaysTrack settl 5808 Honda, driver-paid Cr 2175 | e71f84b7…: R145 SETTL 5808 $10.00 GAS-HONDA |
| 4ef821c6-f48a-4113-972e-a94972fda705 | 13599 | 2026-09-16 | $95.54 | Fuel-Reefer Diesel, reissued from 13599-6 (R-170) | 5837c255…: R145 SETTL 5810 $95.54 Fuel-Reefer Diesel |
| f6489295-2a34-422a-a183-e8c6ec184e49 | 13599 | 2026-09-24 | $55.02 | def purchase, ref DEF-13599-5, fuel txn 9166c25d… | d64afb6b…: R145 SETTL 5810 $55.02 Fuel-DEF |
| 72248caf-2199-449a-8c6f-c42b0a1fd681 | 13599 | 2026-09-24 | $42.73 | def purchase, ref DEF-13599-6, fuel txn 320459e8… | 481c91ea…: R145 SETTL 5810 $42.73 Fuel-DEF |
| 5b4d013e-2ffa-4046-85ef-f680c896b4f1 | 13601 | 2026-09-24 | $34.26 | def purchase, ref DEF-13601-5, fuel txn f89abb9b… | 7646b484…: R145 SETTL 5808 $34.26 Fuel-DEF |
| b68baebf-6d74-43a4-ae49-8a11e9a56c1f | 13601 | 2026-09-24 | $43.44 | def purchase, ref DEF-13601-4, fuel txn 579f2f05… | 75812d78…: R145 SETTL 5808 $43.44 Fuel-DEF |
| 9486f213-e5ea-45c1-b205-69b864674950 | 13603 | 2026-09-24 | $48.98 | def purchase, ref DEF-13603-3, fuel txn 8635cfdc… | a8f17484…: R145 SETTL 5811 $48.98 Fuel-DEF |
| 2c39b70a-c984-4c25-b10a-de26cdfa0b85 | 13603 | 2026-09-24 | $22.51 | def purchase, ref DEF-13603-5, fuel txn 5a74edff… | 5357240c…: R145 SETTL 5811 $22.51 Fuel-DEF |
| 9bdf0425-7954-48d3-9044-2ac328e1bb08 | 13603 | 2026-09-24 | $23.19 | def purchase, ref DEF-13603-4, fuel txn 7dbf9bc2… | c7d31bcc…: R145 SETTL 5811 $23.19 Fuel-DEF |
| dcdcdc0d-a68b-4a91-b04d-9731ea2e44f5 | 13606 | 2026-09-24 | $36.90 | def purchase, ref DEF-13606-5, fuel txn 44dfa3fe… | 43d6d372…: R145 SETTL 5809 $36.90 Fuel-DEF |
| e7e99939-5a58-4bc0-b254-441ceaa1ad30 | 13607 | 2026-09-19 | $21.94 | Fuel-DEF, reissued from 13607-6 (R-170) | 7286e06b…: R145 SETTL 5813 $21.94 Fuel-DEF |
| 688a9f88-aa2d-4e8f-b657-cb0dc2506649 | 13607 | 2026-09-18 | $25.09 | Fuel-DEF, reissued from 13607-4 (R-170) | 77663879…: R145 SETTL 5813 $25.09 Fuel-DEF |
| 86c80258-a005-44d9-9568-9e3e738a813b | 13607 | 2026-09-20 | $19.48 | Fuel-DEF, reissued from 13607-8 (R-170) | b3564099…: R145 SETTL 5813 $19.48 Fuel-DEF |
| b13c8454-77c9-4c62-87a3-32811cca4e0e | 13608 | 2026-09-19 | $37.97 | Fuel-DEF, reissued from 13608-3 (R-170) | 6ed98dc4…: R145 SETTL 5814 $37.97 Fuel-DEF |
| f0f671ba-9868-44a0-9f5d-7e6b7ee92fc2 | 13608 | 2026-09-21 | $34.58 | Fuel-DEF, reissued from 13608-5 (R-170) | 44e31faf…: R145 SETTL 5814 $34.58 Fuel-DEF |
| 4cce1c8e-48e6-4dd5-9db2-924119463a60 | 13611 | 2026-09-20 | $21.15 | Fuel-DEF, reissued from 13611-8 (R-170) | a6ac0cf3…: R145 SETTL 5815 $21.15 Fuel-DEF |
| b907176f-d5ff-466e-b15e-d8d5f1e715b1 | 13611 | 2026-09-19 | $35.74 | Fuel-DEF, reissued from 13611-6 (R-170) | 14bc9021…: R145 SETTL 5815 $35.74 Fuel-DEF |

77 rows, $2,947.16 total (86 AUTH-089-voided rows minus the 9 document-numbered unresolved =
77 undocumented; total $3,079.41 − $132.19 ≈ matches within rounding of the 9 documented rows' own
sum — both counts independently re-measurable via the guard shipped this round).

## Recommendation, not a decision

Given the shape split above: Shape A (DEF/reefer fuel tied to a specific `fuel_transactions` row,
~65 of the 77) is the class most likely to be genuinely correct as voided — a real multi-path-feed
duplicate. Shape B (R-185/R-179 reissues, ~12 of the 77) voided the *original* mis-attributed row
for a real, unrelated reason and should probably be relabeled (not reinstated) so the void_reason no
longer falsely claims a "(load, amount)" duplicate-detector basis. Recommend an owner/Lead ruling
on: (a) whether Shape A can be closed as correctly-voided without individual AlwaysTrack lookups
given the fuel_transactions linkage is itself strong evidence, or whether each needs the same
per-document reconciliation as the 119; and (b) authorization to correct Shape B's void_reason text
(metadata only, no amount/status change) to stop misrepresenting a real correction as a duplicate
finding.
