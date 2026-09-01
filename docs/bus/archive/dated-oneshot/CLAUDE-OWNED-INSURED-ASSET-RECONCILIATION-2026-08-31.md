# INSURED-ASSET RECONCILIATION — DIAGNOSIS + DECIDED FIX · 2026-08-31 22:55Z
**Owner assigned this to Claude directly. I own the diagnosis and the decision. Seats execute it.**
Every number below I ran myself against prod. None of it is from a seat report.

## THE DIAGNOSIS — four layers, all verified
`insurance.policy_unit.asset_id` has a real FK to **`mdata.assets`**. That is the only table the
insurance module can point at. Here is what is actually in it:

| finding | verified value |
|---|---|
| `mdata.assets` rows | **90** |
| distinct `asset_type` values | **`tractor` only — ZERO trailers exist** |
| rows with `insured_value_cents` populated | **0 of 90** |
| foreign keys on `mdata.assets` | **NONE. Not one.** `tenant_id` and `unit_id` are unconstrained |
| CC-3's 20 insured trailers present | **0 of 20** |
| rows matching the 15 insured power-unit VINs | **27** — the units are duplicated |

**1 · The 20 insured trailers cannot be attached to any policy.** `mdata.assets` holds tractors
only. CC-3 loaded the trailers into `mdata.equipment`, which is a correct trailer master — but the
insurance module cannot see it. **$343,495 of insured trailer value has no reachable home.**

**2 · The power units are registered under the wrong entity.** Spot-checked three VINs:
- `4V4WC9EH1PN631152` (**T174**) — exists **only under IH 35 Transportation**, yet it is on USMCA's
  Auto Liability schedule and a USMCA driver runs it.
- `1M1AN4GY0PM030370` (**T163**) — exists **twice**, once under Transportation, once under USMCA.
- `1M1AN4GYXNM023603` (**T144**) — exists **only under Transportation.** That one is correct: the
  owner confirmed T144 is Trucking's unit leased to 2EMS.

So USMCA's policy would have to point at **another company's asset rows** — and for T163 it would
have to choose between two. **This is the same duplicate-identity disease as the drivers, on assets.**

**3 · No insured value is recorded anywhere.** `insured_value_cents` exists on both `mdata.assets`
and `insurance.policy_unit` and is empty on all 90 rows. The APD TIV of **$1,077,940** is nowhere.

**4 · `mdata.assets` has no referential integrity at all.** Zero FKs. `unit_id` can point at a
non-existent unit and nothing stops it. That is why the duplicates and the wrong-tenant rows were
never caught.

## THE DECISION — mine, and I will defend it
**`mdata.assets` is the insurable asset register. It stays the FK target. We fix the register, not
the pointer.** Repointing `policy_unit` at `equipment`/`units` would need two FKs or a polymorphic
key, and would leave the duplicate and wrong-tenant problems untouched. The table already carries
`asset_type` and `insured_value_cents` — it was designed for exactly this and was simply never
populated past tractors.

### Build order — additive only, nothing dropped, nothing deleted
1. **Add `equipment_id` to `mdata.assets`** (nullable, FK → `mdata.equipment`). Today a trailer
   asset has no way to reach its equipment row. This is the one genuinely missing column.
2. **Add the real foreign keys** that were never there: `tenant_id` → `org.companies`,
   `unit_id` → `mdata.units`, `equipment_id` → `mdata.equipment`. Additive constraints, validated
   `NOT VALID` first if existing rows fail, then fixed and validated. **Do not delete a failing row.**
3. **Create 20 trailer asset rows**, `asset_type='trailer'`, one per insured VIN, each linked to its
   `mdata.equipment` row, `insured_value_cents` from the signed APD binder. **Trailer total must
   equal $343,495 exactly** — that figure is cross-footed off the binder and is not negotiable.
4. **Resolve the 27-rows-for-15-VINs duplication before any policy links.** One canonical asset per
   VIN per entity. Publish the register first — same rule as the drivers: **no merges without CC-2
   grading the list.** Merging an asset moves an insured value.
5. **Entity assignment is a finding, not a fix.** T174 and others sit under Transportation while
   insured under USMCA. **Do not reassign a tenant on your own** — publish the list; the owner rules.
6. **Then** populate `insurance.policy_unit` for all 35 units. **APD TIV must total $1,077,940
   exactly** (15 power units $734,445 + 20 trailers $343,495). If it does not, stop and report.
7. **Guard + selftest:** every unit on a bound policy resolves to exactly one canonical asset; no
   policy_unit row points at an asset of a different entity than the policy; TIV equals the binder.

## ⛔ MY OWN ERROR — the settlement control totals were wrong. Withdrawn.
I published **$388,976.50** company settlements and **$75,918.76** driver settlements as **USMCA**
control totals. **That was not verified and it is withdrawn.** Verified now:
- Neither CSV carries an entity column. Only `CC-1-USMCA-FARO-33-INVOICES.csv` is entity-labelled.
- Both settlement files use the **57xx** display series. **No settlement in the entire database has
  a 57xx display_id.** They are AlwaysTrack exports, not TMS records.
- The whole database holds **47 driver settlements, all USMCA** — 28 sample, 19 real.
**Nobody may use $388,976.50 or $75,918.76 as a USMCA tie-out target until the owner confirms which
entity those files belong to.** The Faro figures stand: face **$95,075.00**, net advance
**$92,102.74** — that file says USMCA on its face.

## ON VOIDING THE TEST DATA — the owner's standing order, sequenced
The owner has asked repeatedly to clean the app. He is right and it must happen. The only real
constraint is order, and it is short:
- **FREEZE NOW:** no seat creates another TEST transaction in a hop already proven — book/dispatch,
  record-expense, close-trip re-check, bank-match-open. Those lessons are recorded. More TEST there
  is noise, not progress. **This takes effect immediately.**
- **VOID AFTER** one real chain posts and CC-2's posting-trace table confirms those types balance
  and link. Voiding the positive controls before the trace destroys the evidence that the posters
  are honest — that is hours away, not days.
- **Void list rules, unchanged:** by UUID, from a published list, CC-2 grades it before it runs,
  reverse-never-erase, and **`INV-2026-00049..00081` are NOT test — no voids.** The 20 trailer rows
  and the 90 asset rows are not test either.
