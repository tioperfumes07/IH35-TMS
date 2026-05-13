-- P6-T11182 — QBO write-back from TMS (mirror rows may exist before qbo_id is assigned).
-- Additive only (Invariant #24). Reuses existing qbo_sync_token column as QuickBooks SyncToken storage.

BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.qbo_vendors') IS NOT NULL THEN
    ALTER TABLE mdata.qbo_vendors
      ADD COLUMN IF NOT EXISTS created_in_tms BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ;

    ALTER TABLE mdata.qbo_vendors ALTER COLUMN qbo_id DROP NOT NULL;
  END IF;

  IF to_regclass('mdata.qbo_customers') IS NOT NULL THEN
    ALTER TABLE mdata.qbo_customers
      ADD COLUMN IF NOT EXISTS created_in_tms BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ;

    ALTER TABLE mdata.qbo_customers ALTER COLUMN qbo_id DROP NOT NULL;
  END IF;

  IF to_regclass('mdata.qbo_items') IS NOT NULL THEN
    ALTER TABLE mdata.qbo_items
      ADD COLUMN IF NOT EXISTS created_in_tms BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ;

    ALTER TABLE mdata.qbo_items ALTER COLUMN qbo_id DROP NOT NULL;
  END IF;

  IF to_regclass('mdata.qbo_accounts') IS NOT NULL THEN
    ALTER TABLE mdata.qbo_accounts
      ADD COLUMN IF NOT EXISTS created_in_tms BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ;

    ALTER TABLE mdata.qbo_accounts ALTER COLUMN qbo_id DROP NOT NULL;
  END IF;
END $$;

GRANT INSERT, UPDATE ON mdata.qbo_vendors TO ih35_app;
GRANT INSERT, UPDATE ON mdata.qbo_customers TO ih35_app;
GRANT INSERT, UPDATE ON mdata.qbo_items TO ih35_app;
GRANT INSERT, UPDATE ON mdata.qbo_accounts TO ih35_app;

DROP POLICY IF EXISTS qbo_vendors_mutate_office ON mdata.qbo_vendors;
CREATE POLICY qbo_vendors_mutate_office ON mdata.qbo_vendors
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

DROP POLICY IF EXISTS qbo_vendors_update_office ON mdata.qbo_vendors;
CREATE POLICY qbo_vendors_update_office ON mdata.qbo_vendors
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

DROP POLICY IF EXISTS qbo_customers_mutate_office ON mdata.qbo_customers;
CREATE POLICY qbo_customers_mutate_office ON mdata.qbo_customers
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

DROP POLICY IF EXISTS qbo_customers_update_office ON mdata.qbo_customers;
CREATE POLICY qbo_customers_update_office ON mdata.qbo_customers
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

DROP POLICY IF EXISTS qbo_items_mutate_office ON mdata.qbo_items;
CREATE POLICY qbo_items_mutate_office ON mdata.qbo_items
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

DROP POLICY IF EXISTS qbo_items_update_office ON mdata.qbo_items;
CREATE POLICY qbo_items_update_office ON mdata.qbo_items
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

DROP POLICY IF EXISTS qbo_accounts_mutate_office ON mdata.qbo_accounts;
CREATE POLICY qbo_accounts_mutate_office ON mdata.qbo_accounts
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

DROP POLICY IF EXISTS qbo_accounts_update_office ON mdata.qbo_accounts;
CREATE POLICY qbo_accounts_update_office ON mdata.qbo_accounts
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Accountant'::identity.role_enum,
          'Safety'::identity.role_enum
        ]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
      AND operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

COMMIT;
