-- [HOLD-FOR-JORGE — TIER 1] STMT-2 — TRANSP opening-balance importer feature flag.
--
-- *** DO NOT RUN ON PROD without Jorge's explicit "OK to merge" — runs on a Neon branch first, then
-- ledger-backfilled (§1.4). OPENING_BALANCE_IMPORT_ENABLED stays OFF at merge. ***
--
-- WHY: gates apps/backend/src/accounting/opening-balance-import/* (the TRANSP 12/31/2024 opening-balance
-- importer). The importer is READ-ONLY — it builds a reviewable JE preview + flags unmapped
-- catalogs.accounts, and NEVER calls createJournalEntry / writes accounting.journal_entries (opening
-- balances are owner-entered only — constitution §1.4/§1.6). This flag exists purely so the preview
-- endpoint itself stays dark until Jorge is ready to review, matching the repo's build-and-hold
-- convention for every new financial surface (default OFF, per-entity override).
--
-- SCOPE: flag seed ONLY. No schema/table change — the importer reads the EXISTING catalogs.accounts
-- table and returns computed JSON; nothing is persisted.
--
-- Idempotent (ON CONFLICT DO NOTHING). Never self-merge — show full SQL, wait for Jorge's "OK to merge".

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'OPENING_BALANCE_IMPORT_ENABLED',
  'STMT-2: gates the TRANSP 12/31/2024 opening-balance importer preview endpoint (read-only JE preview + unmapped-account report; never posts). Default OFF until Jorge reviews the mapping.',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
