-- ROUND 389.3 RULING 2 (CC-1) — driver sub-account numbers: <parent>-00-nnn, ONE nnn per driver under every parent.
--
-- The escrow family already has the right shape (2100-00-001 "LUIS ARMANDO SOSA PEREZ — Driver Escrow"). The advance
-- family does not: 28 live sub-accounts under 1245 Driver Cash Advances Receivable carry generated strings like
-- DRIVERCASHAD896665-007 — they do not sort, do not read as children of 1245, and give the same driver a different
-- number (he is 001 in escrow, 007 in advances).
--
-- This renames each LIVE advance sub-account IN PLACE (no new accounts, nothing deactivated) to
--   1245-00-<the driver's escrow nnn>   "<DRIVER NAME> — Driver Cash Advance"
-- taking nnn and the name from the driver's own 2100-00-nnn escrow account (accounting.escrow_accounts, holder_type
-- 'driver'). The 1245 parent is resolved through the advance_recovery role binding, never by number (365.1).
--
-- Measured 2026-10-04 (prod, direct, USMCA): 47 advance sub-accounts, ALL with 0 postings (28 live + bridged, 1
-- deactivated + bridged, 18 deactivated test rows with no driver). All 30 bridged drivers have a 2100-00-nnn escrow
-- account. Two escrow accounts are shared by two driver records each (023 GENARO GUERRERO CHAVEZ, 024 ANGEL ALFONSO
-- SOSA — duplicate driver records of one person); for 024 only one record had an advance account, so the other
-- (52037e93…) had none and every advance for him was refused. The escrow system already treats the two records as one
-- person; step 3 links the second record to the same advance account, the same way.
--
-- Deactivated sub-accounts keep their old number: they carry no postings and no live driver, and renumbering a
-- retired row would consume an nnn. Scope: USMCA (TRANSP / TRK frozen). Idempotent: an account already in the new
-- shape is left alone, a link that exists is not re-inserted. Any conflict (two drivers on one account with different
-- escrow numbers, a target number already taken) RAISES — nothing is guessed.

DO $$
DECLARE
  v_company uuid;
  v_parent uuid;
  v_bad int;
  v_renamed int := 0;
  v_linked int := 0;
BEGIN
  SELECT id INTO v_company FROM org.companies WHERE code = 'USMCA';
  IF v_company IS NULL THEN
    RAISE NOTICE 'USMCA not present on this database — nothing to renumber';
    RETURN;
  END IF;
  SELECT account_id INTO v_parent
    FROM accounting.chart_of_accounts_roles
   WHERE operating_company_id = v_company AND role = 'advance_recovery' AND is_active
   LIMIT 1;
  IF v_parent IS NULL THEN
    RAISE NOTICE 'USMCA has no advance_recovery role binding — nothing to renumber';
    RETURN;
  END IF;

  DROP TABLE IF EXISTS _adv_target;
  CREATE TEMP TABLE _adv_target ON COMMIT DROP AS
  SELECT a.id AS account_id,
         min(substring(e.account_number FROM '^2100-00-([0-9]{3})$')) AS nnn,
         max(substring(e.account_number FROM '^2100-00-([0-9]{3})$')) AS nnn_max,
         min(split_part(e.account_name, ' — ', 1)) AS driver_name
    FROM catalogs.accounts a
    JOIN driver_finance.driver_advance_accounts d
      ON d.coa_account_id = a.id AND d.operating_company_id = v_company AND d.is_active
    JOIN accounting.escrow_accounts ea
      ON ea.holder_type = 'driver' AND ea.holder_id = d.driver_id
    JOIN catalogs.accounts e
      ON e.id = ea.coa_account_id AND e.operating_company_id = v_company AND e.account_number ~ '^2100-00-[0-9]{3}$'
   WHERE a.operating_company_id = v_company
     AND a.parent_account_id = v_parent
     AND a.deactivated_at IS NULL
   GROUP BY a.id;

  SELECT count(*) INTO v_bad FROM _adv_target WHERE nnn IS DISTINCT FROM nnn_max;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'driver_subaccount_number_conflict: % advance account(s) are linked to drivers with different escrow numbers', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM catalogs.accounts a
   WHERE a.parent_account_id = v_parent AND a.deactivated_at IS NULL
     AND a.account_number !~ '^1245-00-[0-9]{3}$'
     AND a.id NOT IN (SELECT account_id FROM _adv_target);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'driver_subaccount_without_escrow_number: % live advance sub-account(s) have no driver with a 2100-00-nnn escrow account', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM _adv_target t
    JOIN catalogs.accounts x
      ON x.operating_company_id = v_company AND x.account_number = '1245-00-' || t.nnn AND x.id <> t.account_id;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'driver_subaccount_number_taken: % target number(s) 1245-00-nnn already belong to another account', v_bad;
  END IF;

  UPDATE catalogs.accounts a
     SET account_number = '1245-00-' || t.nnn,
         account_name = t.driver_name || ' — Driver Cash Advance',
         updated_at = now()
    FROM _adv_target t
   WHERE a.id = t.account_id
     AND (a.account_number IS DISTINCT FROM '1245-00-' || t.nnn OR a.account_name IS DISTINCT FROM t.driver_name || ' — Driver Cash Advance');
  GET DIAGNOSTICS v_renamed = ROW_COUNT;

  -- A driver record with no advance account, whose escrow account is shared with another record that has one: link
  -- him to that same advance account (one person, one account — as escrow already does).
  INSERT INTO driver_finance.driver_advance_accounts (operating_company_id, driver_id, coa_account_id, is_active)
  SELECT DISTINCT ON (ea_me.holder_id) v_company, ea_me.holder_id, d_sib.coa_account_id, true
    FROM accounting.escrow_accounts ea_me
    JOIN catalogs.accounts e ON e.id = ea_me.coa_account_id AND e.operating_company_id = v_company
    JOIN accounting.escrow_accounts ea_sib
      ON ea_sib.coa_account_id = ea_me.coa_account_id AND ea_sib.holder_type = 'driver' AND ea_sib.holder_id <> ea_me.holder_id
    JOIN driver_finance.driver_advance_accounts d_sib
      ON d_sib.driver_id = ea_sib.holder_id AND d_sib.operating_company_id = v_company AND d_sib.is_active
    JOIN catalogs.accounts a ON a.id = d_sib.coa_account_id AND a.deactivated_at IS NULL AND a.parent_account_id = v_parent
   WHERE ea_me.holder_type = 'driver'
     AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_advance_accounts d_me
                      WHERE d_me.operating_company_id = v_company AND d_me.driver_id = ea_me.holder_id)
   ORDER BY ea_me.holder_id, d_sib.coa_account_id;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  RAISE NOTICE 'driver sub-account numbering: % advance account(s) renamed to 1245-00-nnn, % duplicate driver record(s) linked', v_renamed, v_linked;
END $$;
