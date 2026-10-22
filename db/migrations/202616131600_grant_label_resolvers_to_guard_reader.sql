-- 443.235 — ih35_guard_reader / ih35_ci_readonly need EXECUTE on the three
-- same-company historical label resolvers. pg_read_all_data covers tables only;
-- without these GRANTs, verify-load-boards-agree (and any LIVE reader that pulls
-- load-service SQL) fails with permission denied under the gate credential.
-- Idempotent GRANT; REVOKE from PUBLIC stays as authored in the CREATE migrations.

BEGIN;

GRANT EXECUTE ON FUNCTION mdata.resolve_driver_label_same_company(uuid, uuid)
  TO ih35_guard_reader, ih35_ci_readonly;

GRANT EXECUTE ON FUNCTION mdata.resolve_customer_label_same_company(uuid, uuid)
  TO ih35_guard_reader, ih35_ci_readonly;

GRANT EXECUTE ON FUNCTION mdata.resolve_vendor_label_same_company(uuid, uuid)
  TO ih35_guard_reader, ih35_ci_readonly;

COMMIT;
