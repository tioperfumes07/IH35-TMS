-- 202616490100_dispatch_capacity_audit_triggers.sql
-- Guard fix: verify-dispatch-tables-audited-and-rls-forced caught that the five
-- dispatch tables added by #28826/#28827 (capacity engine) ship without
-- audit.tg_audit_row() triggers. The original migration set RLS ENABLED + FORCED
-- correctly but omitted the per-table audit trigger. Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_audit_capacity_offer_sends ON dispatch.capacity_offer_sends;
CREATE TRIGGER trg_audit_capacity_offer_sends
  AFTER INSERT OR UPDATE OR DELETE ON dispatch.capacity_offer_sends
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_capacity_offer_suppressions ON dispatch.capacity_offer_suppressions;
CREATE TRIGGER trg_audit_capacity_offer_suppressions
  AFTER INSERT OR UPDATE OR DELETE ON dispatch.capacity_offer_suppressions
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_capacity_settings ON dispatch.capacity_settings;
CREATE TRIGGER trg_audit_capacity_settings
  AFTER INSERT OR UPDATE OR DELETE ON dispatch.capacity_settings
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_capacity_unit_offers ON dispatch.capacity_unit_offers;
CREATE TRIGGER trg_audit_capacity_unit_offers
  AFTER INSERT OR UPDATE OR DELETE ON dispatch.capacity_unit_offers
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_load_board_postings ON dispatch.load_board_postings;
CREATE TRIGGER trg_audit_load_board_postings
  AFTER INSERT OR UPDATE OR DELETE ON dispatch.load_board_postings
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

COMMIT;
