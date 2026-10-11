-- 202610101430_relay_deposit_is_a_bank_match_target.sql
-- LEDGER STUB (ROUND 443.29-B): this number was applied on the USMCA prod ledger before the file was
-- renumbered to 202615441301 for replay ordering (after 202615441200 loan LOC). Substantive DDL lives
-- in 202615441301_relay_deposit_is_a_bank_match_target.sql. Idempotent no-op here so verify-migration-
-- no-number-collision can rebuild prod from db/migrations/.

BEGIN;
SET LOCAL lock_timeout = '15s';
COMMIT;
