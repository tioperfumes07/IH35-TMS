-- FACTOR-BUT-NOT-DELIVERED (Lead, 2026-09-30)
-- Owner, verbatim: "unless we have approval from the customer, we already have this engine,
-- factor but not delivered."
--
-- views.live_loads dropped any load carrying a non-draft/proforma/void invoice unless its status was
-- already delivered-ish. That assumed ISSUED INVOICE => FINISHED, which is false for the case this
-- company actually runs and already built an engine for (dispatch.manual_delivery_authorizations,
-- 2026-09-07): a delivery confirmation sent to the factor before the truck has legally delivered.
--
-- MEASURED LIVE 2026-09-30: loads 13625 (T148) and 13626 (T156) are status 'dispatched' per
-- AlwaysTrack and carry SENT invoices, with Faro advances of $6,062.50 and $3,298.00 against them.
-- The dispatch board rendered 14 instead of the owner's 16 for exactly this reason. A truck that is
-- rolling belongs on the dispatch board whether or not its invoice has been factored.
--
-- Change: the invoice exclusion no longer fires while the load is still in a PRE-DELIVERY status.
-- The delivered-and-invoiced case is untouched and still leaves the board.
CREATE OR REPLACE VIEW views.live_loads AS
SELECT l.*,
       CASE
           WHEN l.status::text = ANY (ARRAY['delivered'::text, 'delivered_pending_docs'::text, 'completed_docs_received'::text]) THEN 'pre_settlement'::text
           ELSE 'open_dispatch'::text
       END AS live_state
  FROM mdata.loads l
 WHERE l.is_sample_data IS NOT TRUE
   AND l.soft_deleted_at IS NULL
   AND (l.status::text <> ALL (ARRAY['draft'::text, 'invoiced'::text, 'paid'::text, 'closed'::text, 'cancelled'::text, 'abandoned'::text, 'driver_walkoff'::text, 'driver_no_show'::text]))
   AND NOT (EXISTS ( SELECT 1
        FROM driver_finance.settlement_lines s
        JOIN driver_finance.driver_settlements ds ON ds.id = s.settlement_id
       WHERE s.load_id = l.id AND s.is_active IS TRUE AND ds.status = 'closed'::text))
   AND NOT (EXISTS ( SELECT 1
        FROM driver_finance.driver_bills b
        JOIN driver_finance.driver_settlements ds2 ON ds2.id = b.settled_in_settlement_id AND ds2.status = 'closed'::text
       WHERE b.load_id = l.id AND b.status <> 'void'::text))
   AND (
        -- delivered-ish: pre-settlement, exempt from the invoice test as before
        (l.status::text = ANY (ARRAY['delivered'::text, 'delivered_pending_docs'::text, 'completed_docs_received'::text]))
        -- FACTOR-BUT-NOT-DELIVERED: still rolling, stays on the board even if invoiced/factored
        OR (l.status::text = ANY (ARRAY['dispatched'::text, 'at_pickup'::text, 'in_transit'::text, 'at_delivery'::text]))
        OR NOT (EXISTS ( SELECT 1
             FROM accounting.invoices i
            WHERE i.source_load_id = l.id
              AND (i.status <> ALL (ARRAY['draft'::text, 'proforma'::text, 'void'::text]))))
   );
