# Fixed Assets — Data-Model Spec (ASC 360) — Migration-Ready

**Status:** Design / Docs only. No code, no DDL executed, no posting. This document IS the
migration Claude Coder will build (Coder is the sole migration writer; Cascade never writes a
migration file). Build gated behind a flag default OFF; GUARD verifies vs QuickBooks before merge.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Supersedes for data-model purposes:** the table sketch in `FH-1-FIXED-ASSETS-DEPRECIATION-DESIGN.md` §6.
**Carries forward FH-1 locked decisions** (do not relitigate): BOOK-ONLY basis, **straight-line default**,
**5-year default useful life**, **vehicles-only classes (trucks · trailers · cars)**, **half-month
convention**, **auto-post gated OFF**, owner/lessor = TRK (multi-entity).
**Pattern source (proven sibling):** `db/migrations/202606271610_prepaid_expenses_data_model.sql`
(cents spine · RLS ENABLE+FORCE · soft-delete · audit cols · posting gated by feature flag).

---

## 0. Scope and the QBO gap

QuickBooks Online does **not** auto-post depreciation (even the Advanced Fixed Asset module computes a
schedule but does not create the monthly JE). This model closes that gap with an asset register + a
per-asset depreciation schedule + a **gated** auto-post cron (Dr Depreciation Expense / Cr Accumulated
Depreciation). With the flag OFF the schedule is computed and visible but nothing posts.

**ASC 360 (Property, Plant & Equipment)** is the governing standard. The data model stores a `method`
enum supporting the three common book methods —
- `straight_line` (BUILT — the only book method per FH-1),
- `declining_balance` (150DB/DDB — schema-supported, reference; CPA-external),
- `units_of_production` (schema-supported, reference) —
so the table is future-proof, while the **engine builds straight-line only** now.

All amounts are integer **cents**. Rates are exact decimals. Every table carries `is_active` +
soft-delete (`deleted_at`) + audit columns, tenant-scoped by `operating_company_id` with RLS
ENABLE + FORCE, matching the prepaid sibling exactly.

---

## 1. Schema choice

Tables live in the existing canonical **`accounting`** schema (same as `accounting.prepaid_assets`),
NOT a new `fixed_assets` schema. Rationale: (a) consistency with the most recent shipped UI-1 sibling,
(b) avoids adding a new schema that the CC-02 deprecated-schema/one-dir guards would have to learn,
(c) depreciation is core double-entry accounting. (FH-1 §6 proposed a `fixed_assets.*` schema; this
spec overrides that for the reasons above — flag to Jorge if a dedicated schema is preferred.)

---

## 2. Table: `accounting.fixed_asset_classes`

Editable class catalog. Holds the per-class defaults (method, useful life, GL accounts). Seeded with
the three vehicle classes; `land` kept as a non-depreciating guard if ever added.

```sql
CREATE TABLE IF NOT EXISTS accounting.fixed_asset_classes (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  class_code                  text        NOT NULL,           -- 'truck' | 'trailer' | 'car' | 'land'
  class_name                  text        NOT NULL,
  is_depreciable              boolean     NOT NULL DEFAULT true,  -- false for land
  default_method              text        NOT NULL DEFAULT 'straight_line'
                                CHECK (default_method IN ('straight_line','declining_balance','units_of_production')),
  default_useful_life_months  int         NOT NULL DEFAULT 60 CHECK (default_useful_life_months > 0),
  default_asset_account_id    uuid        REFERENCES catalogs.accounts(id),
  default_accum_depr_account_id uuid      REFERENCES catalogs.accounts(id),
  default_depr_expense_account_id uuid    REFERENCES catalogs.accounts(id),
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_asset_classes_company_code
  ON accounting.fixed_asset_classes (operating_company_id, class_code)
  WHERE is_active = true;
```

---

## 3. Table: `accounting.fixed_assets`

The register. One row per asset. FK `unit_uuid` → `mdata.units` where the asset is a truck/trailer
(reuse, do not duplicate). `owner_operating_company_id` = lessor/title-holder (TRK); depreciation books
at the owner per FH-1 §1.4.

