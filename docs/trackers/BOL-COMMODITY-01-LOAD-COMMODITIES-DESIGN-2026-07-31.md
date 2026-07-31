# BOL-COMMODITY-01 — the Bill of Lading has no commodity and no weight to print

**Opened:** 2026-07-31, from the dispatch phantom-column sweep (`bol-generator.service.ts`, 6 entries).
**Status:** OPEN — DESIGN ONLY. No migration written, nothing shipped. Needs the owner's gate (§1.4).
**Why it is not a rename:** `mdata.loads` has no `commodity_description` and no `weight_lbs` column at
all (prod `information_schema`, verified). There is nothing to point the query at.

## Correction to the first read of this finding

An earlier note said commodity and weight are captured **nowhere**. That is **wrong**, and the truth
changes the design.

`mdata.unit_border_crossings` already carries `commodity`, `commodity_value_cents`,
`cargo_weight_lbs` and `hazmat_declared` — **and it has a `load_id`.** So the data is modelled; it is
modelled in the wrong place for this purpose:

| problem | detail |
|---|---|
| wrong grain | one row per *crossing*, not per commodity. A load carrying three commodities with three freight classes and three weights cannot be represented at all. |
| wrong scope | it exists on the **cross-border** record. A domestic Laredo→Dallas load never creates one, so its BOL still has nothing to print. |
| unused | **0 rows** (visible 0, `n_live_tup` 0 — genuinely empty, not RLS-masked). The wizard that populates it has never been completed once. |

So the real statement is: *commodity and weight are modelled only on an unused cross-border record,
at a grain that cannot describe a multi-commodity load.*

## Why this matters beyond a blank field

A Bill of Lading is a legal shipping document. **49 CFR §373.101** requires the carrier's receipt to
show the kind and quantity of property. A BOL that prints blank commodity and blank weight is not an
incomplete UI — it is a non-compliant document, produced by the carrier, on every load. It is also
the document a cargo-claim adjuster reads first when freight is damaged, and the one a DOT officer
reads at a scale.

## Recommendation — a first-class child table, NOT jsonb and NOT flat columns

`mdata.load_commodities`, one row per commodity on a load:

- `id` uuid PK (server-generated) · `load_id` uuid NOT NULL FK → `mdata.loads(id)`
- `operating_company_id` uuid NOT NULL FK → `org.companies(id)` — ENABLE + **FORCE** RLS, canonical
  policy shape `identity.is_lucia_bypass() OR operating_company_id::text = current_setting(...)`
  (top-level OR — explicitly NOT the AND-gated shape documented in RLS-BYPASS-SHAPE-01)
- `sequence_number` int NOT NULL — stable ordering on the printed document
- `description` text NOT NULL — the §373.101 "kind of property"
- `weight_lbs` numeric · `pieces` int · `packaging_type` text — the "quantity"
- `nmfc_code` text · `freight_class` text — carrier-standard classification (McLeod/Alvys both model
  this per-commodity, not per-load)
- `is_hazmat` bool NOT NULL DEFAULT false + `un_number` text · `hazard_class` text · `packing_group`
  text — hazmat travels WITH the commodity, not with the load
- `archived_at` timestamptz — void-not-delete, never a hard DELETE
- `created_at` / `updated_at` / `created_by_user_id`
- GRANT SELECT, INSERT, UPDATE to `ih35_app`; index on `(operating_company_id, load_id, sequence_number)`

**Why not jsonb:** load-level hazmat already lives in `quicksave_pending_fields` jsonb, and that is
precisely why hazmat has been re-litigated three times in this repo's history — jsonb cannot be
FK'd, cannot be checked, cannot be indexed for a compliance report, and cannot be joined by a claims
query. A legally-required field should not be schemaless.

**Why not flat columns on `mdata.loads`:** flat columns force one commodity per load. That is wrong
on any consolidated or LTL move, and it silently truncates the document rather than failing.

## Explicitly required: do NOT create a second home

`mdata.unit_border_crossings.commodity` / `cargo_weight_lbs` must become **derived or deprecated**,
not a parallel truth. Two writable homes for the same fact is the total-connectivity violation
(§10a) that produces two different weights on two documents for one load. Since the table has **0
rows**, this costs nothing today — it is the cheapest possible moment to decide. Recommend: keep the
columns (archive-not-delete, §7), stop writing them, and have the border wizard read from
`mdata.load_commodities`.

## Sequencing

1. Owner decision on the model above.
2. HELD migration (`HOLD-FOR-JORGE` + `DO NOT RUN ON PROD`, registered in `.held-migrations.json`),
   number strictly above the live max — currently `202611031200`.
3. Backfill: none possible. No historical commodity data exists to migrate (0 rows everywhere).
4. Only then repoint `bol-generator.service.ts` and remove its allowlist keys.

## Not claimed here

- No migration file is written. No column is added. Nothing is applied.
- Whether the BOL is currently issued to customers with blank fields, or the surface is unused, is
  **UNVERIFIED** — `mdata.loads` holds 3 live / 10 total rows, so it may simply never have run in
  anger. That does not change the requirement, only its urgency.
