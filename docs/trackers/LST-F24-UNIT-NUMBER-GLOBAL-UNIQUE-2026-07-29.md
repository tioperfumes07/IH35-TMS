# LST-F24 — WITHDRAWN. The constraint is correct; the OWNERSHIP DATA is not.

**Status: my recommendation was WRONG and is withdrawn. A larger, real finding replaced it.**

## OWNER RULING 2026-07-29 — read this first

> "usmca or transportation do not own that equipment, they are not purchasing that equipment. we leave
> those numbers because those are the assigned unit numbers. so we leave the same number. the same
> units trucking owns it leases to both transportation and to usmca."

IH 35 Trucking owns **all** the equipment and leases it to Transportation and to USMCA. A unit number
therefore identifies **one physical truck**, which moves between lessees over time. Under that model:

- **`UNIQUE (unit_number)` globally is CORRECT and must stay.** Scoping it per entity — which is what I
  recommended below — would allow two DIFFERENT physical trucks to carry the same number and would
  destroy the very identity the number exists to provide.
- The lease relationship is already modelled: `owner_company_id` (TRK) +
  `currently_leased_to_company_id` (TRANSP or USMCA).
- The owner's actual ask is that the unit **name/number be EDITABLE**, not that the constraint be
  relaxed. Editable ≠ non-unique.

I recommended the opposite of the correct fix because I reasoned from a generic multi-carrier pattern
(McLeod/Alvys scope unit numbers per carrier) instead of from THIS company's structure, where one
entity owns the iron and leases it out. The generic pattern was real; it was the wrong model to apply.

---

## THE REAL FINDING — ownership data contradicts the business model on 99 of 186 units

Verified live on prod, complete read (visible 186 == n_live_tup 186):

| owner_company_id (prod) | currently_leased_to | units | expected under the owner's model |
|---|---|---|---|
| **USMCA Freight Solutions** | **(not leased out)** | **93** | TRK owns, leased to USMCA |
| IH 35 Trucking | IH 35 Transportation | 87 | correct as recorded |
| **IH 35 Transportation** | itself | **5** | TRK owns, leased to TRANSP |
| **IH 35 Transportation** | (not leased out) | **1** | TRK owns, leased to TRANSP |

**99 units carry an owner the business model says they cannot have.** All 186 have a VIN. NO unit has
`title_status` or `lien_holder` populated, so `owner_company_id` is the only ownership signal in the
system — and for 99 units it disagrees with the owner.

## Why this matters far more than the constraint did

**Depreciation.** `accounting/owned-unit-fixed-asset-register.service.ts:147` filters
`owner_company_id = $2::uuid`, and `FIXED_ASSET_AUTOPOST` is scoped to TRK only. 93 units recorded as
USMCA-owned are therefore EXCLUDED from TRK's fixed-asset register — understating TRK's depreciation
and its balance sheet, while implying USMCA holds assets it never purchased.

**Lease accounting (ASC 842).** The intercompany lease for those 99 units does not exist in the data:
`currently_leased_to_company_id` is NULL on all 93 USMCA rows. There is nothing to build a lessor/
lessee position from.

**Insurance, IRP, titles.** The columns exist (`us_insurance_*`, `mx_insurance_*`, `texas_irp_number`,
`title_status`, `lien_holder`) and are unpopulated, so nothing independently corroborates ownership.

A CPA, auditor, lender or insurer reading this would ask why a company that "is not purchasing
equipment" carries 93 units on its books. That question has no good answer in the current data.

## Live state (prod, complete read: visible 186 == n_live_tup 186)

| owner | units | distinct unit_numbers |
|---|---|---|
| USMCA Freight Solutions | 93 | 93 |
| IH 35 Trucking | 87 | 87 |
| IH 35 Transportation | 6 | 6 |

186 units, all numbers currently distinct — **no collision exists today**. The constraint is not
corrupting anything; it is silently limiting what the owner can name a truck.

## What depends on global uniqueness — checked, not assumed

**SAFE — already entity-scoped:**
- `relay-fuel-ingest.service.ts:99` matches a fuel transaction to a unit by number AND
  `(owner_company_id = $2 OR currently_leased_to_company_id = $2)`. Its own comment explains why. My
  first read of this file was WRONG — a grep matched the `WHERE unit_number` line without the
  following `AND`, and I briefly believed fuel ingest would break. It will not.

**MUST BE FIXED FIRST — genuinely unscoped:**
- `seed/csv-seed-import.ts:229` `unitExists()` — `WHERE unit_number = $1 LIMIT 1`, no entity filter.
- `seed/csv-seed-import.ts:325` `resolveUnitIdByNumber()` — same shape.

Both are seed-import paths. Today they are correct BECAUSE the constraint is global. The moment
`unit_number` becomes per-entity, `LIMIT 1` silently picks whichever entity's unit sorts first, and a
CSV import can attach a row to the wrong company's truck.

## Recommendation — REPLACED

**DO NOT change `units_unit_number_key`.** It is correct. Withdraw the migration proposed below.

**DO NOT bulk-update the 99 rows without the owner's explicit instruction.** Reassigning ownership of
99 vehicles is a financial and legal act, not a data cleanup: it moves assets between balance sheets,
changes which entity depreciates them, and creates 99 intercompany lease relationships that do not
currently exist. It is squarely CLAUDE.md §1.3/§1.4 territory and belongs to the money lane with the
owner's sign-off.

**What should happen, in order:**
1. Owner confirms the intended end state per unit: `owner_company_id = TRK` for all 186, with
   `currently_leased_to_company_id` set to TRANSP or USMCA per actual assignment.
2. Money lane writes ONE owner-gated migration performing that correction, with a full before/after
   row count and audit rows — never a silent UPDATE.
3. Confirm the fixed-asset register and `FIXED_ASSET_AUTOPOST` then see all TRK-owned units.
4. Guard: no unit may have `owner_company_id` set to an entity that does not purchase equipment.
   TRK is the asset holder; that is a business invariant and belongs in CI.

**Separately, and safe now:** make the unit number/name EDITABLE, which is what the owner actually
asked for. That is a UI/route change and does not touch the constraint.

**Still worth doing regardless (my lane):** the two `csv-seed-import.ts` lookups at :229 and :325
resolve a unit by `unit_number` with `LIMIT 1` and no entity filter. Under the corrected model that is
harmless today, because the number IS globally unique. It stays worth scoping for clarity, but it is
no longer a prerequisite for anything.

## Why this was not fixed here

`mdata.units` is a hub table and this is a schema change to a UNIQUE constraint — CLAUDE.md §1.3 puts
any `mdata.*` schema touch behind an explicit owner decision. The catalogs.* auto-apply grant does not
extend to it. Steps 1 and 4 are safe to do immediately on the owner's word; step 2 is the migration.
