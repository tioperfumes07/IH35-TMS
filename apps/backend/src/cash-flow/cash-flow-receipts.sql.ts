import { issuedInvoice, liveInvoice } from "../accounting/live-document-predicates.sql.js";
import { loadCostsRevenueJoin } from "../accounting/load-costs-live-documents.sql.js";
import { loadServiceMembershipSql } from "../dispatch/load-service.js";
import { FACTORING_PATH_LOAD_MDATA_STATUSES } from "../dispatch/delivery-evidence-status.js";
import { LATE_LOAD_KEEP_INVOICE_DUE_SQL, lateLoadInvoiceDueDateSql, projectedCashDateSql, rawDeliveryDateSql } from "./projected-cash-date.js";

const lastDelivery = `LEFT JOIN LATERAL (
  SELECT scheduled_arrival_at FROM mdata.load_stops
   WHERE load_id = l.id AND stop_type = 'delivery' AND soft_deleted_at IS NULL
   ORDER BY sequence_number DESC LIMIT 1
) fd ON true`;

/** One receipt stream, bound to $1 company. Only unbilled forecasts require live-load
 * membership: closing driver pay never extinguishes an unpaid customer document.
 * Invoice rows can have null load identity (standalone receivables remain payable).
 */
export function cashFlowReceiptsSql(cashFollowsEta: boolean): string {
  const forecastDate = cashFollowsEta
    ? projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })
    : rawDeliveryDateSql("fd.scheduled_arrival_at");
  const confirmedStatuses = ["delivered", ...FACTORING_PATH_LOAD_MDATA_STATUSES].map(s => `'${s}'`).join(",");
  const issuedForLoad = `EXISTS (SELECT 1 FROM accounting.invoices issued
    WHERE issued.source_load_id = l.id AND issued.operating_company_id = l.operating_company_id
      AND ${issuedInvoice("issued")})`;
  return `WITH unbilled_receipts AS (
    SELECT l.id::text AS id, NULL::text AS invoice_id, l.load_number, l.customer_id::text AS customer_id,
           COALESCE(c.customer_name, 'Unknown') AS customer_name,
           fd.scheduled_arrival_at::text AS delivery_time,
           COALESCE(revenue.revenue_cents, 0)::bigint AS amount_cents, l.status::text AS status,
           CASE WHEN l.status::text IN (${confirmedStatuses}) THEN 'Confirmed' ELSE 'Predicted' END::text AS basis,
           ${forecastDate} AS bucket_date
      FROM mdata.loads l
      ${loadCostsRevenueJoin("l")}
      LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = l.operating_company_id
      LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id AND pt.operating_company_id = l.operating_company_id
      ${lastDelivery}
     WHERE l.operating_company_id = $1::uuid
       AND ${loadServiceMembershipSql("l", "live", "$1::uuid")}
       AND NOT ${issuedForLoad}
       AND NOT EXISTS (SELECT 1 FROM accounting.invoices pf
         WHERE pf.source_load_id = l.id AND pf.operating_company_id = l.operating_company_id
           AND pf.status = 'proforma' AND ${liveInvoice("pf")})
  ), proforma_receipts AS (
    SELECT DISTINCT ON (l.id) l.id::text AS id, i.id::text AS invoice_id, l.load_number, i.customer_id::text AS customer_id,
           COALESCE(c.customer_name, 'Unknown') AS customer_name,
           fd.scheduled_arrival_at::text AS delivery_time,
           GREATEST(COALESCE(revenue.revenue_cents, 0) - COALESCE(i.amount_paid_cents, 0)
             - COALESCE(i.broker_advance_applied_cents, 0), 0)::bigint AS amount_cents,
           l.status::text AS status, 'Proforma'::text AS basis, ${forecastDate} AS bucket_date
      FROM accounting.invoices i
      JOIN mdata.loads l ON l.id = i.source_load_id AND l.operating_company_id = i.operating_company_id
      ${loadCostsRevenueJoin("l")}
      LEFT JOIN mdata.customers c ON c.id = i.customer_id AND c.operating_company_id = i.operating_company_id
      LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id AND pt.operating_company_id = i.operating_company_id
      ${lastDelivery}
     WHERE i.operating_company_id = $1::uuid AND i.status = 'proforma' AND ${liveInvoice("i")}
       AND NOT ${issuedForLoad}
     ORDER BY l.id, i.created_at DESC NULLS LAST, i.id DESC
  ), invoice_receipts AS (
    SELECT l.id::text AS id, i.id::text AS invoice_id, COALESCE(l.load_number,i.display_id) AS load_number, i.customer_id::text AS customer_id,
           COALESCE(c.customer_name, 'Customer') AS customer_name,
           fd.scheduled_arrival_at::text AS delivery_time,
           i.amount_open_cents::bigint AS amount_cents, l.status::text AS status,
           'Confirmed'::text AS basis,
           COALESCE(CASE WHEN l.id IS NOT NULL
             AND l.status::text NOT IN (${LATE_LOAD_KEEP_INVOICE_DUE_SQL})
             AND fd.scheduled_arrival_at IS NOT NULL
             THEN ${lateLoadInvoiceDueDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })}
             ELSE i.due_date END, i.due_date)::date AS bucket_date
      FROM accounting.invoices i
      LEFT JOIN mdata.loads l ON l.id = i.source_load_id AND l.operating_company_id = i.operating_company_id
      LEFT JOIN mdata.customers c ON c.id = i.customer_id AND c.operating_company_id = i.operating_company_id
      LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id AND pt.operating_company_id = i.operating_company_id
      ${lastDelivery}
     WHERE i.operating_company_id = $1::uuid AND ${liveInvoice("i")}
       AND i.status IN ('sent', 'partial') AND COALESCE(i.amount_open_cents, 0) > 0
       AND COALESCE(i.factoring_status, 'not_factored') = 'not_factored'
  )
  SELECT * FROM unbilled_receipts
  UNION ALL SELECT * FROM proforma_receipts
  UNION ALL SELECT * FROM invoice_receipts`;
}
