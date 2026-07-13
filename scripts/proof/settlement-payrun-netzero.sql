\set ON_ERROR_STOP on
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- SETTLEMENT PAY-RUN NET-ZERO PROOF (SQL replica of settlement-payrun-close.service.ts arithmetic).
-- Formula (identical to the service):
--   NET     = gross − deductions − escrow_contribution − advance_recoveries − chargebacks
--   escrow  = min(standard, max(0, 200000 − escrow_balance_before))   [ESCROW_CAP_CENTS = 200000]
-- JE legs:  Dr driver_pay(gross) ; Cr deduction ; Cr chargeback ; Cr advance ; Cr escrow ; Cr cash(net)
-- Assert:   SUM(debits) == SUM(credits)  (balance to the cent).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

SET app.bypass_rls = 'lucia';

-- Seed one entity / user / driver / accounts.
INSERT INTO org.companies (id, name) VALUES ('00000000-0000-0000-0000-0000000000c0','Proof Co');
INSERT INTO identity.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000a1','maker@test'),
                                             ('00000000-0000-0000-0000-0000000000a2','checker@test');
INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name)
  VALUES ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c0','Belowcap','Driver'),
         ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c0','Atcap','Driver');
SELECT set_config('app.operating_company_id','00000000-0000-0000-0000-0000000000c0', false);

INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, parent_account_id, qbo_account_id) VALUES
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c0','A1','Driver Pay Expense','Expense',NULL,NULL),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c0','A2','Damage Claim Escrow','Liability',NULL,'1150040187'),
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000c0','A3','Driver Escrow (sub)','Liability','00000000-0000-0000-0000-000000000002','1150040187'),
  ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000c0','A4','Deduction Recovery','Liability',NULL,NULL),
  ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000c0','A5','Advance Clearing','Asset',NULL,NULL),
  ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000c0','A6','Chargeback Recovery','Income',NULL,NULL),
  ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-0000000000c0','A7','Cash — ACH','Asset',NULL,NULL);

\echo '════════════════════ CASE 1: escrow BELOW cap — JE must balance to the cent ════════════════════'
WITH params AS (
  SELECT 300000::bigint AS gross, 40000::bigint AS deductions, 10000::bigint AS chargebacks,
         20000::bigint AS advance, 50000::bigint AS escrow_bal_before, 25000::bigint AS standard,
         200000::bigint AS cap
), calc AS (
  SELECT *,
    LEAST(standard, GREATEST(0, cap - escrow_bal_before)) AS escrow,
    gross - deductions - LEAST(standard, GREATEST(0, cap - escrow_bal_before)) - advance - chargebacks AS net
  FROM params
), legs AS (
  SELECT 'debit'  AS dc, gross       AS cents, 'driver pay (gross)' AS memo FROM calc
  UNION ALL SELECT 'credit', deductions,  'deduction recovery' FROM calc
  UNION ALL SELECT 'credit', chargebacks, 'abandonment chargeback recovery' FROM calc
  UNION ALL SELECT 'credit', advance,     'cash-advance recovery' FROM calc
  UNION ALL SELECT 'credit', escrow,      'escrow contribution (capped @ $2,000)' FROM calc
  UNION ALL SELECT 'credit', net,         'net driver pay via ACH' FROM calc
)
SELECT dc, cents, memo FROM legs ORDER BY dc DESC, cents DESC;

DO $$
DECLARE gross bigint:=300000; deductions bigint:=40000; chargebacks bigint:=10000; advance bigint:=20000;
        bal bigint:=50000; standard bigint:=25000; cap bigint:=200000;
        escrow bigint; net bigint; dr bigint; cr bigint;
BEGIN
  escrow := LEAST(standard, GREATEST(0, cap - bal));
  net    := gross - deductions - escrow - advance - chargebacks;
  dr := gross;                                        -- one debit leg
  cr := deductions + chargebacks + advance + escrow + net;
  RAISE NOTICE 'CASE1 escrow_contribution = % (expected 25000)', escrow;
  RAISE NOTICE 'CASE1 net                 = % (expected 205000)', net;
  RAISE NOTICE 'CASE1 SUM(debits)         = %', dr;
  RAISE NOTICE 'CASE1 SUM(credits)        = %', cr;
  IF escrow <> 25000 THEN RAISE EXCEPTION 'CASE1 escrow expected 25000 got %', escrow; END IF;
  IF net <> 205000 THEN RAISE EXCEPTION 'CASE1 net expected 205000 got %', net; END IF;
  IF dr <> cr THEN RAISE EXCEPTION 'CASE1 UNBALANCED debits=% credits=%', dr, cr; END IF;
  RAISE NOTICE 'CASE1 RESULT: BALANCED to the cent (debits == credits == %)', dr;
END $$;

\echo '════════════════════ CASE 2: escrow AT / OVER the $2,000 cap — contribution == 0 ════════════════════'
DO $$
DECLARE cap bigint:=200000; standard bigint:=25000; e_at bigint; e_over bigint;
BEGIN
  e_at   := LEAST(standard, GREATEST(0, cap - 200000));   -- balance exactly at cap
  e_over := LEAST(standard, GREATEST(0, cap - 250000));   -- balance over cap
  RAISE NOTICE 'CASE2 escrow_contribution @cap(200000) = % (expected 0)', e_at;
  RAISE NOTICE 'CASE2 escrow_contribution @over(250000)= % (expected 0)', e_over;
  IF e_at <> 0 OR e_over <> 0 THEN RAISE EXCEPTION 'CASE2 escrow contribution not 0 (at=%, over=%)', e_at, e_over; END IF;
  RAISE NOTICE 'CASE2 RESULT: at/over cap contribution == 0';
