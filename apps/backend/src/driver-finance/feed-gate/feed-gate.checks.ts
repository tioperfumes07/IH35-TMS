/**
 * FEED GATE — check catalog (Lead, 2026-10-01). Owner law: every feed is verified for full linkage, connectivity,
 * wiring to the correct tables/accounts, and date stamps before it is accepted; a settlement is complete —
 * loads, revenue, costs, fuel, deductions, reimbursements, driver bill, payment — before the next opens.
 *
 * Every check is ONE SQL statement that returns one row per subject it inspected:
 *   subject_table, subject_id, subject_label, ok (bool), missing (text, what is wrong), fix_link (route), measured (jsonb)
 * $1 = operating_company_id, $2 = the fed subject id (settlement id or load id). A check that inspects nothing
 * (no rows) is recorded once as 'na'. Checks never write. They read canonical tables only (driver_finance.*,
 * mdata.*, accounting.*, fuel.*) — never payroll.* / settlement.* / bank.*.
 */
export type FeedCheckDef = { key: string; group: string; sql: string };

// Loads attached to a settlement: through settlement_lines.load_id or driver_bills.settled_in_settlement_id.
const SETTLEMENT_LOADS = `
  SELECT DISTINCT l.id, l.load_number
    FROM mdata.loads l
   WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
     AND (l.id IN (SELECT sl.load_id FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = $2::uuid AND sl.is_active AND sl.voided_at IS NULL AND sl.load_id IS NOT NULL)
       OR l.id IN (SELECT db.load_id FROM driver_finance.driver_bills db WHERE db.settled_in_settlement_id = $2::uuid AND db.voided_at IS NULL))`;

const LOAD_SUBJECT = `
  SELECT l.id, l.load_number FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND l.id = $2::uuid AND l.soft_deleted_at IS NULL`;

