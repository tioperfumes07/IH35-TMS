-- WORM: accounting.related_party_loan_facilities (LOC header created in 202615441200).
-- Money-bearing facility row; void-not-delete. Lowers verify-worm-coverage-ratchet unprotected_count 90 -> 89.

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.related_party_loan_facilities;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.related_party_loan_facilities
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
