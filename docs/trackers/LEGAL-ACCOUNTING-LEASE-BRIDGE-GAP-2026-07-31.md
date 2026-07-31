# LEASE-BRIDGE — creating a truck lease in Legal writes NO accounting subledger

**Found:** 2026-07-31, tracing the Legal contract-create path after LEASE-06 merged.
**Status:** OPEN. Verified by reading the code on `main`, not inferred.

## The gap, precisely

`apps/backend/src/legal/truck-lease.service.ts` contains exactly one write:

```
INSERT INTO legal.contract_templates (...)
```

That is the whole service. It does **not** write:

- `legal.contract_instances` — the signed instance (grep count on that file: **0**)
- `accounting.lease_contract` — the ASC 842 lessor subledger
- `accounting.lease_asset_line` — the per-asset lines
- `accounting.lease_schedule` — the period schedule

So `TruckLeaseCreatorModal` collects `monthly_lease_amount`, term, escrow and a full vehicle table,
renders them into a **document template**, and the numbers come to rest inside that template's field
values. Nothing reaches the ledger.

## Why this matters more than a missing insert

TRK's entire economic purpose is owning equipment and leasing it to the operating carriers. With this
gap, TRK can hold a signed lease naming a monthly amount and still have:

- no rental income basis to post,
- no lease classified under ASC 842 (`election` never set),
- no `commencement_je_id`, so no GL hook at commencement,
- no link from the lease to the depreciating `accounting.fixed_assets` row.

The document says one thing and the books know nothing about it. That is the §10a
total-connectivity island in its most expensive form: a **legal instrument with financial terms that
never became a financial record.** An auditor comparing signed leases to rental income would find the
income missing entirely, not merely misstated.

## What LEASE-06 already fixed (merged, #3853)

The canonical model can now *represent* the lease that TRK actually has:

- `accounting.lease_contract.lessee_operating_company_id` → `org.companies` — the intercompany lessee
  (TRK → TRANSP / USMCA). Previously the lessee could only be a customer, so an intercompany lease was
  free text with no FK.
- `accounting.lease_asset_line.equipment_id` → `mdata.equipment` — trailers. Previously a lease line
  could only name a tractor.
- `ck_lease_contract_lessee_exactly_one`, `ck_lease_contract_no_self_lease`,
  `ck_lease_asset_line_one_asset_kind`, `uq_lease_asset_line_contract_equipment`.
- `createLeaseContract` now **requires** exactly one lessee identity and rejects lessee == lessor.

So the destination exists and is correctly constrained. What is missing is the **bridge**.

## Why the bridge is not built yet — a real dependency, not a deferral

`accounting.lease_asset_line.fixed_asset_id` is NOT NULL until LEASE-06 applies, and even after it,
a lease line is only meaningful when the leased asset exists in `accounting.fixed_assets`.

**Prod holds exactly 1 fixed_asset row against 122 LIVE assets** (verified via Neon, `bypass_rls`
issued as its own statement).

> **CORRECTION 2026-07-31 (owner-flagged).** An earlier draft of this file, and the LEASE-06 commit
> messages, said **368 assets**. That was wrong: 368 is `units_total` (186) + `equipment_total` (182),
> i.e. every row in those tables **including 136 deactivated units and 110 deactivated trailers**. The
> owner said the fleet is "about 40 trucks and about 50-60 trailers and a few cars", which prompted the
> re-count. The live figures:
>
> | | live | total rows |
> |---|---:|---:|
> | units (trucks) | **50** (37 InService, 13 OutOfService) | 186 |
> | equipment (trailers) | **72** | 182 |
> | **total** | **122** | 368 |
>
> 122 matches the Fleet roster exactly (Total Fleet 122 / Trucks 50 / Trailers 72). The cost-basis job
> is therefore **~3x smaller** than stated. Counting total rows instead of live rows in a void-not-delete
> schema is a mistake that will recur — deactivated rows are retained by design, so `count(*)` on any
> `mdata` table overstates the operating fleet.