```sql
CREATE TABLE IF NOT EXISTS accounting.fixed_assets (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  owner_operating_company_id  uuid        NOT NULL REFERENCES org.companies(id), -- lessor (TRK)
  asset_number                text,
  name                        text        NOT NULL,
  class_id                    uuid        NOT NULL REFERENCES accounting.fixed_asset_classes(id),
  unit_uuid                   uuid        REFERENCES mdata.units(id),  -- VIN/serial link where vehicle
  vin_serial                  text,
  -- cost basis
  purchase_price_cents        bigint      NOT NULL CHECK (purchase_price_cents >= 0),
  salvage_value_cents         bigint      NOT NULL DEFAULT 0 CHECK (salvage_value_cents >= 0),
  purchase_date               date        NOT NULL,
  in_service_date             date        NOT NULL,          -- drives half-month convention
  -- depreciation params
  method                      text        NOT NULL DEFAULT 'straight_line'
                                CHECK (method IN ('straight_line','declining_balance','units_of_production')),
  useful_life_months          int         NOT NULL DEFAULT 60 CHECK (useful_life_months > 0),
  convention                  text        NOT NULL DEFAULT 'half_month'
                                CHECK (convention IN ('half_month','mid_month','half_year','full_month')),
  -- back-dating (FH-1 §4): opening balance, not re-posted
  prior_accumulated_depr_cents bigint     NOT NULL DEFAULT 0 CHECK (prior_accumulated_depr_cents >= 0),
  -- units-of-production inputs (nullable; only for that method)
  total_expected_units        bigint      CHECK (total_expected_units IS NULL OR total_expected_units > 0),
  -- GL accounts (resolved from class default, overridable per asset)
  asset_account_id            uuid        REFERENCES catalogs.accounts(id),
  accum_depr_account_id       uuid        REFERENCES catalogs.accounts(id),
  depr_expense_account_id     uuid        REFERENCES catalogs.accounts(id),
  -- acquisition posting (Dr Asset / Cr cash|note|AP) — owned by FH-2 when created via loan wizard
  acquisition_je_id           uuid        REFERENCES accounting.journal_entries(id),
  -- lifecycle
  status                      text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','fully_depreciated','disposed','voided')),
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  voided_at                   timestamptz,
  voided_by_user_id           uuid        REFERENCES identity.users(id),
  void_reason                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id),
  CONSTRAINT fixed_assets_salvage_le_cost CHECK (salvage_value_cents <= purchase_price_cents)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_assets_company_number
  ON accounting.fixed_assets (operating_company_id, asset_number)
  WHERE asset_number IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_company_status
  ON accounting.fixed_assets (operating_company_id, status);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_owner
  ON accounting.fixed_assets (owner_operating_company_id, status);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_unit
  ON accounting.fixed_assets (unit_uuid) WHERE unit_uuid IS NOT NULL;
```

---

## 4. Table: `accounting.depreciation_schedule_rows`

One row per asset per period. Regeneratable; superseded rows are soft-deleted (audited), never hard
deleted. `posted_journal_entry_id` links the posted depreciation JE. Idempotency: unique on
`(asset_id, period_number)` among active rows — a period already posted is never double-posted.

```sql
CREATE TABLE IF NOT EXISTS accounting.depreciation_schedule_rows (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  asset_id                    uuid        NOT NULL REFERENCES accounting.fixed_assets(id) ON DELETE RESTRICT,
  period_number               int         NOT NULL CHECK (period_number > 0),
  period_date                 date        NOT NULL,           -- first of the period month
  depreciation_amount_cents   bigint      NOT NULL CHECK (depreciation_amount_cents >= 0),
  accumulated_to_date_cents   bigint      NOT NULL CHECK (accumulated_to_date_cents >= 0),
  book_value_end_cents        bigint      NOT NULL CHECK (book_value_end_cents >= 0),
  method_snapshot             text        NOT NULL,           -- method + formula at generation time
  units_this_period           bigint,                          -- units-of-production only
  posted                      boolean     NOT NULL DEFAULT false,
  posted_journal_entry_id     uuid        REFERENCES accounting.journal_entries(id),
  posted_at                   timestamptz,
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_depr_schedule_active_period
  ON accounting.depreciation_schedule_rows (asset_id, period_number)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_depr_schedule_company_asset
  ON accounting.depreciation_schedule_rows (operating_company_id, asset_id);

CREATE INDEX IF NOT EXISTS idx_depr_schedule_pending
  ON accounting.depreciation_schedule_rows (operating_company_id, period_date)
  WHERE posted = false AND is_active = true;
```

---

## 5. Table: `accounting.fixed_asset_disposals`

Disposal / sale. Reverses remaining book value and posts gain/loss.
JE shape (FH-1 §2): Dr Cash (proceeds) · Dr Accumulated Depreciation (to date) · Cr Asset (cost) ·
Dr/Cr Gain-or-Loss on Disposal (plug).

```sql
CREATE TABLE IF NOT EXISTS accounting.fixed_asset_disposals (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  asset_id                    uuid        NOT NULL REFERENCES accounting.fixed_assets(id) ON DELETE RESTRICT,
  disposal_date               date        NOT NULL,
  disposal_type               text        NOT NULL DEFAULT 'sale'
                                CHECK (disposal_type IN ('sale','scrap','trade_in','casualty')),
  proceeds_cents              bigint      NOT NULL DEFAULT 0 CHECK (proceeds_cents >= 0),
  book_value_at_disposal_cents bigint     NOT NULL CHECK (book_value_at_disposal_cents >= 0),
  gain_loss_cents             bigint      NOT NULL,           -- signed: + gain, - loss
  gain_loss_account_id        uuid        REFERENCES catalogs.accounts(id),
  disposal_je_id              uuid        REFERENCES accounting.journal_entries(id),
  posting_status              text        NOT NULL DEFAULT 'unposted'
                                CHECK (posting_status IN ('unposted','posted','reversed')),
  posted_at                   timestamptz,
  notes                       text,
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_asset_disposal_active
  ON accounting.fixed_asset_disposals (asset_id)
  WHERE is_active = true;
```

