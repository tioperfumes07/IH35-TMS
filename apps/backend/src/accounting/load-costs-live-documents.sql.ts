import { liveExpense, liveBill, liveDriverBill, liveBillLine } from "./live-document-predicates.sql.js";
/** R443.139 #8(a): read documents immediately, independently of posting/settlement timing.
 * Internal SQL expressions only; callers bind the company. Never joins the QBO archive.
 */
export function loadCostsRevenueJoin(load = "l", alias = "revenue"): string {
  return `LEFT JOIN LATERAL (
    SELECT CASE WHEN issued.document_count > 0 THEN issued.cents
                ELSE booked.cents END AS revenue_cents,
           CASE WHEN issued.document_count > 0 THEN 'invoice' ELSE 'proforma' END AS revenue_source,
           issued.document_count > 0 AS is_invoiced
      FROM (SELECT COUNT(*) AS document_count, COALESCE(SUM(i.total_cents-i.tax_cents),0)::bigint AS cents
              FROM accounting.invoices i
             WHERE i.source_load_id = ${load}.id
               AND i.operating_company_id = ${load}.operating_company_id
               AND i.voided_at IS NULL AND i.status NOT IN ('draft','proforma','void','voided')) issued
      CROSS JOIN (SELECT COALESCE(SUM(cl.amount_cents),0)::bigint AS cents
                    FROM dispatch.load_charge_lines cl
                   WHERE cl.load_id = ${load}.id
                     AND cl.operating_company_id = ${load}.operating_company_id
                     AND cl.is_active IS NOT FALSE) booked
  ) ${alias} ON true`;
}

/** Lines own attribution; header fallback is only for a line with no explicit load.
 * A header with lines is NEVER counted a second time. Header-only legacy documents remain visible.
 * Accrued driver-pay AP bills are the same obligation as their driver bill, not another cost.
 */
export const LOAD_COST_DOCUMENTS_CTE = `cost_documents AS (
  SELECT COALESCE(el.load_id,e.load_id) AS load_id, e.id AS document_id, 'expense'::text AS kind,
         el.amount_cents::bigint AS amount_cents, el.line_category, e.linked_work_order_uuid,
         false AS unpaid
    FROM accounting.expenses e
    JOIN accounting.expense_lines el ON el.expense_id=e.id AND el.operating_company_id=e.operating_company_id
   WHERE e.operating_company_id=$1::uuid AND ${liveExpense("e")}
  UNION ALL
  SELECT e.load_id,e.id,'expense',e.total_amount_cents::bigint,NULL,e.linked_work_order_uuid,false
    FROM accounting.expenses e
   WHERE e.operating_company_id=$1::uuid AND ${liveExpense("e")}
     AND NOT EXISTS (SELECT 1 FROM accounting.expense_lines el WHERE el.expense_id=e.id)
  UNION ALL
  SELECT COALESCE(bl.load_id,b.load_id),b.id,'bill',ROUND(bl.amount*100)::bigint,bl.line_category,
         b.linked_work_order_uuid,b.status IN ('open','unpaid','partial','partially_paid')
    FROM accounting.bills b
    JOIN accounting.bill_lines bl ON bl.bill_id=b.id
   WHERE b.operating_company_id=$1::uuid AND ${liveBill("b")} AND ${liveBillLine("bl")}
     AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_bills db
                      WHERE db.operating_company_id=b.operating_company_id
                        AND ${liveDriverBill("db")}
                        AND b.id IN (db.accrued_bill_id,db.accrued_team_bill_id))
  UNION ALL
  SELECT b.load_id,b.id,'bill',b.amount_cents::bigint,NULL,b.linked_work_order_uuid,
         b.status IN ('open','unpaid','partial','partially_paid')
    FROM accounting.bills b
   WHERE b.operating_company_id=$1::uuid AND ${liveBill("b")}
     AND NOT EXISTS (SELECT 1 FROM accounting.bill_lines bl WHERE bl.bill_id=b.id)
     AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_bills db
                      WHERE db.operating_company_id=b.operating_company_id
                        AND ${liveDriverBill("db")}
                        AND b.id IN (db.accrued_bill_id,db.accrued_team_bill_id))
)`;
