-- WORM: accounting.related_party_accounts (link related party -> its one running "Due to / from <party>" account, created in
-- 202615900910, LEAD 443.134 #1). A financial link row is void-not-delete: deleting it would orphan the party's running account
-- and let a second account be created for the same party. LEAD 443.136 #2: verify-new-financial-table-ships-worm and
-- verify-worm-coverage-ratchet (unprotected financial tables 90 -> back to 89) — same trigger as every protected table.
-- Idempotent (DROP IF EXISTS + CREATE).

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.related_party_accounts;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.related_party_accounts
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
