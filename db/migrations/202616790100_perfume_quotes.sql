-- PERFUME-QUOTES (owner 2026-11-26 18:13 CT: "we need exporters to excel, we need pdfs, we need quotations, and then
-- historoy for quotations"). A quotation is an offer to one customer: numbered QT-000001, lines from desk items with the
-- cost read from the current vendor lists at the time, a status (draft → sent → accepted / rejected / expired), and its
-- full history. Excel and PDF are made from it on request.
--
-- 1) perfume.quotes        — the header: number, customer (perfume.contact_companies, name kept as written), dates, status.
-- 2) perfume.quote_lines   — one line per item: what it says, qty, unit price, the cost seen when it was added.
-- 3) perfume.quote_events  — the history: created, edited, line added / changed / taken off, status, exported, copied.
--
-- Isolated perfume schema (ScentsX LLC): no operating_company_id, never posts to accounting (owner: "maybe later"),
-- references only perfume.* and identity.users. FORCE RLS owner-only. No DELETE grant: lines are archived, never deleted.
-- Money is integer cents, exact (owner 2026-11-20: never rounded unless asked). Additive, idempotent.

CREATE SEQUENCE IF NOT EXISTS perfume.quote_number_seq START 1;

CREATE TABLE IF NOT EXISTS perfume.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL DEFAULT ('QT-' || lpad(nextval('perfume.quote_number_seq')::text, 6, '0')),
  company_id uuid REFERENCES perfume.contact_companies(id),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 300),
  customer_email text,
  customer_phone text,
  quote_date date NOT NULL DEFAULT current_date,
  valid_until date CHECK (valid_until IS NULL OR valid_until >= quote_date),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'MXN')),
  terms text,
  notes text,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS quotes_number_uq ON perfume.quotes (number);
CREATE INDEX IF NOT EXISTS quotes_company_idx ON perfume.quotes (company_id);

CREATE TABLE IF NOT EXISTS perfume.quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES perfume.quotes(id),
  line_no integer NOT NULL CHECK (line_no > 0),
  item_id uuid REFERENCES perfume.items(id),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 400),
  upc text,
  qty integer NOT NULL CHECK (qty > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  cost_cents bigint CHECK (cost_cents IS NULL OR cost_cents >= 0),
  cost_vendor_id uuid REFERENCES perfume.vendors(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_lines_quote_idx ON perfume.quote_lines (quote_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS quote_lines_item_idx ON perfume.quote_lines (item_id);

CREATE TABLE IF NOT EXISTS perfume.quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES perfume.quotes(id),
  kind text NOT NULL CHECK (kind IN ('created', 'edited', 'line_added', 'line_changed', 'line_removed', 'status', 'exported_xlsx', 'exported_pdf', 'copied_from')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_events_quote_idx ON perfume.quote_events (quote_id, created_at);

ALTER TABLE perfume.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.quotes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotes_owner_only ON perfume.quotes;
CREATE POLICY quotes_owner_only ON perfume.quotes USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.quotes TO ih35_app;

ALTER TABLE perfume.quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.quote_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quote_lines_owner_only ON perfume.quote_lines;
CREATE POLICY quote_lines_owner_only ON perfume.quote_lines USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.quote_lines TO ih35_app;

-- History is append-only: no UPDATE either.
ALTER TABLE perfume.quote_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.quote_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quote_events_owner_only ON perfume.quote_events;
CREATE POLICY quote_events_owner_only ON perfume.quote_events USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT ON perfume.quote_events TO ih35_app;

GRANT USAGE, SELECT ON SEQUENCE perfume.quote_number_seq TO ih35_app;
