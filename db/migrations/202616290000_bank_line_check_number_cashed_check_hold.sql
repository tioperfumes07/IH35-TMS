-- LEAD 10-25-2026 — owner report (11:03 PM): a $200 bank line "CASHED CHECK HOLD ON 10/24 FOR CHECK #XXXXX001091"
-- showed no number in the Check No column. 202616240400 only parsed a line that IS the check ("Check Image 1078",
-- "Check 1053"). The bank also names the check inside other lines — "... FOR CHECK #XXXXX001091" (masked, zero-padded).
-- Measured 10-25 (USMCA): 16 such lines, all with check_number NULL; the same pattern never appears on CHECKCARD /
-- ATM "#XXXXX6869" / "CASHED CHECK HOLD ON 10/05" lines (no "CHECK #" pair), which stay NULL.
-- ONE parser (banking.parse_bank_line_check_number) is used by the trigger and the backfill. Leading zeros are dropped so
-- the number is the check's number as printed on it ("001091" -> "1091", the same shape as "Check Image 1057").
-- Derived data only — never a match, never a categorization. Backfill is USMCA-only (frozen entities untouched). Idempotent.
CREATE OR REPLACE FUNCTION banking.parse_bank_line_check_number(p_description text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v text;
BEGIN
  IF p_description IS NULL THEN
    RETURN NULL;
  END IF;
  -- 1. The line IS the check: "Check Image 1078", "Check 1053", "check 0191".
  v := substring(p_description from '(?i)^\s*(?:check image|check)\s+#?([0-9]{3,8})\s*$');
  -- 2. The line NAMES the check: "... FOR CHECK #XXXXX001091", "CHK #191", "CK # 191" (a "#" is required).
  IF v IS NULL THEN
    v := substring(p_description from '(?i)\m(?:check|chk|ck)\M\s*(?:no\.?\s*)?#\s*X*([0-9]{1,10})');
  END IF;
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  v := ltrim(v, '0');
  RETURN NULLIF(v, '');
END
$$;

CREATE OR REPLACE FUNCTION banking.bank_line_check_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF NEW.check_number IS NULL AND NEW.description IS NOT NULL THEN
    NEW.check_number := banking.parse_bank_line_check_number(NEW.description);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_bank_line_check_number ON banking.bank_transactions;
CREATE TRIGGER trg_bank_line_check_number
  BEFORE INSERT OR UPDATE OF description, check_number ON banking.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION banking.bank_line_check_number();

-- Backfill through the same parser (USMCA only).
UPDATE banking.bank_transactions
   SET check_number = banking.parse_bank_line_check_number(description)
 WHERE check_number IS NULL
   AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
   AND banking.parse_bank_line_check_number(description) IS NOT NULL;
