-- 202615330700_fuel_overage_gallon_cap_per_unit.sql
-- ROUND 355 R-2 (same work package as F-3). The fuel cap is GALLONS, per unit, from the unit's own tank — not a
-- dollar figure. A $900 cap is a 150-gallon cap only at $6.00/gal; at $4.50 it lets 200 gallons through, and a
-- 120-gallon tank cannot take 150 gallons in one swipe at all — the difference is fuel that went somewhere else.
--   1. mdata.units.fuel_tank_capacity_gallons — the unit's own tank (the primary limit).
--   2. fuel.fuel_card_overage_policies.per_swipe_gallon_limit — FALLBACK only, default 150 (owner A3), used when the
--      unit has no recorded tank. per_transaction_limit_cents stays as the last fallback, for a card row with no
--      gallon quantity.
--   3. An ACTIVE policy carrying neither limit is refused (it would silently recover nothing).
--   4. fuel.fuel_card_overage_events: rule over_gallon_limit, and the inputs the amount was derived from (gallons,
--      limit, which tank the limit came from, unit price) so the review queue and the report show the arithmetic.
--   5. Non-fuel on a fuel card is personal and recovered in full EXCEPT a repair (named work order) or spend a
--      manager authorized: the reviewer records that as status exempt_authorized — the event is kept, never deleted.
--   6. WORM on both overage tables (own refusal, same purge contract as refuse_financial_row_delete) + row audit on events.
-- No GL math here. The receivable still lands on role fuel_overage_receivable (1250) at approval, never Cash Advance.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

-- 1. The unit's own tank.
ALTER TABLE mdata.units ADD COLUMN IF NOT EXISTS fuel_tank_capacity_gallons numeric;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_units_fuel_tank_capacity_gallons'
                    AND conrelid = 'mdata.units'::regclass) THEN
    ALTER TABLE mdata.units ADD CONSTRAINT chk_units_fuel_tank_capacity_gallons
      CHECK (fuel_tank_capacity_gallons IS NULL OR (fuel_tank_capacity_gallons > 0 AND fuel_tank_capacity_gallons <= 2000));
  END IF;
END $$;
COMMENT ON COLUMN mdata.units.fuel_tank_capacity_gallons IS
  'Total diesel tank capacity of this unit in gallons (all saddle tanks). The per-swipe fuel-card cap: gallons above it on one purchase are recoverable from the driver (ROUND 355 R-2).';

-- 2. Policy fallback in gallons.
ALTER TABLE fuel.fuel_card_overage_policies ADD COLUMN IF NOT EXISTS per_swipe_gallon_limit numeric DEFAULT 150;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fuel_overage_policy_gallon_limit_positive'
                    AND conrelid = 'fuel.fuel_card_overage_policies'::regclass) THEN
    ALTER TABLE fuel.fuel_card_overage_policies ADD CONSTRAINT chk_fuel_overage_policy_gallon_limit_positive
      CHECK (per_swipe_gallon_limit IS NULL OR per_swipe_gallon_limit > 0);
  END IF;
  -- 3. An active policy must carry a limit.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fuel_overage_policy_active_has_a_limit'
                    AND conrelid = 'fuel.fuel_card_overage_policies'::regclass) THEN
    ALTER TABLE fuel.fuel_card_overage_policies ADD CONSTRAINT chk_fuel_overage_policy_active_has_a_limit
      CHECK (NOT is_active OR per_swipe_gallon_limit IS NOT NULL OR per_transaction_limit_cents IS NOT NULL);
  END IF;
END $$;
COMMENT ON COLUMN fuel.fuel_card_overage_policies.per_swipe_gallon_limit IS
  'FALLBACK gallon cap per card swipe, used only when the unit has no fuel_tank_capacity_gallons (owner A3: 150). per_transaction_limit_cents is the last fallback, for rows with no gallon quantity.';

-- The policy table had no row audit; it decides money taken from a paycheck.
DO $$
BEGIN
  IF to_regproc('audit.tg_audit_row') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_fuel_card_overage_policies'
                        AND tgrelid = 'fuel.fuel_card_overage_policies'::regclass) THEN
    CREATE TRIGGER trg_audit_fuel_card_overage_policies AFTER INSERT OR UPDATE OR DELETE
      ON fuel.fuel_card_overage_policies FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
  END IF;
END $$;

