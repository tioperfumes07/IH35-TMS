# LST-F24 — `mdata.units.unit_number` is globally unique, not per-entity

**Status: CONFIRMED REAL. Needs an owner decision — the fix is a schema change on a hub table.**

## The defect

```
units_unit_number_key  UNIQUE (unit_number)      <- global, across ALL entities
units_vin_key          UNIQUE (vin)              <- global, and CORRECT
```

`unit_number` is unique across the whole database. If IH 35 Trucking owns a unit numbered `T150`,
USMCA can never create one with that number, and vice versa.

`vin` being globally unique is right and must stay: a VIN identifies one physical vehicle worldwide.
`unit_number` is a fleet's internal name for a truck, and two carriers can each have a unit 101.

## Against the systems we are matching

McLeod and Alvys both scope unit/tractor numbers to the carrier. In a multi-entity system a global
unique forces artificial numbering — the second entity has to invent a prefix or a suffix purely to
dodge a database constraint, and that invented number then appears on settlements, IFTA filings and
maintenance records forever.

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

## Recommended order — the order matters

1. **Scope the two seed-import lookups** by owner/leased-to, exactly as the Relay ingest already does.
2. **Then** migrate the constraint: drop `units_unit_number_key`, add
   `UNIQUE (owner_company_id, unit_number)`. Additive-safe: no existing row violates it, since all 186
   numbers are already distinct.
3. Keep `units_vin_key` global. Do not touch it.
4. Guard: no lookup of `mdata.units` by `unit_number` without an entity predicate.

Doing 2 before 1 converts a naming limitation into a data-integrity defect. That is why this is written
down rather than shipped in a hurry.

## Why this was not fixed here

`mdata.units` is a hub table and this is a schema change to a UNIQUE constraint — CLAUDE.md §1.3 puts
any `mdata.*` schema touch behind an explicit owner decision. The catalogs.* auto-apply grant does not
extend to it. Steps 1 and 4 are safe to do immediately on the owner's word; step 2 is the migration.
