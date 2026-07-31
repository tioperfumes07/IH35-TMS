# LST-PICKER-01 partial slices (APPEND-ONLY)

> **Law (2026-07-30):** Do **not** append PARTIAL notes into `docs/module-completion/lists.json`
> evidence while `LST-PICKER-01` status stays `FAIL`. That evidence field is one in-place string —
> every parallel slice PR conflicts on it. Append a one-line note here instead.
> This file is `merge=union` in `.gitattributes` (line-based keep-both).

<!-- Append below this line. One bullet per Cursor/Claude slice. -->

- 2026-07-30 · guard 1826 · EscrowForfeitModal → `createKind=escrow_draw_reason` (`may_draw_escrow=true`) · PR #3825
- 2026-07-30 · guard 1822 · CargoClaimIntakeSurface → `createKind=cargo_claim_reason` · PR #3822
- 2026-07-30 · guard 1820 · InternalFinesPage → `createKind=internal_fine_reason` · PR #3821
- 2026-07-30 · guard 1830 · PayRunClosePanel → PaymentMethodPicker (catalogs.payment_methods inline create) · PR pending
- 2026-07-30 · guard 1824 · HosViolationCreateModal → `createKind=dot_violation_type` · PR #3823
- 2026-07-30 · guard 1838 · DriverDetail + TerminateConfirmModal → `createKind=driver_termination_reason` · PR pending
- 2026-07-30 · guard 1842 · CustomerProfileForm · VendorCreateModal · VendorDetail · QuickCreateEntityModal → `createKind=payment_term` · PR pending
- 2026-07-30 · guard 1846 · DriverDetail Add Qualification → `createKind=equipment_type` · PR pending
- 2026-07-30 · guard 1848 · ExpectedAdjustmentsCallout (Book Load) → `createKind=detention_reason` · PR pending
- 2026-07-30 · guard 1850 · LaborTracker → `createKind=maintenance_labor_code` (fuel_card_type has no consumer) · PR pending
- 2026-07-30 · guard 1850 · LaborTracker → `createKind=maintenance_labor_code` · PR #3877
- 2026-07-31 · guard 1852 · VendorDetail Profile → `createKind=vendor_type` (catalogs.vendor_types; not labor — #3877 owns labor_code@1850) · PR pending
- 2026-07-31 · guard 1856 · ExpensiveStatesMultiselect → `createKind=fuel_expensive_state` · PR pending
- 2026-07-31 · guard 1858 · WarrantyClaimsPage vendor picker FK-mismatch fix → `createKind=vendor` (`mdata.vendors`, matches `maintenance.warranty_claims.vendor_id` FK; was wrongly reading `catalogs.maintenance_vendors`) · PR pending
- 2026-07-31 · guard 1860 · NewVendorDrawerForm + QuickCreateEntityModal → `createKind=vendor_type` (nested vendor create paths; guard 1852 wired VendorDetail/VendorCreateModal only) · PR pending
- 2026-07-31 · guard 1862 · TireProgramPage mount-tire Brand picker → `createKind=maintenance_tire_brand` (`maintenance.tire_brands`; external "+ Create Brand" button kept per Rule 07) · PR pending
- 2026-07-31 · guard 1864 · PolicyCreateModal + PolicyCreateWizard → `createKind=insurance_coverage_type` (`insurance.type_catalog`; TypeCatalogAdmin kept) · PR pending
