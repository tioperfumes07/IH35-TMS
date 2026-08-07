-- STAGE 3 SCENARIO 1 (Legal + Civil Fine) — link a vendor bill to the legal matter it was incurred on.
--
-- WHY — a legal matter is currently an island, financially
-- `legal.matters` carries only CLAIM amounts (`amount_claimed_against_us`, `amount_we_seek`) — what is
-- being fought over. It has no way to express what the case has COST. And `accounting.bills` links to
-- `insurance_claim_id` but has no legal-matter reference at all. Verified on prod
-- br-fancy-credit-akjnd07a before writing this.
--
-- So today: the law firm's bill posts correctly (DR Legal & Professional Fees / CR A/P — the existing
-- bill poster already does this, no new GL math needed), but nothing connects that cost back to the
-- matter. Ask "what has this lawsuit cost us" and the system cannot answer. For a company in Chapter 11
-- with active litigation, an unanswerable legal-spend question is not a reporting inconvenience; it is
-- the number an attorney, a trustee or a court asks first.
--
-- WHAT THIS DOES — linkage only, no posting
-- Adds `accounting.bills.legal_matter_id` (nullable, FK → legal.matters) so a legal cost can name its
-- matter. Nullable on purpose: the overwhelming majority of bills have nothing to do with litigation,
-- and forcing a value would either block ordinary AP or invite a junk default.
--
-- SEPARATION OF DUTIES IS PRESERVED (locked decision: Legal stores documents/consents; Accounting
-- posts). This adds a pointer FROM the accounting side TO the matter. It does not let Legal post, and
-- it does not move the posting decision out of Accounting — the bill still goes through the same
-- approval and the same poster it always did.
--
-- Additive · idempotent · no posting, no flag, no money moves.

BEGIN;

-- Inline REFERENCES so a fresh database can never get the column without the constraint
-- (verify:orphan-fk-inventory).
ALTER TABLE accounting.bills
  ADD COLUMN IF NOT EXISTS legal_matter_id uuid REFERENCES legal.matters(id);

-- Convergence for a database where the column already exists WITHOUT the constraint: ADD COLUMN
-- IF NOT EXISTS is a no-op there, so the inline REFERENCES above would never fire.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'accounting'
      AND t.relname = 'bills'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%legal_matter_id%'
  ) THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_legal_matter_fk FOREIGN KEY (legal_matter_id) REFERENCES legal.matters(id);
  END IF;
END$$;

COMMENT ON COLUMN accounting.bills.legal_matter_id IS
  'The legal matter this bill was incurred on (law-firm fees, court costs). Nullable: most bills are not litigation-related. Gives legal.matters a cost side — it otherwise carries only claim amounts and cannot answer "what has this case cost". Accounting still owns the posting; this is a pointer, not a posting path.';

-- Reverse lookup: "every cost on this matter" must not table-scan accounting.bills.
CREATE INDEX IF NOT EXISTS idx_bills_legal_matter_id
  ON accounting.bills (legal_matter_id)
  WHERE legal_matter_id IS NOT NULL;

COMMIT;
