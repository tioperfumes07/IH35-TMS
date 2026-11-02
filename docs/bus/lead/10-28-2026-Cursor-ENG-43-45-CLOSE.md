# Measure-close + guard fix — ENG-43 / ENG-45 — 2026-10-28 CT (Cursor Lead)

## ENG-43 → DONE-LIVE
Claims tip-cleared:
- closed-unposted = **0**
- P-0112 / P-0116 / P-0079 / P-0114 are **not** $0 headers (net_pay 848.65 / 979.45 / 979.45 / 1543.24)
- line `ffac5c35` has quantity=1, rate_cents=10000 (not NULL)
- `verify-no-empty-zero-settlement` PASS

"2 posted with zero load lines" = **salaried by design**:
- P-0067 / P-0122 — `pay_method` weekly_salary / no_net_pay; loads carry Salaried override (13595 / 13700)
- Engine already allows via Lead 443.339 salaried path + loadActivity UNION
- **Guard fix:** `verify-payrun-close-requires-load-activity` live arm now mirrors salaried UNION (removed hardcode P-0067/P-0069); LIVE PASS

## ENG-45 → DONE-LIVE
- Carvallo / Morales Noguez Inactive rows only have **cancelled/voided** settlements
- Sibling profiles (Pena Carvallo / Morales) already have `vendor_type='Driver'`
- **Guard fix:** settlement-active excludes `voided_at` + status cancelled/voided
- `verify-driver-vendor-linkage` LIVE PASS — 0 without Driver vendor (control=91)
