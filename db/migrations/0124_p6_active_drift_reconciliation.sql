-- ═══════════════════════════════════════════════════════════════════
-- 0124 — Active drift reconciliation + canonical driver_settlements
-- ═══════════════════════════════════════════════════════════════════
--
-- driver_finance.driver_settlements was queried by active backend code
-- but never defined in any migration in the repo. This migration
-- reconstructs it from the active backend contract (see PR description
-- for column-by-column evidence).
--
-- DECISIONS RECORDED (per Jorge):
--
-- 1. Money columns use numeric(14,2) to match active report contract.
--    TECH DEBT: convert to bigint cents in Phase 8 cleanup for
--    consistency with rest of IH35.
--
-- 2. status CHECK is permissive (10 values) to avoid rejecting any
--    code-path-observed status.
--    TECH DEBT: audit + narrow status enum in Phase 8.
--
-- 3. operating_company_id required for RLS.
--
-- 4. No soft-delete column (settlements are not soft-deleteable).
--
-- 5. 0095 triggers (severe_repair_estimate, severe_repair_estimate_from_line,
--    unit_back_in_service_check) are rewritten to match current production
--    schema (wo_type/work_order_uuid/total_cost), not ported verbatim from
--    0095 source (which referenced obsolete columns severity/work_order_id/amount).
--
--    Original 0095 semantics are preserved with schema-compatible mappings.
--
-- 6. 0095 trigger semantic mapping (per Jorge):
--    OLD: work_orders.severity IN ('severe','out_of_service','total_loss')
--    NEW: work_orders.wo_type IN ('repair','accident')
--
--    Rationale: pm and tire wo_types never produce severe repair estimates.
--    repair and accident wo_types may produce significant estimates — office
--    refines damage_severity post-creation.
--
--    TECH DEBT: as fleet operates, audit whether tire should join the trigger
--    set for catastrophic incidents. Currently excluded for noise reduction.
--
-- 7. safety.company_violations columns added (per Jorge decision after
--    process-failure discussion):
--    - outcome (text, CHECK enum)
--    - violation_type_uuid (uuid FK to catalogs.company_violation_types)
--    - violation_type_id (uuid FK to catalogs.company_violation_types)
--
--    These columns are referenced by active backend code in
--    apps/backend/src/safety/company-violations.service.ts but were
--    missing from production schema, causing silent failure of
--    auto-fine workflow.
--
--    Restored via 0124 to match active backend contract.
--
--    TECH DEBT: violation_type_uuid + violation_type_id is redundant.
--    Backend uses COALESCE(violation_type_uuid, violation_type_id)
--    suggesting transition state. Phase 8 cleanup: pick canonical
--    column, migrate FKs, drop the other.
--
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE SCHEMA IF NOT EXISTS driver_finance;
CREATE SCHEMA IF NOT EXISTS views;