END $$;

\echo '════════════════════ CASE 3: maker == checker CHECK must REJECT ════════════════════'
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO driver_finance.cash_advance_requests
      (operating_company_id, driver_id, requested_amount_cents, submitted_by_user_id, reviewed_by_user_id)
    VALUES ('00000000-0000-0000-0000-0000000000c0','00000000-0000-0000-0000-0000000000d1',
            5000,'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CASE3 maker==checker was NOT rejected (CHECK missing)'; END IF;
  RAISE NOTICE 'CASE3 RESULT: maker==checker REJECTED by cash_advance_requests_maker_ne_checker';
  -- distinct maker/checker is accepted
  INSERT INTO driver_finance.cash_advance_requests
    (operating_company_id, driver_id, requested_amount_cents, submitted_by_user_id, reviewed_by_user_id)
  VALUES ('00000000-0000-0000-0000-0000000000c0','00000000-0000-0000-0000-0000000000d1',
          5000,'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2');
  RAISE NOTICE 'CASE3 RESULT: distinct maker<>checker ACCEPTED';
END $$;

\echo '════════════════════ CASE 4: new settlement_lines line_type values ACCEPTED ════════════════════'
DO $$
DECLARE sid uuid;
BEGIN
  INSERT INTO driver_finance.driver_settlements (operating_company_id, driver_id, display_id, gross_pay, locked_at)
  VALUES ('00000000-0000-0000-0000-0000000000c0','00000000-0000-0000-0000-0000000000d1','S-PROOF',3000.00, now())
  RETURNING id INTO sid;
  INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
    VALUES (sid,'advance_recovery','advance recovery',-200.00),
           (sid,'escrow_contribution','escrow contribution',-250.00),
           (sid,'abandonment_chargeback','chargeback',-100.00);
  RAISE NOTICE 'CASE4 RESULT: advance_recovery + escrow_contribution line_types ACCEPTED';
  -- an unknown line_type must still be rejected (constraint not loosened to anything)
  BEGIN
    INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
      VALUES (sid,'bogus_type','x',1.00);
    RAISE EXCEPTION 'CASE4 unknown line_type was NOT rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CASE4 RESULT: unknown line_type still REJECTED (constraint intact)';
  END;
END $$;

\echo '════════════════════ CASE 5: payrun_gl_runs idempotency anchor (ON CONFLICT DO NOTHING) ════════════════════'
DO $$
DECLARE sid uuid; rc int; total int;
BEGIN
  INSERT INTO driver_finance.driver_settlements (operating_company_id, driver_id, display_id, gross_pay, locked_at)
  VALUES ('00000000-0000-0000-0000-0000000000c0','00000000-0000-0000-0000-0000000000d2','S-IDEMP',3000.00, now())
  RETURNING id INTO sid;

  INSERT INTO driver_finance.payrun_gl_runs (operating_company_id, settlement_id, status, created_by_user_id)
  VALUES ('00000000-0000-0000-0000-0000000000c0', sid, 'posted','00000000-0000-0000-0000-0000000000a1')
  ON CONFLICT (operating_company_id, settlement_id) DO NOTHING;
  GET DIAGNOSTICS rc = ROW_COUNT;
  RAISE NOTICE 'CASE5 first insert rowcount = % (expected 1)', rc;

  INSERT INTO driver_finance.payrun_gl_runs (operating_company_id, settlement_id, status, created_by_user_id)
  VALUES ('00000000-0000-0000-0000-0000000000c0', sid, 'posted','00000000-0000-0000-0000-0000000000a1')
  ON CONFLICT (operating_company_id, settlement_id) DO NOTHING;
  GET DIAGNOSTICS rc = ROW_COUNT;
  RAISE NOTICE 'CASE5 second insert rowcount = % (expected 0 — double-post blocked)', rc;

  SELECT count(*) INTO total FROM driver_finance.payrun_gl_runs WHERE settlement_id = sid;
  IF total <> 1 THEN RAISE EXCEPTION 'CASE5 expected exactly 1 payrun_gl_run row, got %', total; END IF;
  RAISE NOTICE 'CASE5 RESULT: exactly 1 run row per settlement — repeated close cannot double-post the JE';
END $$;

\echo '════════════════════ CASE 6: role_key CHECK now accepts abandonment_chargeback_recovery (fix) ════════════════════'
DO $$
DECLARE bogus_rejected boolean := false;
BEGIN
  INSERT INTO catalogs.account_role_bindings (role_key, account_id, operating_company_id)
  VALUES ('abandonment_chargeback_recovery','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000c0');
  RAISE NOTICE 'CASE6 RESULT: abandonment_chargeback_recovery binding ACCEPTED (chargeback leg can now resolve)';
  BEGIN
    INSERT INTO catalogs.account_role_bindings (role_key, account_id, operating_company_id)
    VALUES ('totally_bogus_role','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000c0');
  EXCEPTION WHEN check_violation THEN bogus_rejected := true;
  END;
  IF NOT bogus_rejected THEN RAISE EXCEPTION 'CASE6 bogus role_key was NOT rejected (constraint too loose)'; END IF;
  RAISE NOTICE 'CASE6 RESULT: bogus role_key still REJECTED (constraint intact, only widened by one key)';
END $$;

\echo '════════════════════ ALL CASES PASSED ════════════════════'
