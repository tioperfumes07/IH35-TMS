# ENG-25 — Diesel Fill Match List (CC-3, 2026-10-24)

**Query:** All non-voided, non-archived fuel fills with a load_id where the fill date (`transaction_at`)
is > 3 calendar days before the load's first scheduled pickup stop, excluding $0 Transportation loads.
**Company scope:** all companies (results are all USMCA 5c854333).
**Source docs checked:** `~/Desktop/Company_Settlement_5769-5819-Merged.xlsx` (settlements 5769–5814, Transportation) +
PDFs 5842–5845 (Transportation).
**Note:** Lead measured 38; live DB gives 46 (8 fills added since measurement, all USMCA). All types included.

**Legend — signed doc says USMCA load?**
- `no`  — load appears in an IH35 Transportation settlement doc → signed doc confirms Transportation, NOT USMCA
- `—`   — load NOT in any signed settlement doc (neither Transportation nor USMCA settlement found)

---

| # | fill_id | load | fill_date | fuel_type | amount ($) | days_before | load_rate_cents | signed_doc_says_usmca |
|---|---------|------|-----------|-----------|------------|-------------|-----------------|----------------------|
| 1 | 5a591875-1960-4af8-a14e-c554d027778b | 13517 | 2026-08-03 | def | 25.33 | 3.7 | 0 | no (Settlement 5769, Transportation) |
| 2 | 107cbb8a-9119-4a93-b2f7-0ed46c6ce754 | 13525 | 2026-08-03 | diesel | 904.35 | 3.3 | 0 | no (Settlement 5769, Transportation) |
| 3 | f2e59731-9601-430d-94ff-2a118de2de1d | 13530 | 2026-08-04 | diesel | 389.15 | 14.2 | 0 | no (Settlement 5769, Transportation) |
| 4 | 2d79464f-cc66-4d80-b501-a554d6f14a65 | 13530 | 2026-08-04 | diesel | 116.72 | 14.2 | 0 | no (Settlement 5769, Transportation) |
| 5 | 000ab617-b491-456b-9922-0ed3a588d37c | 13530 | 2026-08-12 | diesel | 367.67 | 5.4 | 0 | no (Settlement 5769, Transportation) |
| 6 | 8a875ddb-79ec-4854-aa4b-77db988d33e9 | 13530 | 2026-08-12 | def | 20.04 | 5.4 | 0 | no (Settlement 5769, Transportation) |
| 7 | 38350f2c-52f1-47b0-8a72-4e6262c40d7b | 13530 | 2026-08-12 | def | 12.56 | 5.4 | 0 | no (Settlement 5769, Transportation) |
| 8 | f9b7fd15-4327-45f6-b1dd-293d4ee1dd6a | 13530 | 2026-08-12 | diesel | 366.78 | 5.4 | 0 | no (Settlement 5769, Transportation) |
| 9 | 8089f16f-ec21-4c5b-bf25-7480633768ea | 13551 | 2026-08-18 | diesel | 725.86 | 8.1 | 300000 | no (Settlement 5799, Transportation) |
| 10 | 59926067-536f-4493-86f6-7f43833ea2f3 | 13563 | 2026-08-26 | diesel | 269.46 | 6.0 | 60000 | — (not in any signed doc) |
| 11 | 1ffb127f-4cf9-45c9-b989-bb74d06cf030 | 13563 | 2026-08-27 | diesel | 99.36 | 5.4 | 60000 | — (not in any signed doc) |
| 12 | 9f3374ec-cc9f-40b4-8e4c-57c259a80a14 | 13565 | 2026-08-05 | def | 30.70 | 19.9 | 400000 | no (Settlement 5786, Transportation) |
| 13 | 0c7434a1-6298-426d-8116-648a7521aa6e | 13565 | 2026-08-05 | diesel | 727.66 | 19.9 | 400000 | no (Settlement 5786, Transportation) |
| 14 | bd611f49-1084-4230-a269-f278c9318ac1 | 13565 | 2026-08-06 | diesel | 219.47 | 19.1 | 400000 | no (Settlement 5786, Transportation) |
| 15 | cb4d5cd4-15d6-4ca4-aa0a-9ec8c81bf257 | 13565 | 2026-08-06 | def | 37.11 | 18.2 | 400000 | no (Settlement 5786, Transportation) |
| 16 | 167dece0-0e00-4b1c-96a3-4dee2b3574b3 | 13565 | 2026-08-06 | diesel | 566.48 | 18.2 | 400000 | no (Settlement 5786, Transportation) |
| 17 | e7a92840-0f28-44c2-8650-344ced700a7f | 13565 | 2026-08-09 | def | 37.25 | 16.0 | 400000 | no (Settlement 5786, Transportation) |
| 18 | bad05093-e093-4b33-a6f1-611da5dec201 | 13565 | 2026-08-09 | diesel | 900.40 | 16.0 | 400000 | no (Settlement 5786, Transportation) |
| 19 | 15c95db4-1f99-4179-a3fd-68d2877fce63 | 13588 | 2026-09-01 | diesel | 752.78 | 6.7 | 570000 | no (Settlement 5810, Transportation) |
| 20 | 3dda55c6-0eb0-4312-afa3-0179daa35841 | 13588 | 2026-09-01 | reefer_diesel | 10.37 | 6.7 | 570000 | no (Settlement 5810, Transportation) |
| 21 | e0033651-2374-485b-8097-ac5f9a2ac5f0 | 13588 | 2026-09-01 | def | 72.03 | 6.7 | 570000 | no (Settlement 5810, Transportation) |
| 22 | 23a1dac8-ff04-45d2-95a7-1da8750d445a | 13588 | 2026-09-02 | diesel | 928.98 | 5.7 | 570000 | no (Settlement 5810, Transportation) |
| 23 | bf15c1ad-0868-4564-b6f1-ce026c163fb3 | 13595 | 2026-09-04 | diesel | 175.33 | 6.1 | 150000 | no (Settlement 5814, Transportation) |
| 24 | 63d6a2b7-0b33-49bb-99e0-48ca258f20be | 13595 | 2026-09-04 | diesel | 752.20 | 6.0 | 150000 | no (Settlement 5814, Transportation) |
| 25 | 6a242353-b236-40e4-8e2f-e96bfe02be6f | 13595 | 2026-09-04 | def | 65.66 | 6.0 | 150000 | no (Settlement 5814, Transportation) |
| 26 | 875ffa05-c2a3-473b-8d2b-1547b4d3cd18 | 13596 | 2026-09-02 | diesel | 171.06 | 9.1 | 490000 | no (Settlement 5810, Transportation) |
| 27 | abcb61ab-3431-4618-967e-b8af2dc1d313 | 13596 | 2026-09-02 | diesel | 530.24 | 8.7 | 490000 | no (Settlement 5810, Transportation) |
| 28 | 4d06b27e-a2d5-4f0d-b8dc-d0c5177655d0 | 13596 | 2026-09-02 | def | 20.41 | 8.7 | 490000 | no (Settlement 5810, Transportation) |
| 29 | 85e289ba-b224-4ea4-8a9c-38a81572f29a | 13614 | 2026-09-04 | diesel | 259.32 | 12.6 | 345000 | no (Settlement 5814, Transportation) |
| 30 | 6dc6e515-9de4-45ee-ba06-a89868a335f2 | 13623 | 2026-09-12 | diesel | 552.87 | 10.6 | 0 | — (not in any signed doc) |
| 31 | 8263ac7e-5677-45ef-8752-4fea482cb48a | 13623 | 2026-09-15 | reefer_diesel | 290.83 | 7.4 | 0 | — (not in any signed doc) |
| 32 | 9545ef3c-059d-42d6-ab96-9ff847662727 | 13623 | 2026-09-15 | def | 29.92 | 7.4 | 0 | — (not in any signed doc) |
| 33 | 9533eff2-5032-48af-8ed1-3bd71f404c2b | 13625 | 2026-09-13 | diesel | 185.47 | 10.3 | 625000 | — (not in any signed doc) |
| 34 | d9d9bc7e-349d-48c6-9f4c-3bf93370e50f | 13625 | 2026-09-13 | def | 54.61 | 10.3 | 625000 | — (not in any signed doc) |
| 35 | d81c8029-172c-4866-8c4c-e8cdb8698adb | 13625 | 2026-09-17 | diesel | 207.57 | 6.3 | 625000 | — (not in any signed doc) |
| 36 | 5d0e1163-d15a-49fd-9146-fa7bbc9812e4 | 13625 | 2026-09-18 | diesel | 316.25 | 6.2 | 625000 | — (not in any signed doc) |
| 37 | a399f041-a8d4-4590-909b-72da8034556d | 13674 | 2026-10-08 | diesel | 510.65 | 3.5 | 520000 | — (not in any signed doc) |
| 38 | 74330f81-7175-4148-82a8-9be9e3649125 | 13674 | 2026-10-08 | def | 39.31 | 3.5 | 520000 | — (not in any signed doc) |
| 39 | 3a51bed2-1396-46c1-8975-caa34a7766c2 | 13680 | 2026-10-07 | diesel | 600.92 | 6.5 | 230000 | no (Settlement 5845, Transportation) |
| 40 | 77ba3ec2-f6d2-463d-ad46-fef63d62e7eb | 13680 | 2026-10-07 | diesel | 502.77 | 6.5 | 230000 | no (Settlement 5845, Transportation) |
| 41 | b60678a7-09bc-4978-acbb-5d400981f875 | 13680 | 2026-10-07 | def | 29.90 | 6.5 | 230000 | no (Settlement 5845, Transportation) |
| 42 | 3d88e626-4b12-4757-b557-c327f818272d | 13680 | 2026-10-07 | def | 5.94 | 6.5 | 230000 | no (Settlement 5845, Transportation) |
| 43 | 2e2763c8-fe72-4457-b2de-31ba14ea671f | 13680 | 2026-10-08 | diesel | 500.56 | 5.5 | 230000 | no (Settlement 5845, Transportation) |
| 44 | 7732eeee-3961-441b-86ac-417a2d4600fb | 13680 | 2026-10-08 | def | 19.95 | 5.5 | 230000 | no (Settlement 5845, Transportation) |
| 45 | 0e6f0f40-cfc0-4e54-8b66-08751c7232a3 | 13680 | 2026-10-08 | diesel | 446.61 | 5.5 | 230000 | no (Settlement 5845, Transportation) |
| 46 | 40139b6c-d97e-4c83-8758-976e2dfabc62 | 13680 | 2026-10-08 | def | 24.40 | 5.5 | 230000 | no (Settlement 5845, Transportation) |

