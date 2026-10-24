-- 443.235 — ih35_guard_reader / ih35_ci_readonly need EXECUTE on the three
-- same-company historical label resolvers. pg_read_all_data covers tables only;
-- without these GRANTs, verify-load-boards-agree (and any LIVE reader that pulls
-- load-service SQL) fails with permission denied under the gate credential.
-- Idempotent GRANT; REVOKE from PUBLIC stays as authored in the CREATE migrations.
-- CI: grant only when role exists (verify-migration-no-unknown-roles).

BEGIN;

DO $guard$
DECLARE
  r text;
  fn text;
BEGIN
  FOREACH r IN ARRAY ARRAY['ih35_guard_reader', 'ih35_ci_readonly'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH fn IN ARRAY ARRAY[
        'mdata.resolve_driver_label_same_company(uuid, uuid)',
        'mdata.resolve_customer_label_same_company(uuid, uuid)',
        'mdata.resolve_vendor_label_same_company(uuid, uuid)'
      ] LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', fn, r);
      END LOOP;
    END IF;
  END LOOP;
END $guard$;

COMMIT;
