-- [FINANCIAL CLUSTER] Owner 2026-08-15 chat: EVERYTHING visible/working ON for all entities;
-- ONLY QuickBooks SYNC / write-back / mirror-pull / heal / AP-import stay OFF.
-- Read-only QBO *UI* flags stay ON.
-- Idempotent · companies by code · no hardcoded UUID.
-- Measured: USMCA had 0 overrides → PER_ENTITY_ONLY surfaces (Finance Hub, etc.) stayed dark.

BEGIN;

DO $$
DECLARE
  v_setter uuid;
  v_opco uuid;
  r record;
  n_on int := 0;
  n_off int := 0;
  is_qbo_sync boolean;
BEGIN
  IF to_regclass('lib.feature_flag_overrides') IS NULL
     OR to_regclass('lib.feature_flags') IS NULL
     OR to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'OWNER-FLAGS-20260815: prerequisites absent — skip';
    RETURN;
  END IF;

  SELECT set_by_user_uuid INTO v_setter
    FROM lib.feature_flag_overrides
   WHERE set_by_user_uuid IS NOT NULL
   ORDER BY set_at DESC
   LIMIT 1;

  IF v_setter IS NULL AND to_regclass('identity.users') IS NOT NULL THEN
    EXECUTE 'SELECT id FROM identity.users ORDER BY created_at NULLS LAST LIMIT 1' INTO v_setter;
  END IF;

  IF v_setter IS NULL THEN
    RAISE NOTICE 'OWNER-FLAGS-20260815: no setter user — skip';
    RETURN;
  END IF;

  FOR v_opco IN
    SELECT id FROM org.companies WHERE deactivated_at IS NULL AND code IN ('TRANSP', 'TRK', 'USMCA')
  LOOP
    FOR r IN SELECT flag_key FROM lib.feature_flags
    LOOP
      is_qbo_sync := (
        r.flag_key IN (
          'TMS_QBO_RECON_ENABLED',
          'VOID_QBO_MIRROR_ENABLED',
          'AP_IMPORT_ENABLED',
          'QBO_MASTER_DATA_HEAL_ENABLED',
          'QBO_ENTITY_PUSH_ENABLED',
          'QBO_JE_PUSH_ENABLED'
        )
        OR (
          r.flag_key LIKE 'QBO\_%' ESCAPE '\'
          AND r.flag_key NOT LIKE '%UI%'
        )
      );

      IF is_qbo_sync THEN
        INSERT INTO lib.feature_flag_overrides
          (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
        VALUES (gen_random_uuid(), r.flag_key, v_opco, NULL, false, v_setter, now(), NULL)
        ON CONFLICT (flag_key, operating_company_id)
          WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
          DO UPDATE SET enabled = false, set_at = now(), expires_at = NULL;
        n_off := n_off + 1;
      ELSE
        INSERT INTO lib.feature_flag_overrides
          (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
        VALUES (gen_random_uuid(), r.flag_key, v_opco, NULL, true, v_setter, now(), NULL)
        ON CONFLICT (flag_key, operating_company_id)
          WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
          DO UPDATE SET enabled = true, set_at = now(), expires_at = NULL;
        n_on := n_on + 1;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'OWNER-FLAGS-20260815: ON=% OFF(sync)=% (TRANSP+TRK+USMCA)', n_on, n_off;
END
$$;

COMMIT;
