-- LEAD 443.215 extension (10-21 22:55Z, owner 5:40 PM CT): a posted settlement stores the printed SOURCE it was posted from —
-- settlement number, printed date, printed TOTAL DUE, printed Net Revenue, the normalized printed lines and their hash — so a later
-- source for the same number (AlwaysTrack re-printed 5842 on 10-21 with a different TOTAL DUE, unnoticed) is compared against it
-- (driver-finance/settlement-source-fingerprint.ts). Nullable: settlements posted before this compare on their live lines.
-- Additive column on an RLS-forced table (policies unchanged); no row is written by this migration.
SET LOCAL lock_timeout = '60s';
ALTER TABLE driver_finance.driver_settlements ADD COLUMN IF NOT EXISTS source_fingerprint jsonb;
COMMENT ON COLUMN driver_finance.driver_settlements.source_fingerprint IS
  'LEAD 443.215: the printed source this settlement was posted from (settlement-source-fingerprint.ts) — compared against any later source for the same settlement number.';
