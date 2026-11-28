# 11-27-2026 — LEAD · owner requests, verbatim, with the work queue (TIO Perfumes only; trucking frozen 3 days)

Owner law (17:35 CT): "remember all i am writing to you, save in jorunal and add to repo so nothing gets lost and is added to work que."
Times are Laredo Central. Status reflects what has merged on main.

| # | Time CT | Owner, verbatim (short) | Work | Seat | Status |
|---|---|---|---|---|---|
| Q1 | 17:17 | "AUTOMATICATE DUPLICATE DETECTOR ENGINE AND RECOMENDATIONS … AND WE JSUT CONFIRM" | duplicate_candidates engine + recommendations queue (confirm / not a duplicate) | LEAD | MERGED #29982 |
| Q2 | 17:17 | "size, we need country of origin, etc … a correct catalog for all items" | item catalog fields: size, origin present on the item file; catalog split per type | LEAD | IN QUEUE (Q6 first) |
| Q3 | 17:25 | "I CLICK ON VITAMIN SHOP, IT SHOULD POP UP, AND SHOW ME ALL THE DUPLICATES SO I CAN CONFIRM" | duplicate-company pop-up: pick the record that stays, confirm | LEAD | MERGED #29982 |
| Q4 | 17:25 | "FOR EVERY SECTION THE HEADER MUST BE LARGER … FORMAT COMPANY NAMES, DUPLCATE COMANIES, GOOGLE SEARCHES RUN" | .text-card-title 16px on every perfume section; ParityTable cardTitle | LEAD | MERGED #29982 (perfume screens) |
| Q5 | 17:25 | "ALL THE APP MUST BE DESIGNED AS THE OTHER APP AND QUCIKBOOKS, POP UP WINDOWS POP UP MODULARS" | every perfume review/confirm opens a pop-up (Modal) — applied to duplicates + catalog cleanup | ALL seats | STANDING LAW |
| Q6 | 17:35 | "ITEM PRODUCT TYPES BE REGULAR, TESTER, SET, MINI, DUPES, SAMPLE, VIAL … GENDER ASSIGNED FROM THE GENDER CATALOG" | catalog cleanup pop-up: Woman/Man/Unisex/Perfume → Regular, Tester Man/Woman → Tester, Man/Woman Set → Set; adds Regular, Kids, Dupe, Sample, Vial | LEAD | MERGED #29984 |
| Q7 | 17:35 | "CUSTOMER TYPES SHOULD BE CLEANER, YOU HAVE MULTIPLE THAT I BELIEVE ARE overlapping" | 28 customer types → merges in the same cleanup pop-up; vendor "Brand-direct" / "Manufacturer / brand" → "Brand direct" | LEAD | MERGED #29984 |
| Q8 | 17:35 | "i think we need to check on many htings the type and sub type" | type + sub-type review per list (category 24 mixed values, segment English/Spanish slugs) | LEAD | PART 1 merged (business-type Spanish slugs → English, in the cleanup pop-up); PART 2 = catalog split (Q2): contact category mixes relationship + industry + review tags; "(Market Directory)" labels carry the source (only 17 of 816 have it as a source) so they move to Lead source, not merged |
| Q9 | 17:28 | "IN ITEMS WE SHOLD ALSO HAVE FILTERS, MULTIPLE DROP DOWN, IN STOCK, NEVER PURCHASED, OUT OF STOCK" | item file: multi-select filters (stock status, brand, family, scent family, product type, gender, category) server-side | LEAD | MERGED #29987 |
| Q10 | 17:28 | "ITEM FAMILIES, SCENT FAMILY, WELL SHOULD BE MULTIMPLE SELECTOR. BRAND SHOULD BE FILTER COMBOBOX" | families list: scent family multi-select, brand searchable filter | LEAD | MERGED #29987 |

Measured on production 2026-11-27 (perfume.items): product_type "Woman" 6,447 (all gender W) · "Man" 5,250 (M) · "Unisex" 3,819 (U) ·
"Perfume" 2,327 · "Tester Woman" 1,678 (W) · "Man Set" 1,251 (M) · "Woman Set" 1,235 (W) · "Tester Man" 1,060 (M). The gender is already
on every one of those items, so the cleanup moves only the kind. Margin groups read the TESTER / SET / MINI flags, not product_type
(desk.service.ts marginGroupOf) — the cleanup does not change any price.

Do NOT touch (P1, in progress): purchasing supplier profiles not opening, supplier vs vendor, traders, vendor / customer modules,
lead → convert to vendor / customer, brand fill on 106 items.
