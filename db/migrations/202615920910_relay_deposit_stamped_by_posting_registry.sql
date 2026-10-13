-- LEAD 443.136 #1 (CC-3) — a Relay deposit's posted state is stamped by the posting engine's registry, never by hand.
--
-- verify-fuel-posts-only-on-bank-match rule 3: app code must not `SET posted_to_gl = true` by hand (#26709's
-- stampDepositPosted did). The deposit's posting already registers itself here: the AFTER INSERT trigger on
-- accounting.journal_entry_postings (integrations.tg_register_relay_deposit_posting, migration 202615870910) writes the one
-- live row in integrations.relay_deposit_postings and releases it when the lines are reversed. That same trigger now also
-- stamps the deposit row:
--   registered -> posted_to_gl = true,  posted_journal_entry_id = the registering journal entry
--   reversed   -> posted_to_gl = false, posted_journal_entry_id = NULL
-- so the flag is a consequence of the posting (same transaction), never an app write. Classification stays an app write.
-- Old: the trigger only maintained the registry; the app stamped the flag. New: the trigger stamps the flag. Why: one writer.
-- Idempotent: CREATE OR REPLACE; the backfill only touches rows whose stamp disagrees with the live registry.

CREATE OR REPLACE FUNCTION integrations.tg_register_relay_deposit_posting()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_deposit uuid;
  v_existing uuid;
BEGIN
  IF NEW.source_transaction_id IS NULL
     OR NEW.source_transaction_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;
  v_deposit := NEW.source_transaction_id::uuid;
  IF NEW.reversal_of_line_id IS NOT NULL THEN
    UPDATE integrations.relay_deposit_postings
       SET released_at = now()
     WHERE operating_company_id = NEW.operating_company_id AND relay_deposit_id = v_deposit AND released_at IS NULL;
    UPDATE integrations.relay_deposits
       SET posted_to_gl = false, posted_journal_entry_id = NULL, updated_at = now()
     WHERE id = v_deposit AND operating_company_id = NEW.operating_company_id
       AND (posted_to_gl IS DISTINCT FROM false OR posted_journal_entry_id IS NOT NULL);
    RETURN NEW;
  END IF;
  SELECT journal_entry_id INTO v_existing
    FROM integrations.relay_deposit_postings
   WHERE operating_company_id = NEW.operating_company_id AND relay_deposit_id = v_deposit AND released_at IS NULL
   LIMIT 1;
  IF v_existing IS NULL THEN
    INSERT INTO integrations.relay_deposit_postings (operating_company_id, relay_deposit_id, journal_entry_id)
    VALUES (NEW.operating_company_id, v_deposit, NEW.journal_entry_uuid);
  ELSIF v_existing <> NEW.journal_entry_uuid THEN
    RAISE EXCEPTION 'relay_deposit_already_posted: deposit % already has live journal entry % — a deposit enters the Relay Fuel Wallet once', v_deposit, v_existing
      USING ERRCODE = 'unique_violation';
  END IF;
  UPDATE integrations.relay_deposits
     SET posted_to_gl = true, posted_journal_entry_id = NEW.journal_entry_uuid, updated_at = now()
   WHERE id = v_deposit AND operating_company_id = NEW.operating_company_id
     AND (posted_to_gl IS NOT TRUE OR posted_journal_entry_id IS DISTINCT FROM NEW.journal_entry_uuid);
  RETURN NEW;
END
$fn$;

-- Rows whose stamp disagrees with the live registry take the registry's answer (derived, deterministic; a no-op on prod,
-- where every posted deposit was already stamped).
UPDATE integrations.relay_deposits d
   SET posted_to_gl = true, posted_journal_entry_id = r.journal_entry_id, updated_at = now()
  FROM integrations.relay_deposit_postings r
 WHERE r.relay_deposit_id = d.id AND r.operating_company_id = d.operating_company_id AND r.released_at IS NULL
   AND (d.posted_to_gl IS NOT TRUE OR d.posted_journal_entry_id IS DISTINCT FROM r.journal_entry_id);
