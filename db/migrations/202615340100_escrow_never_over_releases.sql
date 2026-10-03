-- 202615340100_escrow_never_over_releases.sql
-- CC-1 · Standing order F-1 / Lead ROUND 358 — A DRIVER'S ESCROW NEVER RELEASES MORE THAN IT HOLDS, refused in the
-- DATABASE, not the service. (Number claimed for ROUND 355 R-1, which ROUND 358 withdrew in full — no damage-loss
-- account, role or migration; the claim is repurposed for F-1.)
--
-- Owner, 2026-10-03: "THE DRIVER DAMAGE IS THE ESCROW ACCOUNT FOR THE DRIVERS THEY ONLY HAVE ONE, IT IS WHERE THE 25
-- DOLLAR DEDUCTIONS GO TO." The 2100-00-<nnn> sub-account is the driver's damage fund, built from his own deductions;
-- damage is drawn from it, never below zero; any shortfall is a company cost on 6175 (damage_recovery).
--
-- MEASURED ON PROD 2026-10-03 (bypass): three driver escrows are over-released, in all three stores at once —
--   2100-00-027 Jorge Luis Infante Corona      GL +$150.00 debit (34 lines) · escrow_balances held 0 / released 15000 / -15000
--   2100-00-002 Neftali Coronado Urbano        GL  +$50.00 debit (20 lines) · held 0 / released 5000 / -5000
--   2100-00-004 Rafael Rogelio Rivero Reynoso  GL  +$25.00 debit  (7 lines) · held 0 / released 2500 / -2500
--   accounting.escrow_accounts: the same three at -15000 / -5000 / -2500.
-- THE WRITER: settlement escrow-contribution REVERSALS (ACCT-F20260924/25, R-161 parts 1-2) reversed each original
-- contribution in full AFTER a 2026-09-24 "sync projection to GL after AT escrow excess release" had already released
-- part of it — so the reversal released money that had already left. Six code paths write these balances (settlement
-- approval, pay-run close, pay-run unwind, separation, forfeit, historical backfill) and none of the stores refused a
-- negative result, so any one of them — or an ops script — could do it again.
--
-- THE REFUSAL, in the database, for every writer:
--   (1) driver_finance.escrow_balances — refuse a write that makes current_balance_cents MORE negative, or widens
--       total_released_cents above total_held_cents. A hold may still REPAIR an already-negative row (a plain CHECK
--       would freeze the three drivers above: their next $25 hold could never land).
--   (2) accounting.escrow_accounts (driver holders) — refuse a write that makes balance_cents more negative.
--   (3) GL — a DEFERRED constraint trigger on accounting.journal_entry_postings: at commit, a journal entry whose own
--       lines move a driver escrow sub-account toward DEBIT is refused if that account then carries a debit balance.
--       Judged per JOURNAL ENTRY (not per transaction id), so savepoints cannot hide a release, and line order inside
--       an entry never matters.
-- No row is changed: the three over-released accounts are purge population (ROUND 350); the guard
-- verify-escrow-never-over-releases names them as debt until then. Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE INDEX IF NOT EXISTS ix_escrow_accounts_coa_account ON accounting.escrow_accounts (coa_account_id);
CREATE INDEX IF NOT EXISTS ix_journal_entry_postings_account ON accounting.journal_entry_postings (account_id);