-- 4. The event carries its arithmetic.
ALTER TABLE fuel.fuel_card_overage_events
  ADD COLUMN IF NOT EXISTS gallons numeric,
  ADD COLUMN IF NOT EXISTS gallon_limit numeric,
  ADD COLUMN IF NOT EXISTS gallon_limit_source text,
  ADD COLUMN IF NOT EXISTS unit_price_cents numeric,
  ADD COLUMN IF NOT EXISTS exempt_reason text,
  ADD COLUMN IF NOT EXISTS exempt_work_order_id uuid,
  ADD COLUMN IF NOT EXISTS exempt_note text,
  ADD COLUMN IF NOT EXISTS exempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS exempted_by_user_id uuid;

ALTER TABLE fuel.fuel_card_overage_events DROP CONSTRAINT IF EXISTS fuel_card_overage_events_overage_rule_check;
ALTER TABLE fuel.fuel_card_overage_events ADD CONSTRAINT fuel_card_overage_events_overage_rule_check
  CHECK (overage_rule IN ('non_fuel_purchase', 'over_gallon_limit', 'over_transaction_limit', 'confirmed_fraud'));
ALTER TABLE fuel.fuel_card_overage_events DROP CONSTRAINT IF EXISTS fuel_card_overage_events_status_check;
ALTER TABLE fuel.fuel_card_overage_events ADD CONSTRAINT fuel_card_overage_events_status_check
  CHECK (status IN ('pending_review', 'approved', 'posted', 'company_variance', 'exempt_authorized', 'voided'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fuel_overage_event_gallon_limit_source'
                    AND conrelid = 'fuel.fuel_card_overage_events'::regclass) THEN
    ALTER TABLE fuel.fuel_card_overage_events ADD CONSTRAINT chk_fuel_overage_event_gallon_limit_source
      CHECK (gallon_limit_source IS NULL OR gallon_limit_source IN ('unit_tank', 'reefer_tank', 'policy_per_swipe'));
  END IF;
  -- A gallon-rule event must show its gallons, its limit, where the limit came from and the unit price.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fuel_overage_event_gallon_rule_inputs'
                    AND conrelid = 'fuel.fuel_card_overage_events'::regclass) THEN
    ALTER TABLE fuel.fuel_card_overage_events ADD CONSTRAINT chk_fuel_overage_event_gallon_rule_inputs
      CHECK (overage_rule <> 'over_gallon_limit'
             OR (gallons IS NOT NULL AND gallon_limit IS NOT NULL AND unit_price_cents IS NOT NULL
                 AND gallon_limit_source IS NOT NULL
                 AND gallons > gallon_limit AND gallon_limit > 0 AND unit_price_cents > 0));
  -- (explicit IS NOT NULL: a CHECK over a NULL comparison is NULL, and NULL passes — rehearsal caught it)
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fuel_overage_event_exempt_reason'
                    AND conrelid = 'fuel.fuel_card_overage_events'::regclass) THEN
    ALTER TABLE fuel.fuel_card_overage_events ADD CONSTRAINT chk_fuel_overage_event_exempt_reason
      CHECK (exempt_reason IS NULL OR exempt_reason IN ('repair', 'authorized_spend'));
  END IF;
  -- Exempt only with a reason, a person and a time; a repair names its work order; never once a JE exists.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fuel_overage_event_exempt_complete'
                    AND conrelid = 'fuel.fuel_card_overage_events'::regclass) THEN
    ALTER TABLE fuel.fuel_card_overage_events ADD CONSTRAINT chk_fuel_overage_event_exempt_complete
      CHECK (status <> 'exempt_authorized'
             OR (exempt_reason IS NOT NULL AND exempted_by_user_id IS NOT NULL AND exempted_at IS NOT NULL
                 AND journal_entry_id IS NULL
                 AND (exempt_reason <> 'repair' OR exempt_work_order_id IS NOT NULL)));
  END IF;
  -- Same-entity work order (uq_work_orders_company_id is (operating_company_id, id)).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fuel_overage_event_exempt_work_order'
                    AND conrelid = 'fuel.fuel_card_overage_events'::regclass) THEN
    ALTER TABLE fuel.fuel_card_overage_events ADD CONSTRAINT fk_fuel_overage_event_exempt_work_order
      FOREIGN KEY (operating_company_id, exempt_work_order_id) REFERENCES maintenance.work_orders (operating_company_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fuel_overage_event_exempted_by'
                    AND conrelid = 'fuel.fuel_card_overage_events'::regclass) THEN
    ALTER TABLE fuel.fuel_card_overage_events ADD CONSTRAINT fk_fuel_overage_event_exempted_by
      FOREIGN KEY (exempted_by_user_id) REFERENCES identity.users (id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_fuel_overage_event_exempt_work_order
  ON fuel.fuel_card_overage_events (exempt_work_order_id) WHERE exempt_work_order_id IS NOT NULL;

-- 6. WORM (ROUND 352 point 5). Neither overage table had a delete refusal; the events table had no row audit.
--    Own function rather than an arm in accounting.refuse_financial_row_delete (CC-1's), with the SAME purge contract:
--    a DELETE needs an open owner AUTH (app.purge_auth_id = AUTH-<n>) AND a row the purge may take —
--      listed for that AUTH in _system.purge_authorized_rows, or
--      an event that is voided / belongs to a voided or already-deleted card row, and whose receivable entry is gone
--        (the GL goes first; a posted receivable is reversed, never deleted out from under its journal entry), or
--      a policy that is voided / inactive.
--    Everything else is refused for every role, naming the row.
CREATE OR REPLACE FUNCTION fuel.refuse_overage_row_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
  v_table text := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  v_row jsonb := to_jsonb(OLD);
BEGIN
  IF v_auth ~ '^AUTH-[0-9]+$' THEN
    IF to_regclass('_system.purge_authorized_rows') IS NOT NULL AND EXISTS (
         SELECT 1 FROM _system.purge_authorized_rows r
          WHERE r.auth_id = v_auth AND r.table_name = v_table AND r.row_pk = v_row ->> 'id') THEN
      RETURN OLD;
    END IF;
    IF v_table = 'fuel.fuel_card_overage_events' THEN
      IF (v_row ->> 'journal_entry_id') IS NOT NULL
         AND EXISTS (SELECT 1 FROM accounting.journal_entries j WHERE j.id = (v_row ->> 'journal_entry_id')::uuid) THEN
        RAISE EXCEPTION 'fuel.fuel_card_overage_events row % still has its receivable entry % — reverse or purge the GL first',
          v_row ->> 'id', v_row ->> 'journal_entry_id' USING ERRCODE = 'restrict_violation';
      END IF;
      IF (v_row ->> 'voided_at') IS NOT NULL OR (v_row ->> 'status') = 'voided'
         OR NOT EXISTS (SELECT 1 FROM fuel.fuel_transactions ft WHERE ft.id = (v_row ->> 'fuel_transaction_id')::uuid AND ft.voided_at IS NULL) THEN
        RETURN OLD;
      END IF;
    ELSIF v_table = 'fuel.fuel_card_overage_policies' THEN
      IF (v_row ->> 'voided_at') IS NOT NULL OR (v_row ->> 'is_active') = 'false' THEN
        RETURN OLD;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION '% is WORM: row % cannot be deleted — void it instead, or purge it under an open owner AUTH once its card row is voided',
    v_table, COALESCE(v_row ->> 'id', '?') USING ERRCODE = 'restrict_violation';
END
$fn$;

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON fuel.fuel_card_overage_events;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON fuel.fuel_card_overage_events
  FOR EACH ROW EXECUTE FUNCTION fuel.refuse_overage_row_delete();
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON fuel.fuel_card_overage_policies;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON fuel.fuel_card_overage_policies
  FOR EACH ROW EXECUTE FUNCTION fuel.refuse_overage_row_delete();
DO $$
BEGIN
  IF to_regproc('audit.tg_audit_row') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_fuel_card_overage_events'
                        AND tgrelid = 'fuel.fuel_card_overage_events'::regclass) THEN
    CREATE TRIGGER trg_audit_fuel_card_overage_events AFTER INSERT OR UPDATE OR DELETE
      ON fuel.fuel_card_overage_events FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
  END IF;
END $$;

-- Post-conditions.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'mdata' AND table_name = 'units' AND column_name = 'fuel_tank_capacity_gallons') THEN
    RAISE EXCEPTION '202615330700: mdata.units.fuel_tank_capacity_gallons missing';
  END IF;
  IF EXISTS (SELECT 1 FROM fuel.fuel_card_overage_policies
              WHERE is_active AND per_swipe_gallon_limit IS NULL AND per_transaction_limit_cents IS NULL) THEN
    RAISE EXCEPTION '202615330700: an active fuel-card policy carries no limit';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_worm_refuse_delete'
        AND tgrelid IN ('fuel.fuel_card_overage_events'::regclass, 'fuel.fuel_card_overage_policies'::regclass)) <> 2 THEN
    RAISE EXCEPTION '202615330700: WORM trigger missing on a fuel-card overage table';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fuel_overage_policy_active_has_a_limit') THEN
    RAISE EXCEPTION '202615330700: chk_fuel_overage_policy_active_has_a_limit missing';
  END IF;
END $$;

COMMIT;