-- ===== Canonical settlement table (reconstructed from active contract) =====
CREATE TABLE IF NOT EXISTS driver_finance.driver_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  display_id text NOT NULL,
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL CHECK (status IN (
    'draft', 'presettle', 'acked', 'locked', 'paid',
    'held', 'cancelled', 'final', 'ready', 'approved'
  )),
  gross_pay numeric(14,2) NOT NULL DEFAULT 0,
  deductions_total numeric(14,2) NOT NULL DEFAULT 0,
  reimbursements_total numeric(14,2) NOT NULL DEFAULT 0,
  net_pay numeric(14,2) NOT NULL DEFAULT 0,
  acknowledged_at timestamptz,
  acknowledged_by_user_id uuid REFERENCES identity.users(id),
  locked_at timestamptz,
  paid_at timestamptz,
  paid_via_bank_txn_id uuid,
  payment_state text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_state IN ('unpaid', 'queued', 'sent_to_bank', 'cleared', 'bounced', 'manual_paid')),
  payment_queued_at timestamptz,
  payment_sent_at timestamptz,
  payment_cleared_at timestamptz,
  payment_bank_reference text,
  payment_bounced_reason text,
  payment_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, display_id),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_driver_settlements_company_period
  ON driver_finance.driver_settlements (operating_company_id, period_start DESC, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_driver_period
  ON driver_finance.driver_settlements (driver_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_company_status
  ON driver_finance.driver_settlements (operating_company_id, status, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_company_payment_state
  ON driver_finance.driver_settlements (operating_company_id, payment_state, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_company_created_at
  ON driver_finance.driver_settlements (operating_company_id, created_at DESC);

ALTER TABLE driver_finance.driver_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settlement_company_scope ON driver_finance.driver_settlements;
CREATE POLICY settlement_company_scope
  ON driver_finance.driver_settlements
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE OR REPLACE FUNCTION driver_finance.next_settlement_display_id(p_operating_company_id uuid, p_period_start date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year int := EXTRACT(year FROM p_period_start)::int;
  v_next int := 1;
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL THEN
    SELECT COALESCE(
      MAX(
        CASE
          WHEN display_id ~ ('^S-' || v_year::text || '-[0-9]{4}$')
            THEN right(display_id, 4)::int
          ELSE 0
        END
      ),
      0
    ) + 1
    INTO v_next
    FROM driver_finance.driver_settlements
    WHERE operating_company_id = p_operating_company_id
      AND period_start >= make_date(v_year, 1, 1)
      AND period_start < make_date(v_year + 1, 1, 1);
  END IF;

  RETURN format('S-%s-%s', v_year, lpad(v_next::text, 4, '0'));
END
$$;

CREATE INDEX IF NOT EXISTS idx_settlements_period_status
  ON driver_finance.driver_settlements (period_start, period_end, status);

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL
     AND to_regclass('driver_finance.driver_settlements') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'driver_finance'
         AND t.relname = 'driver_settlement_deductions'
         AND c.contype = 'f'
         AND pg_get_constraintdef(c.oid) ILIKE '%(applied_to_settlement_id)%REFERENCES driver_finance.driver_settlements(id)%'
     ) THEN
    ALTER TABLE driver_finance.driver_settlement_deductions
      ADD CONSTRAINT driver_settlement_deductions_applied_to_settlement_fkey
      FOREIGN KEY (applied_to_settlement_id)
      REFERENCES driver_finance.driver_settlements(id);
  END IF;
END
$$;

-- ===== From 0052 — factoring detail views =====
DROP VIEW IF EXISTS views.factoring_statements_settings;
DROP VIEW IF EXISTS views.factoring_chargebacks_fees;
DROP VIEW IF EXISTS views.factoring_recourse_at_risk;
DROP VIEW IF EXISTS views.factoring_summary;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_companies') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.factoring_summary
      WITH (security_invoker = true) AS
      WITH company_base AS (
        SELECT
          fc.operating_company_id,
          fc.id AS factoring_company_id,
          COALESCE(fc.display_name, 'Faro Factoring')::text AS factoring_company_name,
          fc.active,
          COALESCE(fc.current_reserve_balance, 0)::numeric AS current_reserve_balance,
          COALESCE(fc.current_chargeback_balance, 0)::numeric AS current_chargeback_balance,
          fc.last_advance_at,
          COALESCE(NULLIF(to_jsonb(fc)->>'recourse_days', '')::int, 90) AS recourse_days
        FROM accounting.factoring_companies fc
      ),
      active_counts AS (
        SELECT
          operating_company_id,
          COUNT(*) FILTER (WHERE active = true)::int AS active_factor_count
        FROM company_base
        GROUP BY operating_company_id
      ),
      mtd_advances AS (
        SELECT
          fa.operating_company_id,
          COUNT(*)::int AS mtd_advances_count,
          SUM(COALESCE(NULLIF(to_jsonb(fa)->>'advance_amount', '')::numeric, 0))::numeric AS mtd_advanced_total
        FROM accounting.factoring_advances fa
        WHERE fa.created_at >= date_trunc('month', now())
        GROUP BY fa.operating_company_id
      )
      SELECT
        cb.operating_company_id,
        cb.factoring_company_id AS active_factor_id,
        cb.factoring_company_name AS active_factor_name,
        cb.recourse_days,
        cb.current_reserve_balance AS reserve_balance,
        cb.current_chargeback_balance AS chargeback_balance,
        cb.last_advance_at,
        ac.active_factor_count,
        (ac.active_factor_count <= 1) AS single_factor_invariant_ok,
        COALESCE(ma.mtd_advances_count, 0)::int AS mtd_advances_count,
        COALESCE(ma.mtd_advanced_total, 0)::numeric AS mtd_advanced_total
      FROM company_base cb
      LEFT JOIN active_counts ac ON ac.operating_company_id = cb.operating_company_id
      LEFT JOIN mtd_advances ma ON ma.operating_company_id = cb.operating_company_id
      WHERE cb.active = true
      ORDER BY cb.factoring_company_name
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.factoring_summary
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS operating_company_id,
        NULL::uuid AS active_factor_id,
        NULL::text AS active_factor_name,
        90::int AS recourse_days,
        0::numeric AS reserve_balance,
        0::numeric AS chargeback_balance,
        NULL::timestamptz AS last_advance_at,
        0::int AS active_factor_count,
        true AS single_factor_invariant_ok,
        0::int AS mtd_advances_count,
        0::numeric AS mtd_advanced_total
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.factoring_recourse_at_risk
      WITH (security_invoker = true) AS
      WITH active_factor AS (
        SELECT
          fs.operating_company_id,
          fs.active_factor_name,
          fs.recourse_days
        FROM views.factoring_summary fs
      )
      SELECT
        fa.id AS factoring_advance_id,
        fa.operating_company_id,
        af.active_factor_name,
        COALESCE(NULLIF(to_jsonb(fa)->>'invoice_number', ''), NULLIF(to_jsonb(fa)->>'invoice_id', ''), fa.id::text) AS invoice_reference,
        COALESCE(NULLIF(to_jsonb(fa)->>'customer_name', ''), NULLIF(to_jsonb(fa)->>'customer_display_name', ''), 'Unknown Customer')::text AS customer_name,
        COALESCE(NULLIF(to_jsonb(fa)->>'invoice_total', '')::numeric, NULLIF(to_jsonb(fa)->>'invoice_amount', '')::numeric, COALESCE(NULLIF(to_jsonb(fa)->>'advance_amount', '')::numeric, 0))::numeric AS invoice_amount,
        COALESCE(NULLIF(to_jsonb(fa)->>'advance_amount', '')::numeric, 0)::numeric AS advance_amount,
        COALESCE(NULLIF(to_jsonb(fa)->>'reserve_amount', '')::numeric, 0)::numeric AS reserve_amount,
        fa.created_at AS factored_at,
        (fa.created_at + (COALESCE(af.recourse_days, 90) || ' days')::interval)::date AS recourse_expiry_date,
        GREATEST(0, (COALESCE(af.recourse_days, 90) - (CURRENT_DATE - fa.created_at::date)))::int AS days_until_recourse_expiry
      FROM accounting.factoring_advances fa
      LEFT JOIN active_factor af ON af.operating_company_id = fa.operating_company_id
      WHERE fa.created_at >= now() - interval '90 days'
      ORDER BY days_until_recourse_expiry ASC, fa.created_at DESC
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.factoring_recourse_at_risk
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS factoring_advance_id,
        NULL::uuid AS operating_company_id,
        NULL::text AS active_factor_name,
        NULL::text AS invoice_reference,
        NULL::text AS customer_name,
        0::numeric AS invoice_amount,
        0::numeric AS advance_amount,
        0::numeric AS reserve_amount,
        NULL::timestamptz AS factored_at,
        NULL::date AS recourse_expiry_date,
        0::int AS days_until_recourse_expiry
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.factoring_chargebacks_fees
      WITH (security_invoker = true) AS
      SELECT
        fa.id AS factoring_advance_id,
        fa.operating_company_id,
        fa.created_at,
        date_trunc('month', fa.created_at)::date AS statement_month,
        COALESCE(NULLIF(to_jsonb(fa)->>'chargeback_amount', '')::numeric, 0)::numeric AS chargeback_amount,
        COALESCE(NULLIF(to_jsonb(fa)->>'factor_fee_amount', '')::numeric, NULLIF(to_jsonb(fa)->>'fee_amount', '')::numeric, 0)::numeric AS factor_fee_amount,
        COALESCE(NULLIF(to_jsonb(fa)->>'statement_reference', ''), NULLIF(to_jsonb(fa)->>'memo', ''), fa.id::text) AS statement_reference
      FROM accounting.factoring_advances fa
      ORDER BY fa.created_at DESC
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.factoring_chargebacks_fees
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS factoring_advance_id,
        NULL::uuid AS operating_company_id,
        NULL::timestamptz AS created_at,
        NULL::date AS statement_month,
        0::numeric AS chargeback_amount,
        0::numeric AS factor_fee_amount,
        NULL::text AS statement_reference
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_companies') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.factoring_statements_settings
      WITH (security_invoker = true) AS
      WITH active_factor AS (
        SELECT
          fs.operating_company_id,
          fs.active_factor_id,
          fs.active_factor_name,
          fs.recourse_days,
          fs.active_factor_count,
          fs.single_factor_invariant_ok
        FROM views.factoring_summary fs
      ),
      statement_rollup AS (
        SELECT
          fcf.operating_company_id,
          date_trunc('month', fcf.created_at)::date AS statement_month,
          SUM(fcf.chargeback_amount)::numeric AS month_chargebacks_total,
          SUM(fcf.factor_fee_amount)::numeric AS month_factor_fees_total
        FROM views.factoring_chargebacks_fees fcf
        GROUP BY fcf.operating_company_id, date_trunc('month', fcf.created_at)
      )
      SELECT
        af.operating_company_id,
        af.active_factor_id,
        af.active_factor_name,
        af.recourse_days,
        af.active_factor_count,
        af.single_factor_invariant_ok,
        sr.statement_month,
        COALESCE(sr.month_chargebacks_total, 0)::numeric AS month_chargebacks_total,
        COALESCE(sr.month_factor_fees_total, 0)::numeric AS month_factor_fees_total
      FROM active_factor af
      LEFT JOIN statement_rollup sr ON sr.operating_company_id = af.operating_company_id
      ORDER BY af.active_factor_name, sr.statement_month DESC NULLS LAST
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.factoring_statements_settings
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS operating_company_id,
        NULL::uuid AS active_factor_id,
        NULL::text AS active_factor_name,
        90::int AS recourse_days,
        0::int AS active_factor_count,
        true AS single_factor_invariant_ok,
        NULL::date AS statement_month,
        0::numeric AS month_chargebacks_total,
        0::numeric AS month_factor_fees_total
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

-- ===== From 0054 — form_425c trigger =====
CREATE OR REPLACE FUNCTION catalogs.form_425c_profiles_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.last_updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_425c_profiles_updated_at ON catalogs.form_425c_company_profiles;
CREATE TRIGGER trg_form_425c_profiles_updated_at
  BEFORE UPDATE ON catalogs.form_425c_company_profiles
  FOR EACH ROW EXECUTE FUNCTION catalogs.form_425c_profiles_set_updated_at();

-- ===== From 0060 — accounting payment recompute triggers =====
CREATE OR REPLACE FUNCTION accounting.recompute_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid;
  v_new_invoice_id uuid := NULL;
  v_old_invoice_id uuid := NULL;
  v_paid bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new_invoice_id := NEW.invoice_id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_invoice_id := OLD.invoice_id;
  END IF;

  FOR v_invoice_id IN
    SELECT DISTINCT x.invoice_id
    FROM (VALUES (v_new_invoice_id), (v_old_invoice_id)) AS x(invoice_id)
    WHERE x.invoice_id IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(amount_cents), 0)::bigint
      INTO v_paid
    FROM accounting.payment_applications
    WHERE invoice_id = v_invoice_id;

    UPDATE accounting.invoices i
    SET
      amount_paid_cents = v_paid,
      status = CASE
        WHEN i.status = 'void' THEN 'void'
        WHEN i.status = 'factored' THEN 'factored'
        WHEN v_paid >= i.total_cents AND i.total_cents > 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partial'
        WHEN i.status IN ('partial', 'paid') THEN 'sent'
        ELSE i.status
      END,
      updated_at = now()
    WHERE i.id = v_invoice_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS pmt_app_recompute_invoice ON accounting.payment_applications;
CREATE TRIGGER pmt_app_recompute_invoice
AFTER INSERT OR UPDATE OR DELETE ON accounting.payment_applications
FOR EACH ROW EXECUTE FUNCTION accounting.recompute_invoice_paid();

CREATE OR REPLACE FUNCTION accounting.recompute_payment_applied()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_id uuid;
  v_new_payment_id uuid := NULL;
  v_old_payment_id uuid := NULL;
  v_applied bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new_payment_id := NEW.payment_id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_payment_id := OLD.payment_id;
  END IF;

  FOR v_payment_id IN
    SELECT DISTINCT x.payment_id
    FROM (VALUES (v_new_payment_id), (v_old_payment_id)) AS x(payment_id)
    WHERE x.payment_id IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(amount_cents), 0)::bigint
      INTO v_applied
    FROM accounting.payment_applications
    WHERE payment_id = v_payment_id;

    UPDATE accounting.payments p
    SET amount_applied_cents = v_applied
    WHERE p.id = v_payment_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS pmt_app_recompute_payment ON accounting.payment_applications;
CREATE TRIGGER pmt_app_recompute_payment
AFTER INSERT OR UPDATE OR DELETE ON accounting.payment_applications
FOR EACH ROW EXECUTE FUNCTION accounting.recompute_payment_applied();

-- ===== From 0088 — settlement_payment_events append-only =====
CREATE OR REPLACE FUNCTION driver_finance.settlement_payment_events_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'driver_finance.settlement_payment_events is append-only — UPDATE/DELETE blocked';
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_payment_events_no_mutation ON driver_finance.settlement_payment_events;
CREATE TRIGGER trg_settlement_payment_events_no_mutation
  BEFORE UPDATE OR DELETE ON driver_finance.settlement_payment_events
  FOR EACH ROW EXECUTE FUNCTION driver_finance.settlement_payment_events_block_mutation();

-- ===== From 0093 — expense_lines + work_orders triggers =====
CREATE OR REPLACE FUNCTION accounting.enforce_load_fk_invariant()
RETURNS trigger AS $$
DECLARE
  v_required boolean := false;
BEGIN
  IF NEW.load_exemption_reason IS NOT NULL THEN
    IF length(trim(NEW.load_exemption_reason)) < 20 THEN
      RAISE EXCEPTION
        'E_LOAD_EXEMPTION_REASON_TOO_SHORT: load_exemption_reason must be >=20 chars';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA = 'accounting' AND TG_TABLE_NAME = 'expense_lines' THEN
    v_required := COALESCE(NEW.load_required, false);
    IF NEW.line_category IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM accounting.line_category_load_required r
        WHERE r.line_category = NEW.line_category
      ) INTO v_required;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'fuel' AND TG_TABLE_NAME = 'fuel_transactions' THEN
    v_required := COALESCE(NEW.load_required, true);
  END IF;

  IF v_required AND NEW.load_id IS NULL THEN
    RAISE EXCEPTION
      'E_LOAD_FK_REQUIRED: %.% category=% requires load_id (G18 invariant). Provide load_id OR load_exemption_reason >=20 chars.',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      COALESCE(NEW.line_category, 'n/a');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expense_line_load_fk ON accounting.expense_lines;
CREATE TRIGGER trg_expense_line_load_fk
  BEFORE INSERT OR UPDATE ON accounting.expense_lines
  FOR EACH ROW
  EXECUTE FUNCTION accounting.enforce_load_fk_invariant();

CREATE OR REPLACE FUNCTION maintenance.wo_set_opened_at()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.opened_at IS NULL THEN
    NEW.opened_at := COALESCE(NEW.created_at, now());
  ELSIF TG_OP = 'UPDATE' AND OLD.opened_at IS DISTINCT FROM NEW.opened_at THEN
    RAISE EXCEPTION 'E_WO_OPENED_AT_IMMUTABLE: opened_at cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wo_set_opened_at ON maintenance.work_orders;
CREATE TRIGGER trg_wo_set_opened_at
  BEFORE INSERT OR UPDATE ON maintenance.work_orders
  FOR EACH ROW EXECUTE FUNCTION maintenance.wo_set_opened_at();

CREATE OR REPLACE FUNCTION maintenance.wo_set_closed_at()
RETURNS trigger AS $$
BEGIN
  IF OLD.closed_at IS NOT NULL THEN
    NEW.closed_at := OLD.closed_at;
    RETURN NEW;
  END IF;

  IF (NEW.status IN ('closed', 'completed', 'voided', 'complete', 'cancelled'))
     AND (COALESCE(OLD.status, '') NOT IN ('closed', 'completed', 'voided', 'complete', 'cancelled'))
     AND NEW.closed_at IS NULL
  THEN
    NEW.closed_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wo_set_closed_at ON maintenance.work_orders;
CREATE TRIGGER trg_wo_set_closed_at
  BEFORE UPDATE ON maintenance.work_orders
  FOR EACH ROW EXECUTE FUNCTION maintenance.wo_set_closed_at();

-- ===== From 0094 — auto-propose escrow on abandon =====
CREATE OR REPLACE FUNCTION dispatch.auto_propose_escrow_on_abandonment()
RETURNS trigger AS $$
DECLARE
  v_abandonment_id uuid;
  v_estimated_cost_cents bigint;
  v_load_value_cents bigint;
  v_abandonment_type text;
  v_breakdown jsonb;
BEGIN
  IF NEW.status NOT IN ('abandoned', 'driver_walkoff', 'driver_no_show') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('abandoned', 'driver_walkoff', 'driver_no_show') THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_primary_driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_load_value_cents := GREATEST(COALESCE(NEW.rate_total_cents, 0), 0);
  v_estimated_cost_cents := GREATEST((v_load_value_cents * 15) / 100, 50000);
  v_abandonment_type := CASE NEW.status
    WHEN 'driver_walkoff' THEN 'walkoff'
    WHEN 'driver_no_show' THEN 'no_show'
    ELSE 'other'
  END;

  INSERT INTO dispatch.load_abandonments (
    operating_company_id,
    load_id,
    driver_id,
    unit_id,
    abandoned_at,
    abandonment_type,
    estimated_cost_cents
  ) VALUES (
    NEW.operating_company_id,
    NEW.id,
    NEW.assigned_primary_driver_id,
    NEW.assigned_unit_id,
    now(),
    v_abandonment_type,
    v_estimated_cost_cents
  ) RETURNING id INTO v_abandonment_id;

  v_breakdown := jsonb_build_object(
    'load_value_cents', v_load_value_cents,
    'percent_factor', 15,
    'minimum_floor_cents', 50000,
    'calculated_cents', v_estimated_cost_cents,
    'load_number', NEW.load_number,
    'abandonment_type', v_abandonment_type
  );

  INSERT INTO driver_finance.escrow_deductions_pending (
    operating_company_id,
    driver_id,
    source_type,
    source_id,
    load_id,
    proposed_amount_cents,
    proposed_reason,
    proposed_breakdown_json,
    proposed_by_system
  ) VALUES (
    NEW.operating_company_id,
    NEW.assigned_primary_driver_id,
    'load_abandonment',
    v_abandonment_id,
    NEW.id,
    v_estimated_cost_cents,
    'Auto-proposed: load ' || COALESCE(NEW.load_number, NEW.id::text) || ' abandoned (' || NEW.status::text || ')',
    v_breakdown,
    true
  )
  ON CONFLICT (operating_company_id, source_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_propose_escrow_on_abandon ON mdata.loads;
CREATE TRIGGER trg_auto_propose_escrow_on_abandon
  AFTER UPDATE OF status ON mdata.loads
  FOR EACH ROW
  EXECUTE FUNCTION dispatch.auto_propose_escrow_on_abandonment();

-- ===== From 0095 — severe repair triggers =====
ALTER TABLE maintenance.severe_repair_estimates
  DROP CONSTRAINT IF EXISTS severe_repair_estimates_damage_severity_check;
ALTER TABLE maintenance.severe_repair_estimates
  ADD CONSTRAINT severe_repair_estimates_damage_severity_check
  CHECK (damage_severity IN ('severe', 'out_of_service', 'total_loss', 'unspecified'));

ALTER TABLE maintenance.severe_repair_estimates
  DROP CONSTRAINT IF EXISTS severe_repair_estimates_estimate_status_check;
ALTER TABLE maintenance.severe_repair_estimates
  ADD CONSTRAINT severe_repair_estimates_estimate_status_check
  CHECK (estimate_status IN ('open', 'awaiting_approval', 'approved', 'rejected', 'completed', 'draft', 'cancelled'));

DROP INDEX IF EXISTS maintenance.ux_severe_repair_estimates_trigger_wo_id;
CREATE UNIQUE INDEX IF NOT EXISTS ux_severe_repair_estimates_trigger_wo_id
  ON maintenance.severe_repair_estimates (trigger_wo_id);

CREATE OR REPLACE FUNCTION maintenance.upsert_severe_repair_estimate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.wo_type NOT IN ('repair', 'accident') THEN
    RETURN NEW;
  END IF;

  INSERT INTO maintenance.severe_repair_estimates (
    operating_company_id,
    unit_id,
    trigger_wo_id,
    damage_severity,
    estimate_status,
    estimate_location,
    estimated_labor_cents,
    estimated_parts_cents,
    estimated_outside_service_cents,
    description,
    refreshed_at
  ) VALUES (
    NEW.operating_company_id,
    NEW.unit_id,
    NEW.id,
    'unspecified',
    'draft',
    NEW.repair_location,
    0,
    0,
    0,
    NEW.description,
    now()
  )
  ON CONFLICT (trigger_wo_id) DO UPDATE
  SET description = EXCLUDED.description,
      estimate_location = EXCLUDED.estimate_location,
      updated_at = now()
  WHERE maintenance.severe_repair_estimates.estimate_status NOT IN ('completed', 'cancelled');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upsert_severe_repair_estimate ON maintenance.work_orders;
CREATE TRIGGER trg_upsert_severe_repair_estimate
  AFTER INSERT OR UPDATE OF wo_type, status, unit_id, repair_location, description
  ON maintenance.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION maintenance.upsert_severe_repair_estimate();

CREATE OR REPLACE FUNCTION maintenance.refresh_severe_repair_estimate_from_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_wo_id uuid;
  v_total_cents bigint := 0;
BEGIN
  v_wo_id := COALESCE(NEW.work_order_uuid, OLD.work_order_uuid);
  IF v_wo_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(ROUND(COALESCE(wl.total_cost, 0) * 100)), 0)::bigint
  INTO v_total_cents
  FROM maintenance.work_order_lines wl
  WHERE wl.work_order_uuid = v_wo_id;

  UPDATE maintenance.severe_repair_estimates e
  SET estimated_labor_cents = 0,
      estimated_parts_cents = 0,
      estimated_outside_service_cents = 0,
      refreshed_at = now(),
      updated_at = now()
  WHERE e.trigger_wo_id = v_wo_id;

  IF to_regclass('maintenance.severe_repair_estimates') IS NOT NULL THEN
    -- estimated_total_cents is generated from component columns.
    UPDATE maintenance.severe_repair_estimates e
    SET estimated_outside_service_cents = v_total_cents,
        refreshed_at = now(),
        updated_at = now()
    WHERE e.trigger_wo_id = v_wo_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_severe_repair_estimate_from_line ON maintenance.work_order_lines;
CREATE TRIGGER trg_refresh_severe_repair_estimate_from_line
  AFTER INSERT OR UPDATE OR DELETE
  ON maintenance.work_order_lines
  FOR EACH ROW
  EXECUTE FUNCTION maintenance.refresh_severe_repair_estimate_from_line();

CREATE OR REPLACE FUNCTION maintenance.unit_back_in_service_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_open_count int := 0;
BEGIN
  IF NEW.unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('complete', 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int
  INTO v_open_count
  FROM maintenance.work_orders w
  WHERE w.unit_id = NEW.unit_id
    AND w.id <> NEW.id
    AND w.status NOT IN ('complete', 'cancelled');

  IF v_open_count = 0 THEN
    UPDATE mdata.units
    SET status = 'InService'::mdata.unit_status,
        is_oos = false,
        oos_since = NULL,
        oos_reason = NULL,
        oos_location = NULL,
        updated_at = now()
    WHERE id = NEW.unit_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unit_back_in_service_check ON maintenance.severe_repair_estimates;
DROP TRIGGER IF EXISTS trg_unit_back_in_service_check ON maintenance.work_orders;
CREATE TRIGGER trg_unit_back_in_service_check
  AFTER UPDATE OF status
  ON maintenance.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION maintenance.unit_back_in_service_check();

-- ===== From 0096 — settlement disputes table + indexes =====
CREATE TABLE IF NOT EXISTS driver_finance.driver_settlement_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  settlement_id uuid NOT NULL REFERENCES driver_finance.driver_settlements(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  dispute_category text NOT NULL CHECK (dispute_category IN (
    'missing_pay', 'wrong_deduction', 'miscalculated_mileage',
    'wrong_rate', 'detention_not_paid', 'cash_advance_dispute',
    'fine_dispute', 'escrow_dispute', 'other'
  )),
  dispute_description text NOT NULL CHECK (length(trim(dispute_description)) >= 20),
  disputed_amount_cents bigint,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'under_review', 'resolved_in_favor', 'resolved_rejected',
    'partially_resolved', 'withdrawn'
  )),
  opened_by_driver boolean NOT NULL DEFAULT true,
  opened_by_user_id uuid REFERENCES identity.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id uuid REFERENCES identity.users(id),
  reviewed_at timestamptz,
  resolution_notes text,
  resolution_amount_cents bigint,
  resolution_journal_entry_id uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_finance.driver_settlement_disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_settlement_disputes_isolation ON driver_finance.driver_settlement_disputes;
CREATE POLICY rls_settlement_disputes_isolation
  ON driver_finance.driver_settlement_disputes
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS idx_dispute_settlement
  ON driver_finance.driver_settlement_disputes (settlement_id);
CREATE INDEX IF NOT EXISTS idx_dispute_driver_status
  ON driver_finance.driver_settlement_disputes (driver_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispute_company_open
  ON driver_finance.driver_settlement_disputes (operating_company_id, status, opened_at DESC)
  WHERE status IN ('open', 'under_review');

-- ===== From 0097 — team_settlement_splits table + indexes =====
CREATE TABLE IF NOT EXISTS driver_finance.team_settlement_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  team_id uuid NOT NULL REFERENCES mdata.driver_teams(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  pay_role text NOT NULL CHECK (pay_role IN ('primary', 'co')),
  split_method text NOT NULL,
  share_pct numeric(5,2) NOT NULL,
  total_load_pay_cents bigint NOT NULL,
  driver_pay_cents bigint NOT NULL,
  applied_to_settlement_id uuid REFERENCES driver_finance.driver_settlements(id),
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (load_id, driver_id)
);

ALTER TABLE driver_finance.team_settlement_splits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_team_splits_isolation ON driver_finance.team_settlement_splits;
CREATE POLICY rls_team_splits_isolation
  ON driver_finance.team_settlement_splits
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE INDEX IF NOT EXISTS idx_team_splits_driver
  ON driver_finance.team_settlement_splits (driver_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_splits_load
  ON driver_finance.team_settlement_splits (load_id);

-- ===== From 0109 — auto-fine on violation resolve trigger =====
ALTER TABLE safety.company_violations
  ADD COLUMN IF NOT EXISTS violation_type_uuid uuid REFERENCES catalogs.company_violation_types(id),
  ADD COLUMN IF NOT EXISTS violation_type_id uuid REFERENCES catalogs.company_violation_types(id),
  ADD COLUMN IF NOT EXISTS outcome text
    CHECK (outcome IN ('warning', 'written_reprimand', 'monetary_fine', 'termination', 'dismissed'));

CREATE OR REPLACE FUNCTION safety.auto_create_internal_fine_from_violation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_violation_type_amount INTEGER;
  v_violation_type_code TEXT;
  v_final_amount INTEGER;
  v_new_fine_uuid UUID;
  v_reason_id UUID;
  v_first_driver jsonb;
  v_driver_text text;
  v_driver_id UUID;
BEGIN
  IF NEW.outcome <> 'monetary_fine' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'closed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'closed' AND OLD.outcome = 'monetary_fine' THEN
    RETURN NEW;
  END IF;
  IF NEW.auto_created_internal_fine_uuid IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- related_drivers is untyped JSON in backend writes; accept both:
  -- 1) ["<uuid>", ...]
  -- 2) [{"id":"<uuid>"}] / [{"driver_id":"<uuid>"}] / [{"uuid":"<uuid>"}]
  -- Keep single-driver behavior by selecting the first driver only,
  -- aligned with singular auto_created_internal_fine_uuid contract.
  BEGIN
    IF jsonb_typeof(NEW.related_drivers) = 'array' THEN
      v_first_driver := NEW.related_drivers->0;
      IF jsonb_typeof(v_first_driver) = 'string' THEN
        v_driver_text := NULLIF(NEW.related_drivers->>0, '');
      ELSIF jsonb_typeof(v_first_driver) = 'object' THEN
        v_driver_text := COALESCE(
          NULLIF(v_first_driver->>'id', ''),
          NULLIF(v_first_driver->>'driver_id', ''),
          NULLIF(v_first_driver->>'uuid', '')
        );
      END IF;
    ELSIF jsonb_typeof(NEW.related_drivers) = 'object' THEN
      v_driver_text := COALESCE(
        NULLIF(NEW.related_drivers->>'id', ''),
        NULLIF(NEW.related_drivers->>'driver_id', ''),
        NULLIF(NEW.related_drivers->>'uuid', '')
      );
    END IF;
    IF v_driver_text IS NOT NULL THEN
      v_driver_id := v_driver_text::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    v_driver_id := NULL;
  END;

  IF v_driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cvt.amount_cents, cvt.type_code
    INTO v_violation_type_amount, v_violation_type_code
  FROM catalogs.company_violation_types cvt
  WHERE cvt.id = COALESCE(NEW.violation_type_uuid, NEW.violation_type_id)
  LIMIT 1;

  IF v_violation_type_code IS NULL THEN
    SELECT cvt.amount_cents, cvt.type_code
      INTO v_violation_type_amount, v_violation_type_code
    FROM catalogs.company_violation_types cvt
    WHERE cvt.operating_company_id = NEW.operating_company_id
      AND cvt.type_code = COALESCE(NEW.violation_type, '')
    LIMIT 1;
  END IF;

  v_final_amount := COALESCE(NEW.fine_amount_cents_override, v_violation_type_amount);
  IF v_final_amount IS NULL OR v_final_amount <= 0 THEN
    RAISE EXCEPTION 'E_VIOLATION_AMOUNT_REQUIRED: violation has no catalog amount and no override';
  END IF;

  SELECT id INTO v_reason_id
  FROM catalogs.internal_fine_reasons
  WHERE operating_company_id = NEW.operating_company_id
    AND reason_code = COALESCE(v_violation_type_code, 'GOVERNOR-OVERRIDE')
  LIMIT 1;

  IF v_reason_id IS NULL THEN
    INSERT INTO catalogs.internal_fine_reasons (
      operating_company_id, reason_code, reason_name, default_amount, is_active
    )
    VALUES (
      NEW.operating_company_id,
      COALESCE(v_violation_type_code, 'AUTO-COMPANY-VIOLATION'),
      COALESCE(v_violation_type_code, 'Auto company violation'),
      ROUND(v_final_amount::numeric / 100, 2),
      TRUE
    )
    RETURNING id INTO v_reason_id;
  END IF;

  INSERT INTO safety.internal_fines (
    id,
    operating_company_id,
    driver_id,
    reason_id,
    amount,
    imposed_date,
    imposed_by_user_id,
    approved_by_user_id,
    status,
    notes,
    created_at
  ) VALUES (
    gen_random_uuid(),
    NEW.operating_company_id,
    v_driver_id,
    v_reason_id,
    ROUND(v_final_amount::numeric / 100, 2),
    CURRENT_DATE,
    NEW.updated_by_user_id,
    NEW.updated_by_user_id,
    'approved',
    'Auto-issued from company violation: ' || COALESCE(v_violation_type_code, 'unknown'),
    now()
  )
  RETURNING id INTO v_new_fine_uuid;

  NEW.auto_created_internal_fine_uuid := v_new_fine_uuid;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_auto_fine_on_violation_resolve ON safety.company_violations;
CREATE TRIGGER trg_auto_fine_on_violation_resolve
  BEFORE UPDATE OF status, outcome ON safety.company_violations
  FOR EACH ROW
  WHEN (NEW.status = 'closed' AND NEW.outcome = 'monetary_fine')
  EXECUTE FUNCTION safety.auto_create_internal_fine_from_violation();

-- ===== From 0111 — is_extra_stop refresh trigger =====
CREATE OR REPLACE FUNCTION mdata.refresh_is_extra_stop(p_load_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  v_first_pickup_seq int;
  v_last_delivery_seq int;
BEGIN
  SELECT MIN(sequence_number) INTO v_first_pickup_seq
  FROM mdata.load_stops
  WHERE load_id = p_load_id
    AND stop_type = 'pickup';

  SELECT MAX(sequence_number) INTO v_last_delivery_seq
  FROM mdata.load_stops
  WHERE load_id = p_load_id
    AND stop_type = 'delivery';

  UPDATE mdata.load_stops ls
  SET is_extra_stop = CASE
    WHEN ls.stop_type IN ('fuel', 'rest', 'border') THEN true
    WHEN v_first_pickup_seq IS NULL OR v_last_delivery_seq IS NULL THEN false
    WHEN ls.sequence_number = v_first_pickup_seq THEN false
    WHEN ls.sequence_number = v_last_delivery_seq THEN false
    ELSE true
  END,
  updated_at = now()
  WHERE ls.load_id = p_load_id;
END;
$func$;

CREATE OR REPLACE FUNCTION mdata.trg_refresh_is_extra_stop()
RETURNS trigger
LANGUAGE plpgsql
AS $trg$
DECLARE
  v_load_id uuid;
BEGIN
  -- Prevent recursive self-fire from mdata.refresh_is_extra_stop UPDATE.
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_load_id := COALESCE(NEW.load_id, OLD.load_id);
  PERFORM mdata.refresh_is_extra_stop(v_load_id);
  RETURN COALESCE(NEW, OLD);
END;
$trg$;

DROP TRIGGER IF EXISTS trg_refresh_is_extra_stop ON mdata.load_stops;
CREATE TRIGGER trg_refresh_is_extra_stop
AFTER INSERT OR UPDATE OR DELETE ON mdata.load_stops
FOR EACH ROW
EXECUTE FUNCTION mdata.trg_refresh_is_extra_stop();

-- ===== Grants =====
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.driver_settlements TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.driver_settlement_disputes TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.team_settlement_splits TO ih35_app;
GRANT SELECT ON views.factoring_recourse_at_risk TO ih35_app;
GRANT SELECT ON views.factoring_chargebacks_fees TO ih35_app;
GRANT SELECT ON views.factoring_statements_settings TO ih35_app;

COMMIT;