-- ── (1) the driver-facing subledger ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION driver_finance.refuse_escrow_over_release()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE v_over_new bigint; v_over_old bigint;
BEGIN
  IF NEW.current_balance_cents < 0
     AND (TG_OP = 'INSERT' OR NEW.current_balance_cents < OLD.current_balance_cents) THEN
    RAISE EXCEPTION 'escrow over-release refused: driver % escrow would be % cents (was %). A driver''s escrow never releases more than it holds — it is his damage fund.',
      NEW.driver_id, NEW.current_balance_cents, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.current_balance_cents END
      USING ERRCODE = 'check_violation';
  END IF;
  v_over_new := COALESCE(NEW.total_released_cents, 0) - COALESCE(NEW.total_held_cents, 0);
  v_over_old := CASE WHEN TG_OP = 'INSERT' THEN 0 ELSE GREATEST(0, COALESCE(OLD.total_released_cents, 0) - COALESCE(OLD.total_held_cents, 0)) END;
  IF v_over_new > 0 AND v_over_new > v_over_old THEN
    RAISE EXCEPTION 'escrow over-release refused: driver % would have released % cents against % held.',
      NEW.driver_id, NEW.total_released_cents, NEW.total_held_cents
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_refuse_escrow_over_release ON driver_finance.escrow_balances;
CREATE TRIGGER trg_refuse_escrow_over_release
  BEFORE INSERT OR UPDATE OF current_balance_cents, total_held_cents, total_released_cents ON driver_finance.escrow_balances
  FOR EACH ROW EXECUTE FUNCTION driver_finance.refuse_escrow_over_release();

-- ── (2) the accounting escrow bridge (driver holders) ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounting.refuse_driver_escrow_account_negative()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF NEW.holder_type = 'driver' AND NEW.balance_cents < 0
     AND (TG_OP = 'INSERT' OR NEW.balance_cents < OLD.balance_cents) THEN
    RAISE EXCEPTION 'escrow over-release refused: driver escrow account % (holder %) would be % cents (was %).',
      NEW.id, NEW.holder_id, NEW.balance_cents, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.balance_cents END
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_refuse_driver_escrow_account_negative ON accounting.escrow_accounts;
CREATE TRIGGER trg_refuse_driver_escrow_account_negative
  BEFORE INSERT OR UPDATE OF balance_cents ON accounting.escrow_accounts
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_driver_escrow_account_negative();

-- ── (3) the GL: a driver escrow sub-account never ends an entry in debit ────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounting.refuse_driver_escrow_gl_debit_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE v_je_net bigint; v_balance bigint; v_label text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounting.escrow_accounts ea WHERE ea.coa_account_id = NEW.account_id AND ea.holder_type = 'driver') THEN
    RETURN NULL;
  END IF;
  -- This entry's own movement on the account (credit positive). Only an entry that moves it toward debit is judged.
  SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)
    INTO v_je_net
    FROM accounting.journal_entry_postings p
   WHERE p.journal_entry_uuid = NEW.journal_entry_uuid AND p.account_id = NEW.account_id;
  IF v_je_net >= 0 THEN RETURN NULL; END IF;
  -- The account's balance after everything committed so far plus this transaction (credit positive). Draft and voided
  -- entries do not count; the entry being judged counts whatever its status, because it is what is being posted.
  SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)
    INTO v_balance
    FROM accounting.journal_entry_postings p
    JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
   WHERE p.account_id = NEW.account_id
     AND (j.status = 'posted' OR j.id = NEW.journal_entry_uuid);
  IF v_balance < 0 THEN
    SELECT a.account_number || ' ' || a.account_name INTO v_label FROM catalogs.accounts a WHERE a.id = NEW.account_id;
    RAISE EXCEPTION 'escrow over-release refused: journal entry % would leave driver escrow % with a debit balance of % cents. A driver''s escrow is his damage fund — it is drawn to zero, never below; a shortfall is a company cost (damage_recovery).',
      NEW.journal_entry_uuid, v_label, -v_balance
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $fn$;
DROP TRIGGER IF EXISTS trg_refuse_driver_escrow_gl_debit_balance ON accounting.journal_entry_postings;
CREATE CONSTRAINT TRIGGER trg_refuse_driver_escrow_gl_debit_balance
  AFTER INSERT OR UPDATE OF account_id, amount_cents, debit_or_credit ON accounting.journal_entry_postings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.debit_or_credit = 'debit')
  EXECUTE FUNCTION accounting.refuse_driver_escrow_gl_debit_balance();
COMMIT;
