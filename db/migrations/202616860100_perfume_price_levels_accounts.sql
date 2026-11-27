-- PERFUME-PRICE-LEVELS + CUSTOMER-ACCOUNTS (ScentsX). Owner 2026-11-26 20:21 CT: "different price levels credit limits approvals
-- new accounts new credit accounts"; 20:28 CT: levels Retail, Wholesale, Distributor, Export Mexico (each a markup on cost or a
-- fixed price per item); he approves every new credit account and any limit over $25,000.
--
-- A price level is a rule (markup or margin % on the item's cost — his moving-average cost or the best supplier cost) plus
-- optional fixed prices per item and quantity. A customer (a Contacts company) has one account: how it pays (cash, prepaid,
-- credit, export), its level, terms, limit and hold. A credit account exists only through an approved credit application.
-- History is append-only. The levels are seeded by name only; their percentages are the owner's to set (NULL until then).

CREATE TABLE IF NOT EXISTS perfume.price_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  channel text NOT NULL CHECK (channel IN ('retail', 'wholesale', 'distributor', 'export')),
  method text NOT NULL DEFAULT 'markup' CHECK (method IN ('markup', 'margin')),
  pct numeric(6, 3) CHECK (pct IS NULL OR (pct >= 0 AND pct < 1000)),
  cost_basis text NOT NULL DEFAULT 'avg' CHECK (cost_basis IN ('avg', 'best_vendor')),
  floor_pct numeric(6, 3) CHECK (floor_pct IS NULL OR floor_pct >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (method <> 'margin' OR pct IS NULL OR pct < 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS price_levels_name_uq ON perfume.price_levels (lower(name));
INSERT INTO perfume.price_levels (name, channel, sort_order) VALUES
  ('Retail', 'retail', 10), ('Wholesale', 'wholesale', 20), ('Distributor', 'distributor', 30), ('Export Mexico', 'export', 40)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS perfume.price_level_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id uuid NOT NULL REFERENCES perfume.price_levels(id),
  item_id uuid NOT NULL REFERENCES perfume.items(id),
  min_qty integer NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
  price_cents bigint NOT NULL CHECK (price_cents >= 0),
  archived_at timestamptz,
  updated_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS price_level_items_uq ON perfume.price_level_items (level_id, item_id, min_qty) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS price_level_items_item_idx ON perfume.price_level_items (item_id);

CREATE TABLE IF NOT EXISTS perfume.customer_accounts (
  company_id uuid PRIMARY KEY REFERENCES perfume.contact_companies(id),
  account_type text NOT NULL DEFAULT 'cash' CHECK (account_type IN ('cash', 'prepaid', 'credit', 'export')),
  price_level_id uuid REFERENCES perfume.price_levels(id),
  terms_days integer CHECK (terms_days IS NULL OR terms_days BETWEEN 0 AND 365),
  credit_limit_cents bigint CHECK (credit_limit_cents IS NULL OR credit_limit_cents >= 0),
  on_hold boolean NOT NULL DEFAULT false,
  hold_reason text,
  approved_by uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  review_on date,
  tax_number text,
  resale_certificate boolean NOT NULL DEFAULT false,
  notes text,
  updated_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A credit account is approved (it came through an approved credit application) and carries a limit and terms.
  CHECK (account_type <> 'credit' OR (approved_by IS NOT NULL AND credit_limit_cents IS NOT NULL AND terms_days IS NOT NULL)),
  CHECK (NOT on_hold OR hold_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS customer_accounts_level_idx ON perfume.customer_accounts (price_level_id);

CREATE TABLE IF NOT EXISTS perfume.credit_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  legal_name text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 1 AND 300),
  tax_number text,
  address text,
  owners text,
  trade_references text,
  bank_reference text,
  requested_limit_cents bigint NOT NULL CHECK (requested_limit_cents > 0),
  requested_terms_days integer NOT NULL CHECK (requested_terms_days BETWEEN 0 AND 365),
  resale_certificate boolean NOT NULL DEFAULT false,
  personal_guarantee boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'withdrawn')),
  approved_limit_cents bigint CHECK (approved_limit_cents IS NULL OR approved_limit_cents > 0),
  approved_terms_days integer CHECK (approved_terms_days IS NULL OR approved_terms_days BETWEEN 0 AND 365),
  decision_note text,
  decided_by uuid REFERENCES identity.users(id),
  decided_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'approved' OR (decided_by IS NOT NULL AND approved_limit_cents IS NOT NULL AND approved_terms_days IS NOT NULL)),
  CHECK (status <> 'rejected' OR (decided_by IS NOT NULL AND decision_note IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS credit_applications_company_idx ON perfume.credit_applications (company_id, created_at);

CREATE TABLE IF NOT EXISTS perfume.customer_account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  kind text NOT NULL CHECK (kind IN ('created', 'changed', 'hold', 'release', 'application', 'approved', 'rejected', 'withdrawn', 'level_price')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS customer_account_events_company_idx ON perfume.customer_account_events (company_id, created_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['price_levels', 'price_level_items', 'customer_accounts', 'credit_applications', 'customer_account_events'] LOOP
    EXECUTE format('ALTER TABLE perfume.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE perfume.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON perfume.%I', t || '_owner_only', t);
    EXECUTE format('CREATE POLICY %I ON perfume.%I USING (perfume.is_owner()) WITH CHECK (perfume.is_owner())', t || '_owner_only', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON perfume.price_levels, perfume.price_level_items, perfume.customer_accounts, perfume.credit_applications TO ih35_app;
GRANT SELECT, INSERT ON perfume.customer_account_events TO ih35_app;