---

## 6. Grants + RLS (ENABLE + FORCE) — exact pattern from prepaid sibling

```sql
GRANT SELECT, INSERT, UPDATE ON accounting.fixed_asset_classes        TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.fixed_assets               TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.depreciation_schedule_rows TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.fixed_asset_disposals      TO ih35_app;
```

For EACH of the four tables (template — repeat per table):

```sql
ALTER TABLE accounting.<table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.<table> FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS <table>_company_scope ON accounting.<table>;
CREATE POLICY <table>_company_scope ON accounting.<table> FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );
```

> Note: this model ships RLS **FORCE-ON** from day one — it does not inherit the G3 FORCE-OFF debt.

---

## 7. Feature flags (posting GATED OFF)

```sql
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('FIXED_ASSETS_ENABLED',
   'UI-1 Fixed Assets — asset register + depreciation schedule (read/compute). GL posting OFF.',
   false),
  ('FIXED_ASSET_AUTOPOST_ENABLED',
   'Fixed Assets — auto-post monthly depreciation JE (Dr Depr Expense / Cr Accum Depr) + disposal JE. Default OFF. GUARD-gated.',
   false)
ON CONFLICT (flag_key) DO NOTHING;
```

Behavior:
- `FIXED_ASSETS_ENABLED` OFF → page hidden / shell. ON → register + schedule visible, **no posting**.
- `FIXED_ASSET_AUTOPOST_ENABLED` OFF → balanced-JE **preview** always returned; posting **refused**
  (fail-loud, never silent). ON → cron posts on the 1st, idempotent per `(asset_id, period_number)`.
- Same gating pattern as `PREPAID_EXPENSES_POST_ENABLED` / `EXPENSE_GL_POSTING_FLAG_KEY` / CHAIN-03.

---

## 8. Depreciation math (engine builds §8.1 only)

Depreciable base = `purchase_price_cents − salvage_value_cents`.

### 8.1 Straight-line (BUILT)
`monthly = (purchase_price_cents − salvage_value_cents) / useful_life_months`, integer-cents with the
remainder carried to the final period so the schedule sums exactly to the depreciable base. Half-month
convention: in-service first half of month → start 1st of that month; second half → 1st of next month.
Back-dating: resume from `book_value = cost − prior_accumulated`, remaining life =
`useful_life_months − months_elapsed`; prior depreciation is an **opening balance**, not re-posted.

### 8.2 Declining-balance (schema-supported, reference — CPA-external, not built)
`rate = factor / useful_life_years` (150DB factor=1.5; DDB factor=2.0). `period = book_value_begin ×
rate / 12`. Ignores salvage in formula; clamp at salvage; optional switch-to-SL. Documented for
completeness only.

### 8.3 Units-of-production (schema-supported, reference — not built)
`per_unit = (cost − salvage) / total_expected_units`; `period = per_unit × units_this_period`.
`units_this_period` + `total_expected_units` columns exist to support it later.

---

## 9. Idempotency + double-entry safety (locked)

- Auto-post is idempotent: the unique `(asset_id, period_number)` index on active schedule rows + the
  `posted` flag mean a period posts at most once.
- Every JE pair (depreciation; disposal) posts atomically and **must balance or fail hard** — reuse
  `createJournalEntry` + period-close guard (closed period blocks posting into it).
- VOID ≠ DELETE: voids stamp `voided_at` / `void_reason`; schedule/disposal rows are soft-deleted on
  regeneration, never hard-deleted.

---

## 10. Instructions for Claude Coder (CC migration)

1. This spec is migration-ready. Build it as ONE migration in `db/migrations/` with a timestamp that
   sorts after the current last applied migration.
2. Create the 4 tables in §2–§5, the grants + RLS (ENABLE+FORCE) in §6, the flags in §7. Idempotent
   (`IF NOT EXISTS`), cents spine, audit cols — exactly like `202606271610_prepaid_expenses_data_model.sql`.
3. Do NOT add any posting code in the migration. Posting is engine code, gated by §7 flags, separate PR.
4. Seed `fixed_asset_classes` with truck/trailer/car (depreciable, default SL, 60 months) and land
   (`is_depreciable=false`) — per-company seed or app-side; your call, flag if you seed in the migration.
5. Confirm `catalogs.accounts`, `mdata.units`, `accounting.journal_entries`, `org.companies`,
   `identity.users`, `lib.feature_flags` all exist on the fresh-migrated schema (they do as of #1573).
6. BUILD-AND-HOLD. Open PR, do not merge. Tier-1 (creates tables) → JORGE-APPROVED label + GUARD branch-verify.

---

## 11. DO NOT (mirrors permanent danger blocks)

- DO NOT enable either flag (D5 — no money flag flips).
- DO NOT post depreciation/disposal JEs in the data-model migration (tables only).
- DO NOT build declining-balance or units-of-production engines (book = straight-line only, FH-1 locked).
- DO NOT add a new schema without flagging — this spec uses canonical `accounting`.
- DO NOT dual book+tax schedule (FH-1: BOOK ONLY; CPA handles tax basis externally).
