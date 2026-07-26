-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's
-- hand, then ledger-backfill so prod db:migrate skips it. Registered in
-- db/migrations/.held-migrations.json (verify-hold-migrations-registered enforces the parity).
--
-- LEGAL-PAPER-01 — make a WET (paper) signature representable on legal.contract_instances.
--
-- ============================================================================================
-- THE PROBLEM (verified live on the prod branch 2026-07-26, Neon tiny-field-89581227 /
-- br-fancy-credit-akjnd07a, RLS-immune pg_catalog reads, plus a bypass_rls='lucia' row count)
--
--   legal.contract_instances.status is enum legal.contract_instance_status, whose COMPLETE value
--   set on prod today is:
--       draft | sent | viewed | signed_electronically | voided | expired
--   (pg_enum ordered by enumsortorder — six values, nothing else.)
--
--   The table has 0 rows (SELECT count(*) under set_config('app.bypass_rls','lucia',true) = 0;
--   pg_stat_user_tables.n_live_tup = 0 — so the zero is real, not RLS masking).
--
--   Jorge's driver contracts are signed ON PAPER. There is NO enum value that means "wet
--   signature", so a paper-signed driver contract literally cannot be recorded. The consequence
--   is not cosmetic: driver_finance/escrow-target.service.ts derives has_signed_clause from
--   `status = 'signed_electronically'`, and that boolean is the authorisation gate for forfeiting
--   a driver's escrow. With paper unrepresentable, every real signed contract reads as UNSIGNED.
--
--   The two wrong ways out were considered and REJECTED by the owner:
--     • disabling the signed-clause gate — it is a Chapter-11 escrow-liability control; and
--     • stamping paper contracts 'signed_electronically' — that is a FALSE LEGAL RECORD. An
--       e-signature status carries ESIGN/UETA meaning (consent, audit trail, signing token). A
--       scanned wet signature is a different evidentiary artifact and must say so on its face,
--       because a bankruptcy trustee, a DOL wage investigator or opposing counsel will read this
--       column as the assertion of HOW the driver signed.
--
-- ============================================================================================
-- WHAT THIS MIGRATION DOES — two things, no more.
--
--   §1  Adds the enum value 'signed_on_paper', immediately AFTER 'signed_electronically' so the
--       two signed states sort together. ADD VALUE IF NOT EXISTS is natively idempotent (the same
--       pattern already proven on this database by 0094's load_status_enum additions).
--
--   §2  Adds an evidence CHECK: a row that claims 'signed_on_paper' MUST carry both signed_at and
--       signed_pdf_attachment_id. signed_pdf_attachment_id is the EXISTING column (uuid, nullable,
--       FK → documents.attachments(id) — verified on prod, not assumed); for a paper contract it
--       holds the SCAN of the executed document. This is what stops "paper" from becoming an
--       unfalsifiable claim: to assert a wet signature you must attach the paper. The table has 0
--       rows, so the constraint validates instantly and cannot fail on existing data.
--
-- WHY TWO TRANSACTIONS IN ONE FILE: PostgreSQL forbids USING an enum value in the same
-- transaction that added it. §2's CHECK compares status against the new label, so §1 must be
-- committed first. scripts/db-migrate.mjs:228 detects an explicit BEGIN/COMMIT and runs the file
-- as-is rather than wrapping it, so the two blocks below commit independently and in order.
-- (On PG < 12 ALTER TYPE ... ADD VALUE could not run inside a transaction block at all; prod is
-- PostgreSQL 16.14 — verified via version() this session — where it is permitted, subject only to
-- the same-transaction use restriction handled above.)
--
-- NOT IN SCOPE, deliberately: no GL math, no posting, no touch to accounting.* / catalogs.* /
-- mdata.*, no accounting.apply_escrow_posting_delta, no accounting.escrow_* (another lane owns
-- those). No DROP, no DELETE, no UPDATE of existing rows — additive only.
-- ============================================================================================

BEGIN;

-- §1 — the new status value. Idempotent; re-running is a no-op.
ALTER TYPE legal.contract_instance_status
  ADD VALUE IF NOT EXISTS 'signed_on_paper' AFTER 'signed_electronically';

COMMIT;

BEGIN;

-- Fail loud if §1 somehow did not take, rather than silently skipping §2 and leaving the database
-- in a half-migrated state. This reads pg_enum by LABEL TEXT, so it does not itself "use" the new
-- enum value.
DO $paper_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'legal'
       AND t.typname = 'contract_instance_status'
       AND e.enumlabel = 'signed_on_paper'
  ) THEN
    RAISE EXCEPTION 'legal.contract_instance_status is missing signed_on_paper — §1 did not apply';
  END IF;
END
$paper_guard$;

-- §2 — evidence CHECK. A paper signature must be backed by the scan and a signature date.
DO $paper_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'legal.contract_instances'::regclass
       AND conname = 'contract_instances_paper_signature_evidence_check'
  ) THEN
    ALTER TABLE legal.contract_instances
      ADD CONSTRAINT contract_instances_paper_signature_evidence_check
      CHECK (
        status <> 'signed_on_paper'
        OR (signed_at IS NOT NULL AND signed_pdf_attachment_id IS NOT NULL)
      );
  END IF;
END
$paper_check$;

COMMENT ON COLUMN legal.contract_instances.signed_pdf_attachment_id IS
  'documents.attachments FK to the executed contract. For status=signed_electronically this is the '
  'system-rendered signed PDF; for status=signed_on_paper it is the SCAN of the wet-signed original '
  'and is REQUIRED (contract_instances_paper_signature_evidence_check).';

COMMENT ON TYPE legal.contract_instance_status IS
  'Lifecycle of a contract instance. Two terminal SIGNED states, deliberately distinct because they '
  'are different evidentiary artifacts: signed_electronically (ESIGN/UETA e-signature captured by '
  'this system, with signing token + audit trail) and signed_on_paper (wet signature executed '
  'offline; the scan is required in signed_pdf_attachment_id). Never record a paper signature as '
  'signed_electronically — that is a false legal record.';

COMMIT;
