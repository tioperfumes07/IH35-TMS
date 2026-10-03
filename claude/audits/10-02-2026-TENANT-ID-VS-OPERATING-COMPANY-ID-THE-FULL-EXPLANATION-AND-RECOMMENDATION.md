# tenant_id vs operating_company_id — the full explanation, measured

Measured live: Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, every statement under `SET LOCAL app.bypass_rls = 'lucia'`. 2026-10-02.

---

## 1. They are not two different ideas. They are one idea with two names.

Both columns are a uuid foreign key to **the same table**: `org.companies`.

    34 foreign key constraints on a tenant_id column -> org.companies
    e.g. factor_tenant_id_fkey, claim_tenant_id_fkey, coa_account_tenant_id_fkey,
         assets_tenant_id_fkey, part_tenant_id_fkey, metric_tenant_id_fkey

`tenant_id` is not a tenant layer sitting above companies. There is no tenant entity. It holds a company id — USMCA, TRANSP or TRK — exactly like `operating_company_id` does. This is one column that got built twice under two names in two different generations of the schema.

That matters because it means there is nothing to reconcile conceptually. There is no business question here about what a tenant is versus what an operating company is. There is only a question of which name wins.

## 2. The scale

    tables carrying tenant_id ................... 35, across 9 schemas
      insurance 8 | factoring 8 | accounting 6 | mdata 4 | integrity 4
      maint 2 | maintenance 1 | master_data 1 | audit 1

    tables carrying operating_company_id ........ 665

    RLS policies in the database ................ 1,157
      keyed on operating_company_id ............. 788
      keyed on tenant_id ........................  24

788 to 24. `operating_company_id` is the canonical column by a factor of thirty-three. `tenant_id` is the survivor of an earlier shape.

## 3. Why it is dangerous — the RLS OR

Postgres combines multiple PERMISSIVE row-level-security policies on one table with **OR**, not AND. A row that satisfies any one policy is visible.

Three tables carry a policy on each column:

    factoring.customer_factor_assignment
      factoring_customer_factor_assignment_opco_scope        -> operating_company_id
      factoring_customer_factor_assignment_tenant_scope_v2   -> tenant_id

    factoring.factor
      factoring_factor_opco_scope                            -> operating_company_id
      factoring_factor_tenant_scope_v2                       -> tenant_id

    factoring.letter_of_release
      factoring_letter_of_release_opco_scope                 -> operating_company_id
      factoring_lor_tenant_scope                             -> tenant_id

Both policies compare their column to the same session variable, `app.operating_company_id`. So the effective rule on those three tables is:

> show the row if **either** the tenant column **or** the company column matches the caller's company.

While the two columns agree, nothing is visible that should not be. The moment they disagree on a row, **that row is visible to two companies at once.** Not a theoretical leak — the policy is written that way today, on the table that assigns which customer is factored to which factor.

Measured on today's data:

    factoring.customer_factor_assignment   1,222 rows   0 disagree
    factoring.factor                           2 rows   0 disagree
    factoring.letter_of_release                0 rows   0 disagree
    insurance.policy_unit                     63 rows   0 disagree
    insurance.policy                          8 rows    0 disagree
    insurance.claim                           8 rows    0 disagree
    insurance.lawsuit                         2 rows    0 disagree
    insurance.coi_request                      1 row    0 disagree
    insurance.refund_obligation                1 row    0 disagree
    insurance.payment_schedule                 2 rows   **1 DISAGREES**
    factoring.bank_match_suggestion            0 rows   0 disagree
    factoring.batch                            0 rows   0 disagree
    factoring.reserve_movement                 0 rows   0 disagree

## 4. The one row that is already wrong

`insurance.payment_schedule`, one row:

    tenant_id             = USMCA
    operating_company_id  = NULL

Its RLS policy is `payment_schedule_opco_scope`, which keys on `operating_company_id`. That column is NULL, so the comparison is NULL, so **no company can see that row.** It is a real USMCA insurance payment schedule that is invisible to the application, invisible to every company-scoped report, and visible only under the lucia bypass. It did not fail loudly. It just disappeared.

This is the whole argument in one row: a null got past the writer because the writer populated the other column.

## 5. Where tenant_id is load-bearing and must NOT simply be dropped

Two foreign keys use `tenant_id` as part of a **composite same-entity constraint** — which is good design, and the reason a couple of the "defective" indexes I flagged are not defects at all:

    factoring.canonical_factor_agreements
      canonical_factor_agreements_profile_same_entity_fkey  (tenant_id, factor_profile_id) -> factoring.factor
      canonical_factor_agreements_vendor_same_entity_fkey   (tenant_id, factor_vendor_id)  -> mdata.vendors

Those two constraints make it structurally impossible for a factor agreement in one company to point at a factor profile or vendor belonging to another company. That is exactly the kind of guard this system should have everywhere. They require the index `uq_factoring_factor_tenant_id (tenant_id, id)` on `factoring.factor` to exist as their target — so that index, which my sweep flagged as Class T, is **correct and necessary**. I am correcting my own classification on it.

The lesson for the migration: you cannot drop `tenant_id` from these tables. The columns have to be renamed or the constraints rebuilt on the canonical column first. A straight DROP COLUMN takes the same-entity protection with it.

