-- PERFUME-DESK (owner 2026-11-25 23:25 CT): "Most of these vendors especially those that are expensive can be customers
-- add a hotmail connection,"
--
-- The third TIO mailbox: tio-perfumes@hotmail.com (a personal Microsoft account). Measured on the Mac Mail database, last 45
-- days: Lux America and Mohan Tilani send their price lists ONLY to this mailbox, and Sanya, Perfumora, Euro and AceBeauty
-- lists land in its Junk folder. The owner connects it himself (Microsoft sign-in, Mail.Read — read-only); the engine
-- reads it exactly like the two Gmail mailboxes.
--
-- perfume.mail_accounts.provider — which service holds the mailbox ('google' for the two existing ones, 'microsoft' for
-- Hotmail). Additive, idempotent; isolated perfume schema, RLS unchanged (owner-only, FORCE).

ALTER TABLE perfume.mail_accounts ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'google';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mail_accounts_provider_check' AND conrelid = 'perfume.mail_accounts'::regclass) THEN
    ALTER TABLE perfume.mail_accounts ADD CONSTRAINT mail_accounts_provider_check CHECK (provider IN ('google', 'microsoft'));
  END IF;
END $$;
