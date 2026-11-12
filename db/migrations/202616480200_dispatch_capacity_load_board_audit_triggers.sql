-- *** DO NOT RUN ON PROD. Held migration — audit triggers for capacity/load-board tables (D3 backfill). ***
-- dispatch D3 follow-up (2026-11-10, CC-1): 5 capacity / load-board tables were added after
-- 202615330929 ran and therefore never received the audit.tg_audit_row trigger required by
-- the dispatch D3 standing order. RLS + FORCE are already applied.
-- Idempotent — DROP IF EXISTS before each CREATE.
--
DROP TRIGGER IF EXISTS trg_audit_capacity_offer_sends ON dispatch.capacity_offer_sends;
CREATE TRIGGER trg_audit_capacity_offer_sends AFTER INSERT OR UPDATE OR DELETE ON dispatch.capacity_offer_sends FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_capacity_offer_suppressions ON dispatch.capacity_offer_suppressions;
CREATE TRIGGER trg_audit_capacity_offer_suppressions AFTER INSERT OR UPDATE OR DELETE ON dispatch.capacity_offer_suppressions FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_capacity_settings ON dispatch.capacity_settings;
CREATE TRIGGER trg_audit_capacity_settings AFTER INSERT OR UPDATE OR DELETE ON dispatch.capacity_settings FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_capacity_unit_offers ON dispatch.capacity_unit_offers;
CREATE TRIGGER trg_audit_capacity_unit_offers AFTER INSERT OR UPDATE OR DELETE ON dispatch.capacity_unit_offers FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_load_board_postings ON dispatch.load_board_postings;
CREATE TRIGGER trg_audit_load_board_postings AFTER INSERT OR UPDATE OR DELETE ON dispatch.load_board_postings FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