/** Load-level checks, parameterised on the load set CTE so the same SQL serves a load feed and a settlement feed. */
function loadChecks(loadSet: string): FeedCheckDef[] {
  const L = `WITH loads AS (${loadSet})`;
  return [
    { key: "load.customer_present", group: "load", sql: `${L}
      SELECT 'mdata.loads' AS subject_table, l.id AS subject_id, 'Load ' || l.load_number AS subject_label,
             (l.customer_id IS NOT NULL AND c.id IS NOT NULL AND c.deactivated_at IS NULL) AS ok,
             CASE WHEN l.customer_id IS NULL THEN 'no customer on the load' WHEN c.id IS NULL THEN 'customer id points at no customer' WHEN c.deactivated_at IS NOT NULL THEN 'customer is deactivated' END AS missing,
             '/dispatch/loads/' || l.id::text AS fix_link, jsonb_build_object('customer', c.customer_name) AS measured
        FROM loads x JOIN mdata.loads l ON l.id = x.id LEFT JOIN mdata.customers c ON c.id = l.customer_id` },
    { key: "load.driver_unit_trailer_assigned", group: "load", sql: `${L}
      SELECT 'mdata.loads', l.id, 'Load ' || l.load_number,
             (l.assigned_primary_driver_id IS NOT NULL AND l.assigned_unit_id IS NOT NULL AND l.load_trailer_equipment_id IS NOT NULL),
             concat_ws('; ', CASE WHEN l.assigned_primary_driver_id IS NULL THEN 'no driver' END, CASE WHEN l.assigned_unit_id IS NULL THEN 'no truck' END, CASE WHEN l.load_trailer_equipment_id IS NULL THEN 'no trailer' END),
             '/dispatch/loads/' || l.id::text, jsonb_build_object('driver', d.first_name || ' ' || d.last_name, 'unit', u.unit_number, 'trailer', l.load_trailer_equipment_id)
        FROM loads x JOIN mdata.loads l ON l.id = x.id LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id` },
    { key: "load.trip_type_present", group: "load", sql: `${L}
      SELECT 'mdata.loads', l.id, 'Load ' || l.load_number, l.trip_type IS NOT NULL, CASE WHEN l.trip_type IS NULL THEN 'trip type (NB/SB/TR/LOCAL) not set — SET-01 link cannot run' END,
             '/dispatch/loads/' || l.id::text, jsonb_build_object('trip_type', l.trip_type) FROM loads x JOIN mdata.loads l ON l.id = x.id` },
    { key: "load.stops_geocoded", group: "load", sql: `${L}
      SELECT 'mdata.loads', l.id, 'Load ' || l.load_number, count(s.*) FILTER (WHERE s.latitude IS NULL) = 0 AND count(s.*) >= 2,
             CASE WHEN count(s.*) < 2 THEN 'fewer than 2 stops' WHEN count(s.*) FILTER (WHERE s.latitude IS NULL) > 0 THEN count(s.*) FILTER (WHERE s.latitude IS NULL) || ' stop(s) without coordinates' END,
             '/dispatch/loads/' || l.id::text, jsonb_build_object('stops', count(s.*), 'ungeocoded', count(s.*) FILTER (WHERE s.latitude IS NULL))
        FROM loads x JOIN mdata.loads l ON l.id = x.id LEFT JOIN mdata.load_stops s ON s.load_id = l.id AND s.soft_deleted_at IS NULL GROUP BY l.id, l.load_number` },
    { key: "load.stops_stamped", group: "stamps", sql: `${L}
      SELECT 'mdata.loads', l.id, 'Load ' || l.load_number,
             CASE WHEN l.status::text IN ('delivered','delivered_pending_docs','completed_docs_received','invoiced','completed') THEN count(s.*) FILTER (WHERE s.actual_arrival_at IS NULL OR s.actual_departure_at IS NULL) = 0 ELSE NULL END,
             CASE WHEN count(s.*) FILTER (WHERE s.actual_arrival_at IS NULL OR s.actual_departure_at IS NULL) > 0 THEN count(s.*) FILTER (WHERE s.actual_arrival_at IS NULL OR s.actual_departure_at IS NULL) || ' stop(s) missing actual arrival/departure stamps' END,
             '/dispatch/loads/' || l.id::text, jsonb_build_object('status', l.status::text, 'unstamped', count(s.*) FILTER (WHERE s.actual_arrival_at IS NULL OR s.actual_departure_at IS NULL))
        FROM loads x JOIN mdata.loads l ON l.id = x.id LEFT JOIN mdata.load_stops s ON s.load_id = l.id AND s.soft_deleted_at IS NULL GROUP BY l.id, l.load_number, l.status` },
    { key: "invoice.exists_with_live_line", group: "revenue", sql: `${L}
      SELECT 'mdata.loads', l.id, 'Load ' || l.load_number,
             (i.id IS NOT NULL AND EXISTS (SELECT 1 FROM accounting.invoice_lines il WHERE il.invoice_id = i.id AND il.soft_deleted_at IS NULL AND il.account_id IS NOT NULL)),
             CASE WHEN i.id IS NULL THEN 'no live invoice for this load' WHEN NOT EXISTS (SELECT 1 FROM accounting.invoice_lines il WHERE il.invoice_id = i.id AND il.soft_deleted_at IS NULL) THEN 'invoice ' || i.display_id || ' has no line' WHEN NOT EXISTS (SELECT 1 FROM accounting.invoice_lines il WHERE il.invoice_id = i.id AND il.soft_deleted_at IS NULL AND il.account_id IS NOT NULL) THEN 'invoice ' || i.display_id || ' line has no income account' END,
             CASE WHEN i.id IS NULL THEN '/dispatch/loads/' || l.id::text ELSE '/accounting/invoices/' || i.id::text END, jsonb_build_object('invoice', i.display_id, 'status', i.status, 'total_cents', i.total_cents)
        FROM loads x JOIN mdata.loads l ON l.id = x.id LEFT JOIN LATERAL (SELECT * FROM accounting.invoices v WHERE v.source_load_id = l.id AND v.voided_at IS NULL ORDER BY v.created_at DESC LIMIT 1) i ON true` },
    { key: "invoice.rate_equals_invoice", group: "revenue", sql: `${L}
      SELECT 'accounting.invoices', i.id, 'Invoice ' || i.display_id, i.total_cents = l.rate_total_cents,
             CASE WHEN i.total_cents <> l.rate_total_cents THEN 'invoice total ' || i.total_cents || 'c ≠ load rate ' || l.rate_total_cents || 'c' END,
             '/accounting/invoices/' || i.id::text, jsonb_build_object('invoice_cents', i.total_cents, 'load_rate_cents', l.rate_total_cents)
        FROM loads x JOIN mdata.loads l ON l.id = x.id JOIN accounting.invoices i ON i.source_load_id = l.id AND i.voided_at IS NULL` },
    { key: "invoice.ar_je_posted", group: "controls", sql: `${L}
      SELECT 'accounting.invoices', i.id, 'Invoice ' || i.display_id,
             CASE WHEN i.status IN ('sent','partial','paid','overdue') THEN EXISTS (SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id = i.id::text AND je.status = 'posted') ELSE NULL END,
             CASE WHEN i.status IN ('sent','partial','paid','overdue') AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id = i.id::text AND je.status = 'posted') THEN 'invoice is ' || i.status || ' but no posted A/R journal entry exists' END,
             '/accounting/invoices/' || i.id::text, jsonb_build_object('status', i.status, 'sent_at', i.sent_at)
        FROM loads x JOIN mdata.loads l ON l.id = x.id JOIN accounting.invoices i ON i.source_load_id = l.id AND i.voided_at IS NULL` },
    { key: "invoice.sent_stamped", group: "stamps", sql: `${L}
      SELECT 'accounting.invoices', i.id, 'Invoice ' || i.display_id, CASE WHEN i.status IN ('sent','partial','paid','overdue') THEN (i.sent_at IS NOT NULL AND i.issue_date IS NOT NULL AND i.due_date IS NOT NULL) ELSE NULL END,
             concat_ws('; ', CASE WHEN i.status IN ('sent','partial','paid','overdue') AND i.sent_at IS NULL THEN 'sent_at not stamped' END, CASE WHEN i.issue_date IS NULL THEN 'no issue date' END, CASE WHEN i.due_date IS NULL THEN 'no due date' END),
             '/accounting/invoices/' || i.id::text, jsonb_build_object('issue_date', i.issue_date, 'due_date', i.due_date, 'sent_at', i.sent_at)
        FROM loads x JOIN mdata.loads l ON l.id = x.id JOIN accounting.invoices i ON i.source_load_id = l.id AND i.voided_at IS NULL` },
    { key: "invoice.factoring_linked", group: "linkage", sql: `${L}
      SELECT 'accounting.invoices', i.id, 'Invoice ' || i.display_id,
             CASE WHEN i.factoring_status = 'advanced' THEN (fa.id IS NOT NULL AND fa.voided_at IS NULL AND fa.source_load_id = l.id) WHEN i.factoring_status IN ('not_factored') OR i.factoring_status IS NULL THEN NULL ELSE NULL END,
             CASE WHEN i.factoring_status = 'advanced' AND fa.id IS NULL THEN 'invoice says advanced but no factoring advance is linked' WHEN i.factoring_status = 'advanced' AND fa.source_load_id IS DISTINCT FROM l.id THEN 'linked advance points at a different load' END,
             '/factoring', jsonb_build_object('factoring_status', i.factoring_status, 'advance', fa.display_id, 'faro_purchase_date', fa.faro_purchase_date)
        FROM loads x JOIN mdata.loads l ON l.id = x.id JOIN accounting.invoices i ON i.source_load_id = l.id AND i.voided_at IS NULL LEFT JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id` },
    { key: "driver_bill.exists_not_void", group: "driver_pay", sql: `${L}
      SELECT 'mdata.loads', l.id, 'Load ' || l.load_number, db.id IS NOT NULL,
             CASE WHEN db.id IS NULL THEN 'no live driver bill for this load' END,
             '/driver-finance/driver-bills', jsonb_build_object('bill', db.bill_number, 'gross_cents', db.gross_amount_cents, 'miles_basis', db.miles_basis_type)
        FROM loads x JOIN mdata.loads l ON l.id = x.id LEFT JOIN LATERAL (SELECT * FROM driver_finance.driver_bills b WHERE b.load_id = l.id AND b.voided_at IS NULL ORDER BY b.created_at DESC LIMIT 1) db ON true` },
    { key: "costs.expenses_linked_and_posted", group: "costs", sql: `${L}
      SELECT 'accounting.expenses', e.id, 'Expense ' || coalesce(e.expense_number, left(e.id::text, 8)),
             (e.vendor_uuid IS NOT NULL AND e.payment_account_uuid IS NOT NULL AND e.posting_status = 'posted' AND e.journal_entry_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM accounting.expense_lines el WHERE el.expense_id = e.id AND el.expense_account_uuid IS NOT NULL)),
             concat_ws('; ', CASE WHEN e.vendor_uuid IS NULL THEN 'no vendor/payee' END, CASE WHEN e.payment_account_uuid IS NULL THEN 'no paid-from account' END,
                             CASE WHEN NOT EXISTS (SELECT 1 FROM accounting.expense_lines el WHERE el.expense_id = e.id AND el.expense_account_uuid IS NOT NULL) THEN 'no category line' END,
                             CASE WHEN e.posting_status <> 'posted' OR e.journal_entry_id IS NULL THEN 'not posted (' || e.posting_status || ')' END),
             '/accounting/expenses/' || e.id::text, jsonb_build_object('date', e.transaction_date, 'amount_cents', e.total_amount_cents, 'posting_status', e.posting_status)
        FROM loads x JOIN accounting.expenses e ON e.load_id = x.id AND e.voided_at IS NULL` },
    { key: "fuel.matched_to_load_unit_driver", group: "fuel", sql: `${L}
      SELECT 'fuel.fuel_transactions', f.id, 'Fuel ' || to_char(f.transaction_at, 'YYYY-MM-DD') || ' $' || round(coalesce(f.total_cost, 0), 2),
             (f.unit_id IS NOT NULL AND f.driver_id IS NOT NULL),
             concat_ws('; ', CASE WHEN f.unit_id IS NULL THEN 'no truck' END, CASE WHEN f.driver_id IS NULL THEN 'no driver' END),
             '/fuel/transactions/' || f.id::text, jsonb_build_object('transaction_at', f.transaction_at, 'load_required', f.load_required)
        FROM loads x JOIN fuel.fuel_transactions f ON f.load_id = x.id AND f.voided_at IS NULL` },
  ];
}

