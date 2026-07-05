-- D1-4: Sub-customer -> parent HARD LINK on mdata.customers.
--
-- Today mdata.customers has NO parent column, so the "Parent *" field a sub-customer
-- form collects (PR #2061 added client validation only) cannot persist. This migration
-- adds the real self-referential FK so a sub-customer LINKS to its parent, enabling
-- forward persist (create/edit) and reverse drill-through (a parent lists its subs).
--
-- ADDITIVE + NON-FINANCIAL. No posting / GL / money. Nullable (a top-level customer has
-- no parent). void-not-delete unaffected. RLS / security_invoker UNCHANGED — the tenant
-- scope policy on mdata.customers keys on the row's own operating_company_id, and the
-- application layer additionally enforces same-company parent + self/cycle guards.
--
-- GRANTS: column-level privileges are inherited from the existing table GRANTs to
-- ih35_app (migration 0065 GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES ... +
-- DEFAULT PRIVILEGES). Adding a column to an already-granted table needs NO new GRANT.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded FK/index creation (safe to re-run).

BEGIN;

-- 1. Nullable self-referential parent pointer.
ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS parent_customer_id uuid;

-- 2. Self-referential FK (guarded so re-runs don't collide on the constraint name).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_parent_customer_id_fkey'
      AND conrelid = 'mdata.customers'::regclass
  ) THEN
    ALTER TABLE mdata.customers
      ADD CONSTRAINT customers_parent_customer_id_fkey
      FOREIGN KEY (parent_customer_id)
      REFERENCES mdata.customers (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. A customer can never be its own parent (belt-and-suspenders under the app guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_parent_not_self_chk'
      AND conrelid = 'mdata.customers'::regclass
  ) THEN
    ALTER TABLE mdata.customers
      ADD CONSTRAINT customers_parent_not_self_chk
      CHECK (parent_customer_id IS NULL OR parent_customer_id <> id);
  END IF;
END $$;

-- 4. Reverse drill-through index: fast "list this parent's sub-customers".
CREATE INDEX IF NOT EXISTS idx_customers_parent_customer_id
  ON mdata.customers (parent_customer_id)
  WHERE parent_customer_id IS NOT NULL;

COMMENT ON COLUMN mdata.customers.parent_customer_id IS
  'Sub-customer -> parent hard link (D1-4). NULL = top-level customer. Self-referential FK to mdata.customers.id, same operating_company_id enforced at the application layer; parent must itself be a non-sub customer (2-level hierarchy) so no cycles can form.';

COMMIT;

-- DOWN (manual, not auto-run):
--   ALTER TABLE mdata.customers DROP CONSTRAINT IF EXISTS customers_parent_customer_id_fkey;
--   ALTER TABLE mdata.customers DROP CONSTRAINT IF EXISTS customers_parent_not_self_chk;
--   DROP INDEX IF EXISTS mdata.idx_customers_parent_customer_id;
--   ALTER TABLE mdata.customers DROP COLUMN IF EXISTS parent_customer_id;
