# Design — Commodity / Product Catalog + Derived Mappings

**Blocks covered:** 0251-gap10 (product/service catalog + `product_id` FK on commodity),
0251-gap11 (commodity → revenue-GL selection), 0251-gap12 (commodity → equipment mapping),
0251-gap13 (commodity → rate matrix).
**Status:** DESIGN ONLY. **Classification: FINANCIAL for gap11** (revenue-GL selection = posting logic);
gap10/12/13 are dispatch catalogs but each needs a new table / an `mdata` FK column → migration →
gated (§1.3/§1.4). Owner ceremony required; agent never self-merges, never builds GL math solo.

## 1. Verified current state (repo, 2026-07-11 — prod UNVERIFIED, needs live check)
- `mdata.loads.commodity` is **free TEXT**, plus `commodity_value_cents BIGINT`
  (`db/migrations/0313_border_crossing_wizard.sql:24-25`). There is **no** `product_id` FK, **no**
  product/service catalog table anywhere in `db/migrations/`.
- Because commodity is free text, it cannot drive revenue GL, equipment validation, or rate lookup.

## 2. Proposed schema (idempotent, RLS-forced, grant-complete — owner applies)
```sql
-- catalogs.products — product/service catalog (gap10). Mirrors QBO Product/Service so a load's
-- commodity resolves to a catalog row (parity with mdata.qbo_* mirror; canonical mirror = mdata.qbo_*).
CREATE TABLE IF NOT EXISTS catalogs.products (
  id                    uuid PRIMARY KEY DEFAULT uuidv7(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  name                  text NOT NULL,
  sku                   text,
  income_account_id     uuid REFERENCES catalogs.accounts(id) ON DELETE SET NULL, -- gap11 (RECOMMENDATION, Opt-B)
  requires_equipment    text CHECK (requires_equipment IN ('dry_van','reefer','flatbed','tanker','none')), -- gap12
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, name)
);
-- additive: ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES catalogs.products(id); -- gap10 FK
-- gap13: catalogs.commodity_rate_matrix (product_id, origin_zone, dest_zone, equipment, rate_cents, basis)
-- RLS FORCE + policy on operating_company_id + GRANTs (0065) + audit trigger on every new table/column.
```

- `income_account_id` = **Option-B RECOMMENDATION ONLY** (never auto-post), same rule as
  vendor/customer default accounts.
- `requires_equipment` (gap12) is an operational validation input — the equipment-selection gate reads it
  read-only; it is not financial by itself, but ships in the same migration.

## 3. Linkage matrix (§10-d)
- products → `catalogs.accounts` (income GL), `org.companies`. loads → products (`product_id`).
- gap12: equipment-selection validation (dispatch) reads `requires_equipment` vs the load's assigned
  unit/trailer type — reverse-links commodity ↔ equipment (safety/dispatch modules).
- gap13: rate matrix read by the rate-quote path — reverse-links commodity ↔ pricing.
- Canonical QBO mirror stays `mdata.qbo_*` — do NOT write `accounting.qbo_*` (RETIRE).

## 4. acceptance[] (at build time)
- `table` catalogs.products (+ commodity_rate_matrix) on prod; `column` mdata.loads.product_id;
  `fk` product_id → catalogs.products, income_account_id → catalogs.accounts; `rls` forced.
- `route` catalog CRUD registered + mounted; `guard` verify-*.mjs (table/FK/RLS + no auto-post).
- gap11 revenue-GL selection is posting logic — design only; NOT built solo.

## 5. Why HOLD
New `catalogs.*` tables + an `mdata.loads` FK column + revenue-GL selection = financial cluster / schema
change (§1.3/§1.4). Build requires owner ceremony (full SQL shown, explicit OK).