---

## Summary by load

| load | fills | total_amount | signed_doc_says_usmca | settlement_doc |
|------|-------|-------------|----------------------|---------------|
| 13517 | 1 | $25.33 | no | 5769 (Transportation) |
| 13525 | 1 | $904.35 | no | 5769 (Transportation) |
| 13530 | 6 | $1,272.92 | no | 5769 (Transportation) |
| 13551 | 1 | $725.86 | no | 5799 (Transportation) |
| 13563 | 2 | $368.82 | — | not in any signed doc |
| 13565 | 7 | $2,519.07 | no | 5786 (Transportation) |
| 13588 | 4 | $1,764.16 | no | 5810 (Transportation) |
| 13595 | 3 | $993.19 | no | 5814 (Transportation) |
| 13596 | 3 | $721.71 | no | 5810 (Transportation) |
| 13614 | 1 | $259.32 | no | 5814 (Transportation) |
| 13623 | 3 | $873.62 | — | not in any signed doc |
| 13625 | 4 | $763.90 | — | not in any signed doc |
| 13674 | 2 | $549.96 | — | not in any signed doc |
| 13680 | 8 | $2,131.05 | no | 5845 (Transportation) |

**Total fills: 46 (Lead measured 38 — 8 new fills added after measurement)**
**Fills confirmed on Transportation loads (signed doc says NOT USMCA):** 38 (loads 13517, 13525, 13530, 13551, 13565, 13588, 13595, 13596, 13614, 13680)
**Fills not in any signed doc (status unknown):** 8 (loads 13563, 13623, 13625, 13674)

**Per owner ruling 10-24:** fills where signed_doc_says_usmca = "no" → loan to Transportation (acct 8000).
The 8 fills with "—" have no signed doc; Lead to determine treatment.

Generated: 2026-10-24 by CC-3 · source: fuel.fuel_transactions + mdata.loads + settlement docs
