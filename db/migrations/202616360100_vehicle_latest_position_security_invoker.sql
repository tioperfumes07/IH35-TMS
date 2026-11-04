-- 202616360100_vehicle_latest_position_security_invoker.sql
-- ACCT-F11094 (register row 257): D074 (202616200100, #27252) dropped and re-created telematics.vehicle_latest_position
-- over the new cache table WITHOUT security_invoker. F3 (202606271500) set it on every user-schema view so a view never reads
-- with its OWNER's rights. Measured 2026-11-04 on prod: reloptions = NULL (the only user-schema view lacking it); fresh-DB CI
-- guard live-defects-f1-f3 F3 red on every PR since 10-23. The cache carries the same FORCE-RLS policy as
-- telematics.vehicle_locations (lucia bypass OR app.operating_company_id), so invoker rights restore exactly the semantics
-- the view had before D074. Idempotent: setting the option again is a no-op.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER VIEW IF EXISTS telematics.vehicle_latest_position SET (security_invoker = true);
COMMIT;
