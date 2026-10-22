-- LEAD 443.211R (10-21 22:58Z) — ONE STATUS MACHINE. The SQL mirror of apps/backend/src/dispatch/load-state-machine.ts
-- (loadStatusMachineEdges(): forward + billing_reverse + cancel_restore edges, 88 rows, GENERATED from the TS table —
-- scripts/verify-one-load-status-machine.mjs fails when the two drift). The invoice-death trigger, the one SQL writer of
-- mdata.loads.status, now validates its revert through it: invoiced -> the status before invoicing ONLY when that is a billing_reverse
-- edge of the machine, else 'delivered' (never a blind step-back to any historical status).
-- CREATE OR REPLACE only; no rows are written by this migration.
SET LOCAL lock_timeout = '60s';

CREATE OR REPLACE FUNCTION mdata.load_status_edge_allowed(p_from text, p_to text, p_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM (VALUES
    ('draft', 'booked', 'forward'),
    ('draft', 'planned', 'forward'),
    ('draft', 'unassigned', 'forward'),
    ('draft', 'cancelled', 'forward'),
    ('draft', 'assigned_not_dispatched', 'forward'),
    ('booked', 'planned', 'forward'),
    ('booked', 'unassigned', 'forward'),
    ('booked', 'assigned', 'forward'),
    ('booked', 'assigned_not_dispatched', 'forward'),
    ('booked', 'cancelled', 'forward'),
    ('planned', 'unassigned', 'forward'),
    ('planned', 'assigned', 'forward'),
    ('planned', 'assigned_not_dispatched', 'forward'),
    ('planned', 'cancelled', 'forward'),
    ('unassigned', 'booked', 'forward'),
    ('unassigned', 'planned', 'forward'),
    ('unassigned', 'assigned', 'forward'),
    ('unassigned', 'assigned_not_dispatched', 'forward'),
    ('unassigned', 'cancelled', 'forward'),
    ('assigned', 'assigned_not_dispatched', 'forward'),
    ('assigned', 'dispatched', 'forward'),
    ('assigned', 'driver_no_show', 'forward'),
    ('assigned', 'cancelled', 'forward'),
    ('assigned', 'draft', 'forward'),
    ('assigned_not_dispatched', 'dispatched', 'forward'),
    ('assigned_not_dispatched', 'driver_no_show', 'forward'),
    ('assigned_not_dispatched', 'cancelled', 'forward'),
    ('assigned_not_dispatched', 'draft', 'forward'),
    ('dispatched', 'at_pickup', 'forward'),
    ('dispatched', 'driver_no_show', 'forward'),
    ('dispatched', 'driver_walkoff', 'forward'),
    ('dispatched', 'cancelled', 'forward'),
    ('dispatched', 'assigned_not_dispatched', 'forward'),
    ('dispatched', 'in_transit', 'forward'),
    ('at_pickup', 'in_transit', 'forward'),
    ('at_pickup', 'driver_walkoff', 'forward'),
    ('at_pickup', 'cancelled', 'forward'),
    ('at_pickup', 'assigned_not_dispatched', 'forward'),
    ('at_pickup', 'driver_no_show', 'forward'),
    ('in_transit', 'at_delivery', 'forward'),
    ('in_transit', 'abandoned', 'forward'),
    ('in_transit', 'driver_walkoff', 'forward'),
    ('in_transit', 'cancelled', 'forward'),
    ('in_transit', 'dispatched', 'forward'),
    ('in_transit', 'delivered_pending_docs', 'forward'),
    ('at_delivery', 'delivered', 'forward'),
    ('at_delivery', 'delivered_pending_docs', 'forward'),
    ('at_delivery', 'cancelled', 'forward'),
    ('at_delivery', 'dispatched', 'forward'),
    ('at_delivery', 'abandoned', 'forward'),
    ('at_delivery', 'driver_walkoff', 'forward'),
    ('delivered', 'delivered_pending_docs', 'forward'),
    ('delivered', 'completed_docs_received', 'forward'),
    ('delivered', 'invoiced', 'forward'),
    ('delivered', 'cancelled', 'forward'),
    ('delivered_pending_docs', 'completed_docs_received', 'forward'),
    ('delivered_pending_docs', 'invoiced', 'forward'),
    ('delivered_pending_docs', 'cancelled', 'forward'),
    ('completed_docs_received', 'invoiced', 'forward'),
    ('completed_docs_received', 'closed', 'forward'),
    ('invoiced', 'paid', 'forward'),
    ('invoiced', 'closed', 'forward'),
    ('paid', 'closed', 'forward'),
    ('invoiced', 'delivered', 'billing_reverse'),
    ('invoiced', 'delivered_pending_docs', 'billing_reverse'),
    ('invoiced', 'completed_docs_received', 'billing_reverse'),
    ('paid', 'invoiced', 'billing_reverse'),
    ('paid', 'delivered', 'billing_reverse'),
    ('paid', 'delivered_pending_docs', 'billing_reverse'),
    ('paid', 'completed_docs_received', 'billing_reverse'),
    ('closed', 'paid', 'billing_reverse'),
    ('closed', 'invoiced', 'billing_reverse'),
    ('closed', 'delivered', 'billing_reverse'),
    ('closed', 'delivered_pending_docs', 'billing_reverse'),
    ('closed', 'completed_docs_received', 'billing_reverse'),
    ('cancelled', 'draft', 'cancel_restore'),
    ('cancelled', 'booked', 'cancel_restore'),
    ('cancelled', 'planned', 'cancel_restore'),
    ('cancelled', 'unassigned', 'cancel_restore'),
    ('cancelled', 'assigned', 'cancel_restore'),
    ('cancelled', 'assigned_not_dispatched', 'cancel_restore'),
    ('cancelled', 'dispatched', 'cancel_restore'),
    ('cancelled', 'at_pickup', 'cancel_restore'),
    ('cancelled', 'in_transit', 'cancel_restore'),
    ('cancelled', 'at_delivery', 'cancel_restore'),
    ('cancelled', 'delivered', 'cancel_restore'),
    ('cancelled', 'delivered_pending_docs', 'cancel_restore'),
    ('cancelled', 'completed_docs_received', 'cancel_restore')
    ) AS e(f, t, k)
    WHERE e.f = p_from AND e.t = p_to AND e.k = p_kind
  )
