-- Block M — customer portal magic-link tokens (mdata.customers; spec referenced sales.customers which is not in this schema).

BEGIN;

CREATE SCHEMA IF NOT EXISTS portal;

CREATE TABLE IF NOT EXISTS portal.magic_link_tokens (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES mdata.customers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_ip INET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_portal_magic_link_tokens_email_unused
  ON portal.magic_link_tokens (email, expires_at)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_portal_magic_link_tokens_customer
  ON portal.magic_link_tokens (customer_id, created_at DESC);

GRANT USAGE ON SCHEMA portal TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON portal.magic_link_tokens TO ih35_app;

COMMIT;