const SETTLEMENT_CHECKS: FeedCheckDef[] = [
  { key: "settlement.header_complete", group: "driver_pay", sql: `
      SELECT 'driver_finance.driver_settlements' AS subject_table, s.id AS subject_id, 'Settlement ' || s.display_id AS subject_label,
             (s.driver_id IS NOT NULL AND s.period_start IS NOT NULL AND s.period_end IS NOT NULL AND s.settlement_model IS NOT NULL AND s.pay_method IS NOT NULL) AS ok,
             concat_ws('; ', CASE WHEN s.driver_id IS NULL THEN 'no driver' END, CASE WHEN s.period_start IS NULL OR s.period_end IS NULL THEN 'period not stamped' END,
                             CASE WHEN s.settlement_model IS NULL THEN 'settlement_model NULL' END, CASE WHEN s.pay_method IS NULL THEN 'pay_method NULL' END) AS missing,
             '/driver-finance/settlements/' || s.id::text AS fix_link,
             jsonb_build_object('driver', d.first_name || ' ' || d.last_name, 'period', s.period_start || ' → ' || s.period_end, 'model', s.settlement_model, 'pay_method', s.pay_method) AS measured
        FROM driver_finance.driver_settlements s LEFT JOIN mdata.drivers d ON d.id = s.driver_id WHERE s.operating_company_id = $1::uuid AND s.id = $2::uuid` },
  { key: "settlement.has_loads", group: "driver_pay", sql: `
      WITH loads AS (${SETTLEMENT_LOADS})
      SELECT 'driver_finance.driver_settlements', s.id, 'Settlement ' || s.display_id, (SELECT count(*) FROM loads) > 0,
             CASE WHEN (SELECT count(*) FROM loads) = 0 THEN 'no load is linked to this settlement (settlement_lines.load_id / driver_bills.settled_in_settlement_id)' END,
             '/driver-finance/settlements/' || s.id::text, jsonb_build_object('loads', (SELECT count(*) FROM loads))
        FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND s.id = $2::uuid` },
  { key: "settlement.lines_carry_account_and_source", group: "linkage", sql: `
      SELECT 'driver_finance.settlement_lines', sl.id, 'Line ' || sl.line_type || ' $' || round(sl.amount, 2),
             (sl.posting_account_id IS NOT NULL AND (sl.load_id IS NOT NULL OR sl.source_driver_bill_id IS NOT NULL OR sl.source_id IS NOT NULL OR sl.auto_deduction_policy_id IS NOT NULL OR sl.line_type IN ('escrow_contribution'))),
             concat_ws('; ', CASE WHEN sl.posting_account_id IS NULL THEN 'no posting account' END,
                             CASE WHEN sl.load_id IS NULL AND sl.source_driver_bill_id IS NULL AND sl.source_id IS NULL AND sl.auto_deduction_policy_id IS NULL AND sl.line_type NOT IN ('escrow_contribution') THEN 'no source (load / driver bill / expense / policy)' END),
             '/driver-finance/settlements/' || sl.settlement_id::text, jsonb_build_object('line_type', sl.line_type, 'amount', sl.amount, 'category', sl.category)
        FROM driver_finance.settlement_lines sl WHERE sl.operating_company_id = $1::uuid AND sl.settlement_id = $2::uuid AND sl.is_active AND sl.voided_at IS NULL` },
  { key: "settlement.deductions_sourced", group: "costs", sql: `
      SELECT 'driver_finance.driver_settlement_deductions', dd.id, 'Deduction ' || dd.deduction_type || ' ' || dd.amount_cents || 'c',
             (dd.source_expense_id IS NOT NULL OR dd.source_fuel_transaction_id IS NOT NULL OR dd.source_bank_transaction_id IS NOT NULL OR dd.bucket_id IS NOT NULL OR dd.source_auto_deduction_policy_id IS NOT NULL OR dd.load_id IS NOT NULL),
             CASE WHEN dd.source_expense_id IS NULL AND dd.source_fuel_transaction_id IS NULL AND dd.source_bank_transaction_id IS NULL AND dd.bucket_id IS NULL AND dd.source_auto_deduction_policy_id IS NULL AND dd.load_id IS NULL THEN 'deduction has no source document (expense / fuel / bank line / bucket / policy / load)' END,
             '/driver-finance/settlements/' || dd.applied_to_settlement_id::text, jsonb_build_object('type', dd.deduction_type, 'amount_cents', dd.amount_cents, 'reason', dd.reason)
        FROM driver_finance.driver_settlement_deductions dd WHERE dd.operating_company_id = $1::uuid AND dd.applied_to_settlement_id = $2::uuid AND dd.voided_at IS NULL` },
  { key: "settlement.gross_equals_driver_bills", group: "driver_pay", sql: `
      SELECT 'driver_finance.driver_settlements', s.id, 'Settlement ' || s.display_id,
             round(s.gross_pay * 100)::bigint = coalesce((SELECT sum(b.gross_amount_cents) FROM driver_finance.driver_bills b WHERE b.settled_in_settlement_id = s.id AND b.voided_at IS NULL), 0),
             CASE WHEN round(s.gross_pay * 100)::bigint <> coalesce((SELECT sum(b.gross_amount_cents) FROM driver_finance.driver_bills b WHERE b.settled_in_settlement_id = s.id AND b.voided_at IS NULL), 0)
                  THEN 'gross_pay ' || round(s.gross_pay * 100)::bigint || 'c ≠ Σ driver bills ' || coalesce((SELECT sum(b.gross_amount_cents) FROM driver_finance.driver_bills b WHERE b.settled_in_settlement_id = s.id AND b.voided_at IS NULL), 0) || 'c' END,
             '/driver-finance/settlements/' || s.id::text, jsonb_build_object('gross_pay', s.gross_pay, 'bills_cents', (SELECT sum(b.gross_amount_cents) FROM driver_finance.driver_bills b WHERE b.settled_in_settlement_id = s.id AND b.voided_at IS NULL))
        FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND s.id = $2::uuid` },
  { key: "settlement.net_math", group: "driver_pay", sql: `
      SELECT 'driver_finance.driver_settlements', s.id, 'Settlement ' || s.display_id,
             round(s.net_pay * 100) = round((coalesce(s.gross_pay, 0) - coalesce(s.deductions_total, 0) + coalesce(s.reimbursements_total, 0)) * 100),
             CASE WHEN round(s.net_pay * 100) <> round((coalesce(s.gross_pay, 0) - coalesce(s.deductions_total, 0) + coalesce(s.reimbursements_total, 0)) * 100) THEN 'net ' || s.net_pay || ' ≠ gross ' || s.gross_pay || ' − deductions ' || s.deductions_total || ' + reimbursements ' || s.reimbursements_total END,
             '/driver-finance/settlements/' || s.id::text, jsonb_build_object('gross', s.gross_pay, 'deductions', s.deductions_total, 'reimbursements', s.reimbursements_total, 'net', s.net_pay)
        FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND s.id = $2::uuid` },
  { key: "settlement.posted_to_ledger", group: "controls", sql: `
      SELECT 'driver_finance.driver_settlements', s.id, 'Settlement ' || s.display_id,
             CASE WHEN s.status = 'closed' THEN (s.posted_at IS NOT NULL AND s.accounting_bill_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid WHERE p.source_transaction_type = 'driver_settlement' AND p.source_transaction_id = s.id::text AND je.status = 'posted')) ELSE NULL END,
             CASE WHEN s.status = 'closed' AND (s.posted_at IS NULL OR s.accounting_bill_id IS NULL) THEN 'closed settlement has no posted_at / accounting bill'
                  WHEN s.status = 'closed' AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid WHERE p.source_transaction_type = 'driver_settlement' AND p.source_transaction_id = s.id::text AND je.status = 'posted') THEN 'no posted driver_settlement journal entry' END,
             '/driver-finance/settlements/' || s.id::text, jsonb_build_object('status', s.status, 'posted_at', s.posted_at, 'accounting_bill_id', s.accounting_bill_id)
        FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND s.id = $2::uuid` },
  { key: "settlement.payment_linked_to_bank", group: "controls", sql: `
      SELECT 'driver_finance.driver_settlements', s.id, 'Settlement ' || s.display_id,
             CASE WHEN s.paid_at IS NOT NULL THEN (s.paid_via_bank_txn_id IS NOT NULL AND s.accounting_bill_payment_id IS NOT NULL) ELSE NULL END,
             CASE WHEN s.paid_at IS NOT NULL AND s.paid_via_bank_txn_id IS NULL THEN 'paid but no bank line linked' WHEN s.paid_at IS NOT NULL AND s.accounting_bill_payment_id IS NULL THEN 'paid but no bill payment document' END,
             '/driver-finance/settlements/' || s.id::text, jsonb_build_object('paid_at', s.paid_at, 'bank_txn', s.paid_via_bank_txn_id, 'bill_payment', s.accounting_bill_payment_id)
        FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND s.id = $2::uuid` },
  { key: "settlement.dates_stamped", group: "stamps", sql: `
      SELECT 'driver_finance.driver_settlements', s.id, 'Settlement ' || s.display_id,
             (s.period_start IS NOT NULL AND s.period_end IS NOT NULL AND s.period_end >= s.period_start AND (s.status <> 'closed' OR s.locked_at IS NOT NULL OR s.finalized_at IS NOT NULL OR s.posted_at IS NOT NULL)),
             concat_ws('; ', CASE WHEN s.period_start IS NULL OR s.period_end IS NULL THEN 'period dates missing' END, CASE WHEN s.period_end < s.period_start THEN 'period_end before period_start' END,
                             CASE WHEN s.status = 'closed' AND s.locked_at IS NULL AND s.finalized_at IS NULL AND s.posted_at IS NULL THEN 'closed with no locked/finalized/posted stamp' END),
             '/driver-finance/settlements/' || s.id::text, jsonb_build_object('period_start', s.period_start, 'period_end', s.period_end, 'locked_at', s.locked_at, 'finalized_at', s.finalized_at)
        FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1::uuid AND s.id = $2::uuid` },
  ...loadChecks(SETTLEMENT_LOADS),
];

const LOAD_CHECKS: FeedCheckDef[] = loadChecks(LOAD_SUBJECT);

export const FEED_CHECKS: Record<string, FeedCheckDef[]> = {
  settlement: SETTLEMENT_CHECKS,
  load: LOAD_CHECKS,
};

export const FEED_SUBJECT_TABLE: Record<string, string> = {
  settlement: "driver_finance.driver_settlements",
  load: "mdata.loads",
};