$fn$;

COMMENT ON FUNCTION mdata.load_status_edge_allowed(text, text, text) IS
  'LEAD 443.211R: the SQL mirror of the one load status machine (load-state-machine.ts loadStatusMachineEdges); verify-one-load-status-machine.mjs keeps them identical.';

CREATE OR REPLACE FUNCTION accounting.revert_load_on_invoice_death()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_old_live boolean; v_new_live boolean; v_load uuid; v_company uuid; v_inv uuid; v_target text;
BEGIN
  v_old_live := OLD.voided_at IS NULL AND OLD.status::text IN ('sent', 'partial', 'paid');
  IF TG_OP = 'DELETE' THEN
    v_new_live := false;
  ELSE
    v_new_live := NEW.voided_at IS NULL AND NEW.status::text IN ('sent', 'partial', 'paid') AND NEW.source_load_id IS NOT DISTINCT FROM OLD.source_load_id;
  END IF;
  IF NOT v_old_live OR v_new_live THEN
    RETURN NULL;
  END IF;
  v_company := OLD.operating_company_id;
  v_inv := OLD.id;
  FOR v_load IN
    SELECT OLD.source_load_id WHERE OLD.source_load_id IS NOT NULL
    UNION
    SELECT il.source_load_id FROM accounting.invoice_lines il WHERE il.invoice_id = OLD.id AND il.source_load_id IS NOT NULL
  LOOP
    IF NOT accounting.load_has_live_issued_invoice(v_load, v_company, v_inv) THEN
      -- LEAD 443.211R: the revert is a billing_reverse edge of the ONE machine, else 'delivered'.
      v_target := accounting.load_status_before_invoiced(v_load);
      IF v_target IS NULL OR NOT mdata.load_status_edge_allowed('invoiced', v_target, 'billing_reverse') THEN
        v_target := 'delivered';
      END IF;
      UPDATE mdata.loads l
         SET status = v_target::mdata.load_status_enum,
             updated_at = now()
       WHERE l.id = v_load AND l.operating_company_id = v_company AND l.status::text = 'invoiced';
    END IF;
  END LOOP;
  RETURN NULL;
END $function$;

-- LEAD 443.211R — a load's billing status FOLLOWS ITS DOCUMENTS in both directions. Forward is
-- load-billing-lifecycle.service.ts (invoice sent -> invoiced; invoice paid / factoring funded -> closed). Backward had no
-- writer: a voided customer payment (recompute_invoice_paid: paid -> sent / partial) or a reversed factoring purchase left the
-- load 'closed' / 'paid' off the board while its receivable was open again. This trigger re-derives it through the machine:
-- when the load's live invoice stops being close-worthy, a 'closed' / 'paid' load steps back to 'invoiced' — only as a
-- billing_reverse edge of mdata.load_status_edge_allowed, compare-and-set on the status it read.
CREATE OR REPLACE FUNCTION accounting.rederive_load_on_invoice_unsettled()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_old_close boolean; v_new_close boolean; v_load uuid; v_cur text;
BEGIN
  v_old_close := OLD.voided_at IS NULL AND (OLD.status::text = 'paid'
    OR COALESCE(OLD.factoring_status::text, '') IN ('advanced', 'collected', 'released'));
  v_new_close := NEW.voided_at IS NULL AND (NEW.status::text = 'paid'
    OR COALESCE(NEW.factoring_status::text, '') IN ('advanced', 'collected', 'released'));
  -- only a still-live, still-issued invoice that stopped being settled; a voided invoice is trg_invoice_death_reverts_load's
  IF NOT v_old_close OR v_new_close OR NEW.voided_at IS NOT NULL OR NEW.status::text NOT IN ('sent', 'partial') THEN
    RETURN NULL;
  END IF;
  FOR v_load IN
    SELECT NEW.source_load_id WHERE NEW.source_load_id IS NOT NULL
    UNION
    SELECT il.source_load_id FROM accounting.invoice_lines il WHERE il.invoice_id = NEW.id AND il.source_load_id IS NOT NULL
  LOOP
    SELECT l.status::text INTO v_cur FROM mdata.loads l
     WHERE l.id = v_load AND l.operating_company_id = NEW.operating_company_id FOR UPDATE;
    IF v_cur IN ('closed', 'paid') AND mdata.load_status_edge_allowed(v_cur, 'invoiced', 'billing_reverse') THEN
      UPDATE mdata.loads l
         SET status = 'invoiced'::mdata.load_status_enum,
             updated_at = now()
       WHERE l.id = v_load AND l.operating_company_id = NEW.operating_company_id AND l.status::text = v_cur;
    END IF;
  END LOOP;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_invoice_unsettled_rederives_load ON accounting.invoices;
CREATE TRIGGER trg_invoice_unsettled_rederives_load
  AFTER UPDATE OF status, factoring_status ON accounting.invoices
  FOR EACH ROW EXECUTE FUNCTION accounting.rederive_load_on_invoice_unsettled();
