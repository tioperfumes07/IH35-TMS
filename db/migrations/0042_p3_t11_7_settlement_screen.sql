BEGIN;

CREATE SCHEMA IF NOT EXISTS views;

CREATE SCHEMA IF NOT EXISTS driver_finance;

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

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL
     AND to_regclass('driver_finance.deduction_schedule') IS NOT NULL
     AND to_regclass('mdata.drivers') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.driver_settlement_with_debt
      WITH (security_invoker = true)
      AS
      SELECT
        s.id,
        s.driver_id,
        s.period_start,
        s.period_end,
        s.status,
        s.gross_pay,
        s.deductions_total,
        s.reimbursements_total,
        s.net_pay,
        s.acknowledged_at,
        s.acknowledged_by_user_id,
        s.locked_at,
        s.paid_at,
        s.paid_via_bank_txn_id,
        concat_ws(' ', d.first_name, d.last_name) AS driver_full_name,
        d.id::text AS driver_display_id,
        EXISTS (
          SELECT 1
          FROM driver_finance.deduction_schedule ds
          WHERE ds.driver_id = s.driver_id
            AND ds.requires_acknowledgment = true
            AND ds.acknowledgment_uuid IS NULL
        ) AS has_pending_acks
      FROM driver_finance.driver_settlements s
      JOIN mdata.drivers d ON d.id = s.driver_id
    $VIEW$;

    EXECUTE $INDEX$
      CREATE INDEX IF NOT EXISTS idx_settlements_period_status
      ON driver_finance.driver_settlements (period_start, period_end, status)
    $INDEX$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.driver_settlement_with_debt
      WITH (security_invoker = true)
      AS
      SELECT
        NULL::uuid AS id,
        NULL::uuid AS driver_id,
        NULL::date AS period_start,
        NULL::date AS period_end,
        NULL::text AS status,
        NULL::numeric AS gross_pay,
        NULL::numeric AS deductions_total,
        NULL::numeric AS reimbursements_total,
        NULL::numeric AS net_pay,
        NULL::timestamptz AS acknowledged_at,
        NULL::uuid AS acknowledged_by_user_id,
        NULL::timestamptz AS locked_at,
        NULL::timestamptz AS paid_at,
        NULL::uuid AS paid_via_bank_txn_id,
        NULL::text AS driver_full_name,
        NULL::text AS driver_display_id,
        false AS has_pending_acks
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

COMMIT;
