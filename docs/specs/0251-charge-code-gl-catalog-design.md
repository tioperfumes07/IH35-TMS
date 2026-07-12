# Design — Charge-Code Catalog + GL-Account Mapping + Default Rates

**Blocks covered:** 0251-gap5 (charge-code → GL mapping), 0251-gap7 (fuel-surcharge GL),
0251-gap8 (accessorials GL), 0251-gap16 (charge-code catalog), 0251-gap17 (charge-code default rates).
**Status:** DESIGN ONLY. **Classification: FINANCIAL** (new `catalogs.*` tables + GL wiring →
migration = financial cluster, §1.4). Owner ceremony required before any migration is applied — an
agent NEVER self-merges this and NEVER builds the GL-posting math solo.

## 1. Verified current state (repo, 2026-07-11 — prod UNVERIFIED, needs live check)
- **No charge-code catalog exists.** `grep charge_code_catalog|charge_codes|catalogs.charge`
  over `db/migrations/` + `apps/backend/src/` → 0 matches.
- Charge "types" today are an **inline CHECK enum**, not a table:
  `line_type IN ('linehaul','fsc','detention','layover','lumper','tonu','accessorial','tax','adjustment','other')`
  on `accounting.invoices` line items (`db/migrations/0060_p3_t11_20_1_accounting_invoices_schema.sql:66`,
  re-declared `0123_...:1400`).
- Accessorials are stored as free `jsonb` (`customer_lanes.accessorials jsonb`,
  `0059_...:15`; `0123_...:1331`) and as `stop_extra_rates.rate_type IN (...)`
  (`202606080202_stop_extra_rates.sql:10`). No FK to a code table, no GL account.
- Canonical GL ledger = **`catalogs.accounts`** (per §10 map + `gl-ledger-map` memory). Any charge→account
  FK must reference `catalogs.accounts(id)`, never a mirror.

**Consequence:** charge codes are free-typed / enum-bound and map to NO GL account. Revenue and
accessorial categorization cannot be derived at posting time; it relies entirely on QBO-side sync.

## 2. Proposed schema (idempotent, RLS-forced, grant-complete — owner applies)
Migration number must be strictly above the current max (`202607270000_*`), re-checked at push time.

```sql
-- catalogs.charge_codes — the code catalog (gap16) + default rate (gap17) + GL map (gap5/7/8)
CREATE TABLE IF NOT EXISTS catalogs.charge_codes (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  code                   text NOT NULL,                       -- e.g. 'LINEHAUL','FSC','DETENTION'
  label                  text NOT NULL,
  charge_kind            text NOT NULL CHECK (charge_kind IN
                           ('linehaul','fsc','detention','layover','lumper','tonu','accessorial','tax','adjustment','other')),
  revenue_account_id     uuid REFERENCES catalogs.accounts(id) ON DELETE SET NULL,  -- gap5/7/8 GL map (RECOMMENDATION, Opt-B)
  default_rate_cents     bigint,                              -- gap17 default rate (nullable)
  default_rate_basis     text CHECK (default_rate_basis IN ('flat','per_mile','per_stop','pct_linehaul')),
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, code)
);
ALTER TABLE catalogs.charge_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.charge_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY charge_codes_rls ON catalogs.charge_codes
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
-- + GRANTs to ih35_app (0065 pattern) or it 500s at runtime; + audit trigger; + DEFAULT PRIVILEGES.
```

- **`revenue_account_id` is Option-B RECOMMENDATION ONLY** (mirrors the settled vendor/customer decision:
  `vendor-customer-categorization-option-b`) — it pre-fills the account on a charge line, the user always
  sees and can override, it **never silently auto-posts**.
- `ON DELETE SET NULL` so a retired account never blocks a charge-code edit (same pattern as
  `mdata.vendors.default_expense_account_id`, `202607110230`).

## 3. Linkage matrix (§10-d — both directions)
- charge_codes → `catalogs.accounts` (revenue GL), `org.companies` (entity).
- Forward use: invoice line + `stop_extra_rates` + `customer_lanes.accessorials` gain an optional
  `charge_code_id` FK (separate additive migration) so a typed line resolves to a code → GL account.
- Reverse: an account detail screen can list charge codes that map to it (read-only drill-through).
- **No RETIRE writes.** Canonical GL = `catalogs.accounts`.

## 4. Machine-checkable acceptance[] (at build time)
- `table` catalogs.charge_codes exists on prod; `column` revenue_account_id, default_rate_cents present.
- `fk` revenue_account_id → catalogs.accounts(id); `rls` forced policy present.
- `route` GET/POST `/api/v1/catalogs/charge-codes` registered + `mounted` in the router tree.
- `guard` a `scripts/verify-*.mjs` asserting the table+FK+RLS exist and `revenue_account_id` is
  RECOMMENDATION-only (no auto-post call in the posting path).
- `data` seed defaults (LINEHAUL, FSC, accessorials) — **owner-entered**, not agent-posted.

## 5. Why HOLD (not built here)
New `catalogs.*` table + a `db/migrations/*.sql` = financial cluster (§1.4). Charge→revenue-GL selection
is posting logic (§1.4 forbids building GL math solo). Deliverable of this pass = this design + verified
current-state evidence. Build requires owner ceremony: branch → local fresh-DB migrate → show full SQL →
explicit "OK to merge".