Building the bridge now would therefore create lease contracts with **zero asset lines** — a header
with no assets, which is worse than nothing because it would look done. The blocker is **cost basis**:
`accounting.fixed_assets` requires `purchase_price_cents`, `purchase_date`, `in_service_date`,
`class_id`, all NOT NULL. Those values are not derivable from the TMS.

Attempts made to source it (all verified, none successful):

| source | result |
|---|---|
| QuickBooks via the connected integration | realm is **IH 35 Transportation LLC** (TRANSP); balance sheet reports **`fixedAssets: 0`** |
| IH 35 **Trucking** QBO realm | **not connected** to this integration — cannot be read |
| `db/seeds/trk_assets.csv` / `transp_assets.csv` | 8-row test fixtures, synthetic VINs (`TRK-UNIT-301`), **no cost columns** |
| repo-wide search for fixed-asset data | nothing containing purchase price |

Fabricating cost basis is not an option: it flows directly into depreciation, the lease schedule, and
the tax position. A wrong number there is worse than an absent one, because it looks authoritative.

## Unblock path (either one is sufficient)

1. Connect the **IH 35 Trucking** QuickBooks realm to the integration → the Fixed Asset list can be
   pulled and mapped to the 122 live assets directly.
2. Or export TRK's **Fixed Asset Listing** (Reports → Fixed Asset Listing → Excel) → same mapping.

Required per asset: name, purchase price, purchase date, in-service date, class. Scope is **122 live
assets**, not 368.

## Trailer categories are not usable for group pricing yet

Live `mdata.equipment.equipment_type` on prod: **DryVan 70, Flatbed 1, StepDeck 1** — and **Reefer 0**,
because the only reefer row was demo data that DATA-01 deactivated. `DryVan` is plainly the default
everything defaulted into.

This blocks the owner's uniform-allocation spec ("flatbeds - 10 selected, total $8,000/mo -> $800 each;
reefers - 20, $15,000/mo -> $750 each"): allocation groups are keyed on trailer type, so with 70 of 72
trailers typed `DryVan` the per-unit amounts would spread across the wrong groups and every line would
be wrong while still summing to the right total — the worst kind of wrong, because the control total
ties. The owner has said they will categorise trailers in the Fleet module; that must happen **before**
any group-priced lease is generated.

**Company vehicles ("a few cars") are not in `mdata.equipment`** — no such `equipment_type` exists among
live rows. They are either inside the 50 `mdata.units` or not yet entered; the Fleet UI has a Company
Vehicles tab, so the surface exists. Unconfirmed which, and not guessed here.

## Then, in order

1. Import fixed assets for the 122 LIVE TRK-owned units/trailers (50 trucks + 72 trailers).
2. Bridge: on truck-lease creation, also `createLeaseContract` (lessor TRK, lessee the operating
   company, election `operating` per the owner lock) + `addLeaseAsset` per selected unit/trailer +
   `generateScheduleForLease`, in one transaction, with `contract_instance_id` linking the ledger row
   back to the legal instrument.
3. Two contracts, not one: TRANSP commences **2022-01-01**, USMCA **2026-08-07**.
   `commencement_date` is a single NOT NULL column with one `commencement_je_id` per contract, so one
   row structurally cannot carry both — this is the correct ASC 842 representation, not a workaround.
4. Uniform allocation (owner spec): a total per group spread evenly across selected assets —
   e.g. flatbeds 10 @ $8,000/mo → $800 each; reefers 20 @ $15,000/mo → $750 each. Largest-remainder so
   the lines sum exactly to the group total.

## What is NOT claimed here

No lease contract has ever been created on prod (`accounting.lease_contract` = 0 rows). Everything
above is verified against code and schema; **none of it is verified against a live posted lease**,
because none exists. The application-level lessee precondition added in #3853 exists precisely so the
first real contract is not the thing that discovers a defect.