Also note `factoring.canonical_factor_agreements` has **no `operating_company_id` column at all** — tenant_id only — and its RLS reads tenant_id. Same for `insurance.type_catalog`. These are not "both columns disagree" cases; they are "the canonical column was never added".

## 6. What is legitimately global, and must stay that way

    insurance.type_catalog   RLS policy: USING (true)

That table is deliberately shared read-write across all three entities. It is a catalog, not a record. Adding a company scope to it would break every entity's ability to read the shared type list. **Do not "fix" this one.** It belongs in the sweep's allow-list with the reason written down.

## 7. What this exposed on the way past — duplicate master tables

Following `tenant_id` turned up a second generation of master tables living beside the canonical ones:

    accounting.coa_account ................... 1 row      vs  catalogs.accounts ..... 1,591 rows
    accounting.ps_item ....................... 1 row      vs  catalogs.items ........   392 rows
    accounting.bill_unit_allocation .......... 0 rows
    mdata.mx_tolls_ledger .................... 0 rows
    maintenance.internal_labor_log ........... 1 row
    maint.part ............................... 144 rows   (0 of them USMCA)
    mdata.assets ............................. 143 rows   (100 of them USMCA)   <-- LIVE
                                                          vs  mdata.units ..... 196 rows

The stubs with 0 or 1 row are abandoned scaffolding — cheap to retire with an AUTH.

**`mdata.assets` is not a stub.** 143 rows, 100 of them USMCA, scoped by `tenant_id`, sitting beside `mdata.units` (196 rows), which the canonical table law names as a hub. Two asset tables with real USMCA data in both is a question that has to be answered before any report that counts assets can be trusted. I have not touched it and I am not guessing what it is for. It goes on the owner's decision list.

`maint.part` with 144 rows is on the NEVER WRITE side of the canonical table law (`maintenance.*` is canonical, `maint.*` is not). None of those rows are USMCA, so it is not a USMCA problem today, but something wrote 144 rows into a forbidden table.

## 8. The recommendation

**`operating_company_id` is canonical. `tenant_id` is retired.**

Reasons, in order of weight:

1. 665 tables and 788 RLS policies already use it, against 35 and 24. The cost of standardising on the minority column is twenty times higher and buys nothing.
2. The session variable every policy compares against is already named `app.operating_company_id`. Even the tenant policies read that variable. The system already decided; the schema just has not caught up.
3. `catalogs.accounts`, `mdata.loads`, `mdata.units`, `org.companies`, `identity.users` — every hub in the canonical table law is scoped by `operating_company_id`. A financial record has to join to those hubs. Scoping a factoring row by a different column than the invoice it factors is how a cross-entity row gets written without anything refusing it.
4. "Tenant" is the wrong word for this business anyway. There is no tenant. There are three carriers the owner owns.

**How it is done — the order matters, and no step is optional:**

1. **Guard first, before any data change.** One check that refuses any new table carrying a `tenant_id` column, and refuses any new RLS policy keyed on one. Stop the bleeding before cleaning the wound.
2. **Fix the writers**, not the rows. The null in `insurance.payment_schedule` came from a writer that does not require `operating_company_id`. Add `NOT NULL` where the data permits it, and make the writer pass the company explicitly.
3. **Backfill `operating_company_id` from `tenant_id`** wherever the company column is null or absent, one table at a time, with a before/after count per table under the bypass. Where the table has no `operating_company_id` column (`canonical_factor_agreements`, `type_catalog`), add it.
4. **Rebuild the two composite same-entity foreign keys** on `operating_company_id`, with the supporting unique index on the new column pair, before dropping anything.
5. **Drop the duplicate tenant RLS policies** on the three factoring tables, so the OR widening is gone.
6. **Then, and only then,** drop the `tenant_id` columns — or keep them as generated mirrors if anything external reads them.
7. **Allow-list `insurance.type_catalog`** explicitly, with the reason, so a later sweep does not "fix" it.

Every step is additive or reversible until step 6. Nothing in steps 1 through 5 can lose a row.

## 9. What I need from the owner

- **Confirm `operating_company_id` is canonical and `tenant_id` is retired.** One word. My recommendation is yes, for the four reasons above.
- **`mdata.assets`** — 143 rows, 100 USMCA, beside `mdata.units`. What is it? Keep, merge into units/equipment, or retire? I will not guess at an asset table with live USMCA data in it.
- **AUTH to retire the stubs**: `accounting.coa_account` (1 row), `accounting.ps_item` (1 row), `accounting.bill_unit_allocation` (0), `mdata.mx_tolls_ledger` (0), `bank.reconciliation_matches` (0). Each gets the row count pasted as the proof before the drop.

## 10. One correction to my own sweep

In the key-sweep workbook I classified `uq_factoring_factor_tenant_id (tenant_id, id)` as Class T, needing a ruling. It is not a defect. It is the required target index for the two composite same-entity foreign keys on `factoring.canonical_factor_agreements`. Class T on that row drops from 7 to 6 real items. The workbook tab will be corrected; I am recording the error rather than quietly editing it.
