-- MULTI-ENTITY COA SEPARATION — Path B, STAGE 3 (decommingle TRK) — MOST DANGEROUS.
-- TRK currently has 14 active bindings (4 chart_of_accounts_roles + 10 expense_category_account_map)
-- that point at NON-TRK-owned accounts (13 TRANSP-owned + 1 the retired/NULL-owned #6999). This stage
-- gives TRK its OWN copy of each account and re-points TRK's bindings to them, so no entity shares an
-- account with another. Decisions locked by Jorge: A1 (TRK- prefix numbering; account_number is globally
-- unique), B2 (qbo_account_id NULL + flagged for QBO mapping), C1 (mirror ALL 14 — pure decommingle).
--
-- INVARIANTS:
--  - RESOLVE-BY-CODE: TRK id via (SELECT id FROM org.companies WHERE code='TRK') — never hardcode uuid.
--  - PK: omit id, let catalogs.accounts DEFAULT (gen_random_uuid) fire — do not hand-roll identity.
--  - Void-not-delete: deactivate old binding (is_active=false) then insert new active, IN ONE TXN
--    (the partial-unique-active indexes forbid two active rows per entity+role / entity+category, so the
--    order is forced; atomicity means the app never observes a gap).
--  - Ledger is append-only: this migration MUST NOT touch journal_entry_postings. It ABORTS (fail-loud)
--    if any TRK posting sits on a non-TRK account (would require manual reverse-and-repost, runbook 3c).
--    Today that set is empty (0 postings) so the guard passes.
--  - system_purpose set on TRK's 4 system accounts (uncategorized_expense/ap_control/ar_control/
--    undeposited_funds); NULL on the 10 expense-category accounts. Stage 4 adds the per-entity index.
--
-- Idempotent: re-running finds 0 TRK bindings on non-TRK accounts (already repointed) -> no-op.
-- Reversible: deactivate the new TRK bindings + reactivate the old, and deactivate the TRK- accounts
--   (void-not-delete). Forward-only. See docs/specs + STAGE-3-DECOMMINGLE-TRK.txt.

BEGIN;

DO $$
DECLARE
  v_trk uuid := (SELECT id FROM org.companies WHERE code = 'TRK');
  r RECORD;
  v_new_acct uuid;
BEGIN
  IF v_trk IS NULL THEN RAISE EXCEPTION 'Stage3 abort: TRK company (code=TRK) not found'; END IF;

  -- 3c guard (fail-loud): no TRK posting may sit on a non-TRK account (would need reverse-and-repost).
  IF EXISTS (
    SELECT 1 FROM accounting.journal_entry_postings p
    JOIN catalogs.accounts a ON a.id = p.account_id
    WHERE p.operating_company_id = v_trk AND a.operating_company_id IS DISTINCT FROM v_trk
  ) THEN
    RAISE EXCEPTION 'Stage3 abort: TRK postings exist on non-TRK accounts — manual reverse-and-repost (3c) required first';
  END IF;

  -- === ROLE bindings (system accounts: system_purpose = role) ===
  FOR r IN
    SELECT cr.id AS binding_id, cr.role,
           a.account_number, a.account_name, a.account_type, a.account_subtype, a.is_postable, a.currency_code
    FROM accounting.chart_of_accounts_roles cr
    JOIN catalogs.accounts a ON a.id = cr.account_id
    WHERE cr.operating_company_id = v_trk AND cr.is_active
      AND a.operating_company_id IS DISTINCT FROM v_trk          -- corrected predicate (catches TRANSP + NULL/retired)
  LOOP
    INSERT INTO catalogs.accounts
      (account_number, account_name, account_type, account_subtype, is_postable, currency_code,
       operating_company_id, system_purpose, qbo_account_id, notes)
    VALUES
      ('TRK-' || r.account_number, r.account_name, r.account_type, r.account_subtype, r.is_postable, r.currency_code,
       v_trk, r.role, NULL, 'STAGE3-TRK-NEEDS-QBO-MAPPING (tracker 883/884)')
    ON CONFLICT (account_number) DO NOTHING;

    SELECT id INTO v_new_acct FROM catalogs.accounts WHERE account_number = 'TRK-' || r.account_number;

    UPDATE accounting.chart_of_accounts_roles SET is_active = false, updated_at = now() WHERE id = r.binding_id;
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    VALUES (v_trk, r.role, v_new_acct, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- === EXPENSE-CATEGORY maps (system_purpose NULL) ===
  FOR r IN
    SELECT em.id AS binding_id, em.category_kind, em.category_code, em.posting_side,
           a.account_number, a.account_name, a.account_type, a.account_subtype, a.is_postable, a.currency_code
    FROM accounting.expense_category_account_map em
    JOIN catalogs.accounts a ON a.id = em.account_id
    WHERE em.operating_company_id = v_trk AND em.is_active
      AND a.operating_company_id IS DISTINCT FROM v_trk
  LOOP
    INSERT INTO catalogs.accounts
      (account_number, account_name, account_type, account_subtype, is_postable, currency_code,
       operating_company_id, system_purpose, qbo_account_id, notes)
    VALUES
      ('TRK-' || r.account_number, r.account_name, r.account_type, r.account_subtype, r.is_postable, r.currency_code,
       v_trk, NULL, NULL, 'STAGE3-TRK-NEEDS-QBO-MAPPING (tracker 883/884)')
    ON CONFLICT (account_number) DO NOTHING;

    SELECT id INTO v_new_acct FROM catalogs.accounts WHERE account_number = 'TRK-' || r.account_number;

    UPDATE accounting.expense_category_account_map SET is_active = false, updated_at = now() WHERE id = r.binding_id;
    INSERT INTO accounting.expense_category_account_map
      (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
    VALUES (v_trk, r.category_kind, r.category_code, v_new_acct, r.posting_side, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- === 3d in-txn verification gate (any failure RAISES -> full ROLLBACK) ===
  IF EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles cr JOIN catalogs.accounts a ON a.id = cr.account_id
    WHERE cr.is_active GROUP BY cr.account_id HAVING count(DISTINCT cr.operating_company_id) > 1
  ) THEN RAISE EXCEPTION 'Stage3 verify FAIL: a commingled active account remains'; END IF;

  IF EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles cr JOIN catalogs.accounts a ON a.id = cr.account_id
    WHERE cr.operating_company_id = v_trk AND cr.is_active AND a.operating_company_id IS DISTINCT FROM v_trk
  ) THEN RAISE EXCEPTION 'Stage3 verify FAIL: a TRK active role binding still points at a non-TRK account'; END IF;

  IF EXISTS (
    SELECT 1 FROM accounting.expense_category_account_map em JOIN catalogs.accounts a ON a.id = em.account_id
    WHERE em.operating_company_id = v_trk AND em.is_active AND a.operating_company_id IS DISTINCT FROM v_trk
  ) THEN RAISE EXCEPTION 'Stage3 verify FAIL: a TRK active expense map still points at a non-TRK account'; END IF;

  IF EXISTS (
    SELECT 1 FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
    WHERE a.operating_company_id IS DISTINCT FROM p.operating_company_id
  ) THEN RAISE EXCEPTION 'Stage3 verify FAIL: cross-entity posting exists'; END IF;
END $$;

COMMIT;
