-- LEAD 443.345 — a bank line's check number comes from the bank's own text, for EVERY writer (feed import, Plaid, manual).
-- Measured 10-24: 64 USMCA lines read "Check Image 1078" / "Check 1053" and NOT ONE carried banking.bank_transactions.check_number,
-- so a check could never be paired with what it paid (settlement net / bill payment / the check register).
-- Derived data only (the number printed on the bank's own line); never a match, never a categorization. Idempotent.
CREATE OR REPLACE FUNCTION banking.bank_line_check_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF NEW.check_number IS NULL AND NEW.description IS NOT NULL THEN
    NEW.check_number := substring(NEW.description from '(?i)^\s*(?:check image|check)\s+#?([0-9]{3,8})\s*$');
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_bank_line_check_number ON banking.bank_transactions;
CREATE TRIGGER trg_bank_line_check_number
  BEFORE INSERT OR UPDATE OF description, check_number ON banking.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION banking.bank_line_check_number();

UPDATE banking.bank_transactions
   SET check_number = substring(description from '(?i)^\s*(?:check image|check)\s+#?([0-9]{3,8})\s*$')
 WHERE check_number IS NULL
   AND description ~* '^\s*(check image|check)\s+#?[0-9]{3,8}\s*$';
