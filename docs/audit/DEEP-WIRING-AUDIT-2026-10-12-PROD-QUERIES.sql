-- CODEX | 2026-10-12 10:36 AM CT | USMCA-only, READ ONLY.
-- Audited repository main: 3cad5d74d3e750005c988f531315e61a026c1c59
-- Neon tiny-field-89581227 / br-fancy-credit-akjnd07a.
-- Each batch was submitted through the Neon transaction tool. BEGIN/ROLLBACK below make the read-only contract explicit for replay.
-- Results and exact failed attempts: DEEP-WIRING-AUDIT-2026-10-12-QUERY-EVIDENCE.json.
-- Failure is NOT zero. Failed batches are preserved as comments; corrected batches follow.

-- Q001 EXECUTED
BEGIN;
-- Q001.1
SET TRANSACTION READ ONLY;
-- Q001.2
SET LOCAL app.bypass_rls = 'lucia';
-- Q001.3
SET LOCAL statement_timeout = '20s';
-- Q001.4
SELECT current_timestamp AS measured_at, current_database() AS database_name, current_user, current_setting('transaction_read_only') AS read_only, current_setting('app.bypass_rls') AS bypass_rls;
-- Q001.5
SELECT table_schema,table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE (table_schema,table_name) IN (('accounting','journal_entries'),('accounting','journal_entry_postings'),('accounting','expenses'),('accounting','expense_lines'),('accounting','bills'),('accounting','bill_lines'),('accounting','bill_payments'),('accounting','invoices'),('accounting','invoice_lines'),('accounting','payments'),('accounting','factoring_advances'),('driver_finance','driver_bills'),('driver_finance','driver_settlements'),('driver_finance','settlement_lines'),('driver_finance','driver_settlement_deductions'),('fuel','fuel_transactions'),('mdata','loads'),('lib','feature_flag_overrides'),('lib','feature_flags')) ORDER BY 1,2,ordinal_position;
ROLLBACK;

-- Q002 EXECUTED
BEGIN;
-- Q002.1
SET LOCAL app.bypass_rls = 'lucia';
-- Q002.2
SET TRANSACTION READ ONLY;
-- Q002.3
SET LOCAL statement_timeout = '20s';
-- Q002.4
SELECT 'accounting.bill_lines' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM accounting.bill_lines WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.5
SELECT 'accounting.bill_payments' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM accounting.bill_payments WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.6
SELECT 'accounting.bills' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM accounting.bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.7
SELECT 'accounting.expense_lines' table_name, count(*) total_rows, count(*) FILTER (WHERE true) nonvoid_rows FROM accounting.expense_lines WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.8
SELECT 'accounting.expenses' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM accounting.expenses WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.9
SELECT 'accounting.factoring_advances' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM accounting.factoring_advances WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.10
SELECT 'accounting.invoice_lines' table_name, count(*) total_rows, count(*) FILTER (WHERE true AND soft_deleted_at IS NULL) nonvoid_rows FROM accounting.invoice_lines WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.11
SELECT 'accounting.invoices' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM accounting.invoices WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.12
SELECT 'accounting.journal_entries' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM accounting.journal_entries WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.13
SELECT 'accounting.journal_entry_postings' table_name, count(*) total_rows, count(*) FILTER (WHERE true) nonvoid_rows FROM accounting.journal_entry_postings WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.14
SELECT 'accounting.payments' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM accounting.payments WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.15
SELECT 'driver_finance.driver_bills' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM driver_finance.driver_bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.16
SELECT 'driver_finance.driver_settlement_deductions' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM driver_finance.driver_settlement_deductions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.17
SELECT 'driver_finance.driver_settlements' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM driver_finance.driver_settlements WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.18
SELECT 'driver_finance.settlement_lines' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM driver_finance.settlement_lines WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.19
SELECT 'fuel.fuel_transactions' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL) nonvoid_rows FROM fuel.fuel_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q002.20
SELECT 'mdata.loads' table_name, count(*) total_rows, count(*) FILTER (WHERE voided_at IS NULL AND soft_deleted_at IS NULL) nonvoid_rows FROM mdata.loads WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
ROLLBACK;

-- Q003 EXECUTED
BEGIN;
-- Q003.1
SET LOCAL app.bypass_rls = 'lucia';
-- Q003.2
SET TRANSACTION READ ONLY;
-- Q003.3
SET LOCAL statement_timeout = '20s';
-- Q003.4
SELECT current_timestamp measured_at;
-- Q003.5
SELECT status::text,count(*) FROM mdata.loads WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' GROUP BY 1;
-- Q003.6
SELECT count(*) invoices, count(*) FILTER(WHERE source_load_id IS NULL) missing_load, count(*) FILTER(WHERE customer_id IS NULL) missing_customer, count(*) FILTER(WHERE total_cents=0) zero_invoices FROM accounting.invoices WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL;
-- Q003.7
SELECT count(*) invoice_customer_disagrees_with_load FROM accounting.invoices i JOIN mdata.loads l ON l.id=i.source_load_id AND l.operating_company_id=i.operating_company_id WHERE i.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND i.voided_at IS NULL AND i.customer_id IS DISTINCT FROM l.customer_id;
-- Q003.8
SELECT count(*) expenses, count(*) FILTER(WHERE load_id IS NULL) no_load, count(*) FILTER(WHERE unit_id IS NULL) no_unit,count(*) FILTER(WHERE driver_uuid IS NULL) no_driver,count(*) FILTER(WHERE trailer_id IS NULL AND non_owned_trailer_id IS NULL) no_trailer,count(*) FILTER(WHERE vendor_uuid IS NULL AND driver_uuid IS NULL AND payee_customer_uuid IS NULL) no_payee,count(*) FILTER(WHERE payment_account_uuid IS NULL) no_payment_account FROM accounting.expenses WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL;
-- Q003.9
SELECT count(*) load_linked_expenses, count(*) FILTER(WHERE e.unit_id IS DISTINCT FROM l.assigned_unit_id) unit_diff,count(*) FILTER(WHERE e.driver_uuid IS DISTINCT FROM l.assigned_primary_driver_id) driver_diff FROM accounting.expenses e JOIN mdata.loads l ON l.id=e.load_id AND l.operating_company_id=e.operating_company_id WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL;
-- Q003.10
SELECT count(*) expense_lines,count(*) FILTER(WHERE el.item_id IS NULL) no_item,count(*) FILTER(WHERE el.expense_account_uuid IS NULL) no_account,count(*) FILTER(WHERE e.load_id IS NOT NULL AND el.load_id IS DISTINCT FROM e.load_id) header_line_load_diff FROM accounting.expense_lines el JOIN accounting.expenses e ON e.id=el.expense_id AND e.operating_company_id=el.operating_company_id WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL;
-- Q003.11
SELECT count(*) driver_bills,count(*) FILTER(WHERE load_id IS NULL) no_load,count(*) FILTER(WHERE driver_id IS NULL) no_driver,count(*) FILTER(WHERE settled_in_settlement_id IS NULL) no_settlement,count(*) FILTER(WHERE gross_amount_cents=0) zero_gross FROM driver_finance.driver_bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL;
-- Q003.12
SELECT count(*) loads_without_nonvoid_driver_bill FROM mdata.loads l WHERE l.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL AND NOT EXISTS(SELECT 1 FROM driver_finance.driver_bills b WHERE b.load_id=l.id AND b.operating_company_id=l.operating_company_id AND b.voided_at IS NULL);
-- Q003.13
SELECT count(*) deductions,count(*) FILTER(WHERE load_id IS NULL) no_load,count(*) FILTER(WHERE applied_to_settlement_id IS NULL) no_settlement FROM driver_finance.driver_settlement_deductions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL;
-- Q003.14
SELECT count(*) fuel_rows,count(*) FILTER(WHERE load_id IS NULL) no_load,count(*) FILTER(WHERE unit_id IS NULL) no_unit,count(*) FILTER(WHERE driver_id IS NULL) no_driver,count(*) FILTER(WHERE vendor_id IS NULL) no_vendor FROM fuel.fuel_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND archived_at IS NULL;
-- Q003.15
SELECT count(*) bills,count(*) FILTER(WHERE vendor_id IS NULL AND vendor_uuid IS NULL AND mdata_vendor_id IS NULL) no_vendor,count(*) FILTER(WHERE load_id IS NULL) no_load,count(*) FILTER(WHERE driver_id IS NULL) no_driver,count(*) FILTER(WHERE unit_id IS NULL) no_unit,count(*) FILTER(WHERE trailer_id IS NULL AND non_owned_trailer_id IS NULL) no_trailer FROM accounting.bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND revoked_at IS NULL;
ROLLBACK;

-- Q004 FAILED; no count claimed
/*
BEGIN;
-- Q004.1
SET LOCAL app.bypass_rls = 'lucia';
-- Q004.2
SET TRANSACTION READ ONLY;
-- Q004.3
SET LOCAL statement_timeout = '20s';
-- Q004.4
SELECT current_timestamp measured_at;
-- Q004.5
SELECT count(*) headers, count(*) FILTER(WHERE n=0) zero_line_headers,count(*) FILTER(WHERE dr<>cr) unbalanced_headers,sum(dr) total_debit_cents,sum(cr) total_credit_cents FROM (SELECT j.id,count(p.id) n,coalesce(sum(p.amount_cents) FILTER(WHERE p.debit_or_credit='debit'),0) dr,coalesce(sum(p.amount_cents) FILTER(WHERE p.debit_or_credit='credit'),0) cr FROM accounting.journal_entries j LEFT JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid=j.id AND p.operating_company_id=j.operating_company_id WHERE j.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND j.status='posted' AND j.voided_at IS NULL GROUP BY j.id) x;
-- Q004.6
SELECT debit_or_credit,count(*) FROM accounting.journal_entry_postings WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' GROUP BY 1;
-- Q004.7
SELECT source_transaction_type,count(*) lines,count(*) FILTER(WHERE load_id IS NULL) no_load,count(*) FILTER(WHERE entity_uuid IS NULL) no_entity,count(*) FILTER(WHERE source_transaction_id IS NULL) no_source,count(*) FILTER(WHERE class_id IS NULL) no_class FROM accounting.journal_entry_postings WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' GROUP BY 1 ORDER BY 2 DESC;
-- Q004.8
SELECT count(*) expense_posting_lines,count(*) FILTER(WHERE p.load_id IS DISTINCT FROM e.load_id) load_mismatch FROM accounting.journal_entry_postings p JOIN accounting.expenses e ON e.id=p.source_transaction_id AND e.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND p.source_transaction_type='expense' AND e.voided_at IS NULL AND e.load_id IS NOT NULL;
-- Q004.9
SELECT count(*) invoice_posting_lines,count(*) FILTER(WHERE p.load_id IS DISTINCT FROM i.source_load_id) load_mismatch FROM accounting.journal_entry_postings p JOIN accounting.invoices i ON i.id=p.source_transaction_id AND i.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND p.source_transaction_type='invoice' AND i.voided_at IS NULL AND i.source_load_id IS NOT NULL;
-- Q004.10
SELECT count(*) invoices_with_positive_total_no_postings FROM accounting.invoices i WHERE i.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND i.voided_at IS NULL AND i.status NOT IN ('draft','proforma','void','voided') AND i.total_cents>0 AND NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings p WHERE p.operating_company_id=i.operating_company_id AND p.source_transaction_type='invoice' AND p.source_transaction_id=i.id);
-- Q004.11
SELECT count(*) posted_expenses_no_postings FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.status='posted' AND NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings p WHERE p.operating_company_id=e.operating_company_id AND p.source_transaction_type='expense' AND p.source_transaction_id=e.id);
-- Q004.12
SELECT count(*) bills_no_postings FROM accounting.bills b WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND b.voided_at IS NULL AND b.revoked_at IS NULL AND b.status NOT IN('draft','void','voided','cancelled') AND b.amount_cents>0 AND NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings p WHERE p.operating_company_id=b.operating_company_id AND p.source_transaction_type='bill' AND p.source_transaction_id=b.id);
-- Q004.13
SELECT f.flag_key,f.default_enabled,o.enabled company_override,o.user_uuid IS NOT NULL user_specific,o.expires_at FROM lib.feature_flags f LEFT JOIN lib.feature_flag_overrides o ON o.flag_key=f.flag_key AND o.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' WHERE f.flag_key ~* '(post|automatch|auto_match|driver_advance|qbo.*push|fuel|factoring)' ORDER BY f.flag_key;
ROLLBACK;
*/

-- Q005 EXECUTED
BEGIN;
-- Q005.1
SET LOCAL app.bypass_rls = 'lucia';
-- Q005.2
SET TRANSACTION READ ONLY;
-- Q005.3
SET LOCAL statement_timeout = '20s';
-- Q005.4
SELECT current_timestamp measured_at;
-- Q005.5
SELECT count(*) headers, count(*) FILTER(WHERE n=0) zero_line_headers,count(*) FILTER(WHERE dr<>cr) unbalanced_headers,sum(dr) total_debit_cents,sum(cr) total_credit_cents FROM (SELECT j.id,count(p.id) n,coalesce(sum(p.amount_cents) FILTER(WHERE p.debit_or_credit='debit'),0) dr,coalesce(sum(p.amount_cents) FILTER(WHERE p.debit_or_credit='credit'),0) cr FROM accounting.journal_entries j LEFT JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid=j.id AND p.operating_company_id=j.operating_company_id WHERE j.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND j.status='posted' AND j.voided_at IS NULL GROUP BY j.id) x;
-- Q005.6
SELECT debit_or_credit,count(*) FROM accounting.journal_entry_postings WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' GROUP BY 1;
-- Q005.7
SELECT source_transaction_type,count(*) lines,count(*) FILTER(WHERE load_id IS NULL) no_load,count(*) FILTER(WHERE entity_uuid IS NULL) no_entity,count(*) FILTER(WHERE source_transaction_id IS NULL) no_source,count(*) FILTER(WHERE class_id IS NULL) no_class FROM accounting.journal_entry_postings WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' GROUP BY 1 ORDER BY 2 DESC;
-- Q005.8
SELECT count(*) expense_posting_lines,count(*) FILTER(WHERE p.load_id IS DISTINCT FROM e.load_id) load_mismatch FROM accounting.journal_entry_postings p JOIN accounting.expenses e ON e.id::text=p.source_transaction_id AND e.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND p.source_transaction_type='expense' AND e.voided_at IS NULL AND e.load_id IS NOT NULL;
-- Q005.9
SELECT count(*) invoice_posting_lines,count(*) FILTER(WHERE p.load_id IS DISTINCT FROM i.source_load_id) load_mismatch FROM accounting.journal_entry_postings p JOIN accounting.invoices i ON i.id::text=p.source_transaction_id AND i.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND p.source_transaction_type='invoice' AND i.voided_at IS NULL AND i.source_load_id IS NOT NULL;
-- Q005.10
SELECT count(*) invoices_with_positive_total_no_postings FROM accounting.invoices i WHERE i.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND i.voided_at IS NULL AND i.status NOT IN ('draft','proforma','void','voided') AND i.total_cents>0 AND NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings p WHERE p.operating_company_id=i.operating_company_id AND p.source_transaction_type='invoice' AND p.source_transaction_id=i.id::text);
-- Q005.11
SELECT count(*) posted_expenses_no_postings FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.status='posted' AND NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings p WHERE p.operating_company_id=e.operating_company_id AND p.source_transaction_type='expense' AND p.source_transaction_id=e.id::text);
-- Q005.12
SELECT count(*) bills_no_postings FROM accounting.bills b WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND b.voided_at IS NULL AND b.revoked_at IS NULL AND b.status NOT IN('draft','void','voided','cancelled') AND b.amount_cents>0 AND NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings p WHERE p.operating_company_id=b.operating_company_id AND p.source_transaction_type='bill' AND p.source_transaction_id=b.id::text);
-- Q005.13
SELECT f.flag_key,f.default_enabled,o.enabled company_override,o.user_uuid IS NOT NULL user_specific,o.expires_at FROM lib.feature_flags f LEFT JOIN lib.feature_flag_overrides o ON o.flag_key=f.flag_key AND o.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' WHERE f.flag_key ~* '(post|automatch|auto_match|driver_advance|qbo.*push|fuel|factoring)' ORDER BY f.flag_key;
ROLLBACK;

-- Q006 EXECUTED
BEGIN;
-- Q006.1
SET LOCAL app.bypass_rls = 'lucia';
-- Q006.2
SET TRANSACTION READ ONLY;
-- Q006.3
SET LOCAL statement_timeout = '20s';
-- Q006.4
SELECT count(*) AS missing_expense_source_postings, count(*) FILTER(WHERE e.journal_entry_id IS NOT NULL) header_has_je,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM accounting.journal_entries j WHERE j.id=e.journal_entry_id AND j.operating_company_id=e.operating_company_id AND j.voided_at IS NULL AND j.status='posted')) header_live_je,count(*) FILTER(WHERE e.source_fuel_transaction_id IS NOT NULL) fuel_source FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.status='posted' AND NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings p WHERE p.operating_company_id=e.operating_company_id AND p.source_transaction_type='expense' AND p.source_transaction_id=e.id::text);
-- Q006.5
SELECT p.source_transaction_type,count(DISTINCT e.id) expenses FROM accounting.expenses e JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid=e.journal_entry_id AND p.operating_company_id=e.operating_company_id WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.status='posted' AND NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings x WHERE x.operating_company_id=e.operating_company_id AND x.source_transaction_type='expense' AND x.source_transaction_id=e.id::text) GROUP BY 1;
-- Q006.6
SELECT l.load_number, l.status::text, l.presettlement_link_id IS NOT NULL has_presettlement, EXISTS(SELECT 1 FROM driver_finance.driver_bills b WHERE b.load_id=l.id AND b.operating_company_id=l.operating_company_id) any_bill_history FROM mdata.loads l WHERE l.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL AND NOT EXISTS(SELECT 1 FROM driver_finance.driver_bills b WHERE b.load_id=l.id AND b.operating_company_id=l.operating_company_id AND b.voided_at IS NULL);
-- Q006.7
SELECT count(*) closed_settlements,count(*) FILTER(WHERE accounting_bill_id IS NULL) no_ap_bill,count(*) FILTER(WHERE accounting_bill_payment_id IS NULL) no_ap_payment FROM driver_finance.driver_settlements WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND status IN('closed','locked','paid');
-- Q006.8
SELECT count(*) lines,count(*) FILTER(WHERE el.expense_account_uuid IS DISTINCT FROM i.default_expense_account_id AND el.item_account_override_reason IS NULL) default_account_mismatch_without_override FROM accounting.expense_lines el JOIN accounting.expenses e ON e.id=el.expense_id AND e.operating_company_id=el.operating_company_id JOIN catalogs.items i ON i.id=el.item_id AND (i.operating_company_id=e.operating_company_id OR i.operating_company_id IS NULL) WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL;
-- Q006.9
SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE (table_schema,table_name) IN (('driver_finance','driver_advances'),('maintenance','road_service_tickets'),('accounting','chart_of_accounts_roles'),('banking','bank_matches'),('accounting','migration_ledger')) ORDER BY 1,2,ordinal_position;
-- Q006.10
SELECT table_schema,table_name FROM information_schema.tables WHERE table_name ~ '(migration|schema_version)' ORDER BY 1,2;
ROLLBACK;

-- Q007 EXECUTED
BEGIN;
-- Q007.1
SET LOCAL app.bypass_rls = 'lucia';
-- Q007.2
SET TRANSACTION READ ONLY;
-- Q007.3
SET LOCAL statement_timeout = '20s';
-- Q007.4
SELECT count(*) total,count(*) FILTER(WHERE a.driver_id IS DISTINCT FROM b.driver_id OR a.load_id IS DISTINCT FROM b.load_id OR b.voided_at IS NOT NULL) bill_link_mismatch FROM driver_finance.driver_advances a JOIN driver_finance.driver_bills b ON b.id=a.linked_driver_bill_id AND b.operating_company_id=a.operating_company_id WHERE a.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND a.voided_at IS NULL;
-- Q007.5
SELECT count(*) total,count(*) FILTER(WHERE a.unit_id IS DISTINCT FROM l.assigned_unit_id) unit_mismatch,count(*) FILTER(WHERE a.trailer_id IS NULL) trailer_null FROM driver_finance.driver_advances a JOIN mdata.loads l ON l.id=a.load_id AND l.operating_company_id=a.operating_company_id WHERE a.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND a.voided_at IS NULL;
-- Q007.6
SELECT disbursement_status,status,economic_routing,count(*) population,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid AND j.operating_company_id=p.operating_company_id WHERE p.operating_company_id=a.operating_company_id AND p.source_transaction_type='driver_advance' AND p.source_transaction_id=a.id::text AND j.voided_at IS NULL AND j.status='posted')) no_live_driver_advance_posting FROM driver_finance.driver_advances a WHERE a.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND a.voided_at IS NULL GROUP BY 1,2,3;
-- Q007.7
SELECT count(*) tickets,count(*) FILTER(WHERE payment_method IN('cc','driver_advance')) non_vendor_bill_payment,count(*) FILTER(WHERE payment_method IN('cc','driver_advance') AND bill_id IS NOT NULL) non_vendor_bill_with_bill FROM maintenance.road_service_tickets WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q007.8
SELECT count(*) candidate_solo_driver_bills,count(*) FILTER(WHERE b.driver_id IS DISTINCT FROM l.assigned_primary_driver_id) current_driver_mismatch FROM driver_finance.driver_bills b JOIN mdata.loads l ON l.id=b.load_id AND l.operating_company_id=b.operating_company_id WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND b.voided_at IS NULL AND b.team_driver_id IS NULL AND l.team_id IS NULL AND b.status='open';
-- Q007.9
SELECT count(*) ambiguous_account_groups,sum(n) affected_items FROM (SELECT default_expense_account_id,count(*) n FROM catalogs.items WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND deactivated_at IS NULL AND default_expense_account_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) x;
-- Q007.10
SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND (n.nspname,c.relname) IN (('driver_finance','driver_advances'),('driver_finance','driver_bills'),('accounting','bill_payments'),('accounting','journal_entry_postings')) ORDER BY 1,2,3;
-- Q007.11
SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE (table_schema,table_name) IN (('banking','bank_transactions'),('ih35_migrations','applied_migrations'),('_system','_schema_migrations')) ORDER BY 1,2,ordinal_position;
ROLLBACK;

-- Q008 EXECUTED
BEGIN;
-- Q008.1
SET LOCAL app.bypass_rls = 'lucia';
-- Q008.2
SET TRANSACTION READ ONLY;
-- Q008.3
SET LOCAL statement_timeout = '20s';
-- Q008.4
SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE (table_schema,table_name) IN (('accounting','transaction_source_links'),('driver_finance','driver_settlement_gl_bills'),('driver_finance','driver_settlement_gl_runs'),('mdata','load_stop_geofences'),('mdata','load_stops')) ORDER BY 1,2,ordinal_position;
-- Q008.5
SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,count(p.polname) policy_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_policy p ON p.polrelid=c.oid WHERE (n.nspname,c.relname) IN (('mdata','loads'),('accounting','expenses'),('accounting','expense_lines'),('accounting','bills'),('accounting','bill_payments'),('accounting','journal_entries'),('accounting','journal_entry_postings'),('driver_finance','driver_bills'),('driver_finance','driver_advances'),('fuel','fuel_transactions')) GROUP BY 1,2,3,4 ORDER BY 1,2;
-- Q008.6
SELECT count(*) posted_check_expenses,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM accounting.journal_entry_postings p WHERE p.operating_company_id=e.operating_company_id AND p.source_transaction_type='expense' AND p.source_transaction_id=e.id::text)) no_source_postings FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.payment_type='check';
-- Q008.7
SELECT count(*) money_out_je_only_candidates,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id AND a.operating_company_id=p.operating_company_id WHERE p.journal_entry_uuid=bt.matched_journal_entry_id AND p.operating_company_id=bt.operating_company_id AND p.debit_or_credit='debit' AND a.account_type ILIKE '%expense%')) expense_account_debit_candidates FROM banking.bank_transactions bt WHERE bt.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND bt.is_credit=false AND bt.matched_journal_entry_id IS NOT NULL AND bt.matched_expense_id IS NULL AND EXISTS(SELECT 1 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid=bt.matched_journal_entry_id AND p.operating_company_id=bt.operating_company_id AND p.source_transaction_type='bank_categorization') AND NOT EXISTS(SELECT 1 FROM accounting.expenses e WHERE e.operating_company_id=bt.operating_company_id AND e.source_bank_transaction_id=bt.id AND e.voided_at IS NULL);
-- Q008.8
SELECT r.role,a.account_number,a.account_name,a.account_type,a.deactivated_at IS NOT NULL inactive FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id=r.account_id AND a.operating_company_id=r.operating_company_id WHERE r.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND r.is_active AND r.role ~ '(ar_control|ap_control|driver|escrow|fuel|factoring|unbilled|revenue_default)' ORDER BY r.role;
-- Q008.9
SELECT count(*) rows FROM accounting.payments WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q008.10
SELECT count(*) rows FROM accounting.factoring_advances WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q008.11
SELECT count(*) rows FROM maintenance.road_service_tickets WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
ROLLBACK;

-- Q009 EXECUTED
BEGIN;
-- Q009.1
SET LOCAL app.bypass_rls='lucia';
-- Q009.2
SET TRANSACTION READ ONLY;
-- Q009.3
SET LOCAL statement_timeout='20s';
-- Q009.4
SELECT clock_timestamp() AS measured_at,current_setting('transaction_read_only') AS read_only;
-- Q009.5
SELECT count(*) AS active_bridge_rows,count(*) FILTER(WHERE b.id IS NULL OR b.voided_at IS NOT NULL OR b.revoked_at IS NOT NULL) AS invalid_bill,count(*) FILTER(WHERE b.load_id IS DISTINCT FROM g.load_id) AS load_mismatch,count(*) FILTER(WHERE j.id IS NULL OR j.status='voided') AS invalid_bill_je FROM driver_finance.driver_settlement_gl_bills g LEFT JOIN accounting.bills b ON b.id=g.accounting_bill_id AND b.operating_company_id=g.operating_company_id LEFT JOIN accounting.journal_entries j ON j.id=g.bill_journal_entry_id AND j.operating_company_id=g.operating_company_id WHERE g.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND g.superseded_at IS NULL;
-- Q009.6
SELECT count(*) AS closed_settlements,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM driver_finance.driver_settlement_gl_bills g WHERE g.operating_company_id=s.operating_company_id AND g.settlement_id=s.id AND g.superseded_at IS NULL)) AS without_active_ap_bridge FROM driver_finance.driver_settlements s WHERE s.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND s.voided_at IS NULL AND s.status IN ('closed','locked','paid');
-- Q009.7
WITH p AS (SELECT p.* FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND je.status <> 'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed'))) SELECT r.role,a.account_number,a.account_name,COALESCE(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS debit_minus_credit_cents,count(p.id) AS postings FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id=r.account_id AND a.operating_company_id=r.operating_company_id LEFT JOIN p ON p.account_id=r.account_id WHERE r.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND r.is_active AND r.role IN ('ar_control','ap_control') GROUP BY r.role,a.account_number,a.account_name;
-- Q009.8
SELECT status,count(*) AS invoices,sum(total_cents)::text AS total_cents,sum(amount_open_cents)::text AS open_cents,sum(amount_paid_cents)::text AS paid_cents FROM accounting.invoices WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL GROUP BY status;
-- Q009.9
SELECT status,count(*) AS bills,sum(amount_cents)::text AS total_cents,sum(paid_cents)::text AS paid_cents,sum(amount_cents-COALESCE(paid_cents,0))::text AS open_cents FROM accounting.bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND revoked_at IS NULL GROUP BY status;
-- Q009.10
SELECT count(*) AS postings,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM accounting.transaction_source_links s WHERE s.operating_company_id=p.operating_company_id AND s.journal_entry_posting_id=p.id)) AS missing_spine FROM accounting.journal_entry_postings p WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q009.11
SELECT count(*) AS reversal_lines,count(*) FILTER(WHERE o.id IS NULL) AS missing_original,count(*) FILTER(WHERE o.id IS NOT NULL AND (o.amount_cents<>p.amount_cents OR o.account_id<>p.account_id OR o.debit_or_credit=p.debit_or_credit)) AS noninverse_lines FROM accounting.journal_entry_postings p LEFT JOIN accounting.journal_entry_postings o ON o.id=p.reversal_of_line_id AND o.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND p.reversal_of_line_id IS NOT NULL;
-- Q009.12
SELECT count(*) AS legal_bills_with_matter_load,count(*) FILTER(WHERE b.load_id IS DISTINCT FROM m.load_id) AS different_bill_load FROM accounting.bills b JOIN legal.matters m ON m.id=b.legal_matter_id AND m.operating_company_id=b.operating_company_id WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND b.voided_at IS NULL AND m.load_id IS NOT NULL;
-- Q009.13
SELECT table_schema,table_name,column_name,data_type FROM information_schema.columns WHERE (table_schema,table_name) IN (('mdata','drivers'),('mdata','vendors'),('catalogs','accounts'),('expense_attribution','expense_load_links')) ORDER BY table_schema,table_name,ordinal_position;
ROLLBACK;

-- Q010 FAILED; no count claimed
/*
BEGIN;
-- Q010.1
SET LOCAL app.bypass_rls='lucia';
-- Q010.2
SET TRANSACTION READ ONLY;
-- Q010.3
SET LOCAL statement_timeout='20s';
-- Q010.4
SELECT clock_timestamp() AS measured_at;
-- Q010.5
SELECT s.display_id,s.status,s.is_presettlement,s.gross_pay,s.net_pay,count(sl.id) AS active_lines FROM driver_finance.driver_settlements s LEFT JOIN driver_finance.settlement_lines sl ON sl.settlement_id=s.id AND sl.operating_company_id=s.operating_company_id AND sl.is_active WHERE s.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND s.voided_at IS NULL AND s.status IN('closed','locked','paid') AND NOT EXISTS(SELECT 1 FROM driver_finance.driver_settlement_gl_bills g WHERE g.operating_company_id=s.operating_company_id AND g.settlement_id=s.id AND g.superseded_at IS NULL) GROUP BY s.id;
-- Q010.6
SELECT count(*) AS active_drivers,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM mdata.vendors v WHERE v.operating_company_id=d.operating_company_id AND v.driver_id=d.id AND v.deactivated_at IS NULL)) AS no_linked_active_vendor FROM mdata.drivers d WHERE d.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND d.deactivated_at IS NULL AND d.archived_at IS NULL AND d.is_sample_data IS NOT TRUE;
-- Q010.7
SELECT count(*) AS duplicate_hard_id_groups,COALESCE(sum(n-1),0) AS excess_rows FROM(SELECT cdl_state,upper(regexp_replace(cdl_number,'[^a-zA-Z0-9]','','g')),count(*) n FROM mdata.drivers WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND deactivated_at IS NULL AND archived_at IS NULL AND NULLIF(btrim(cdl_number),'') IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d;
-- Q010.8
SELECT count(*) AS fuel_rows,count(*) FILTER(WHERE f.unit_id IS DISTINCT FROM l.assigned_truck_id) AS unit_diff,count(*) FILTER(WHERE f.driver_id IS DISTINCT FROM l.assigned_primary_driver_id) AS driver_diff FROM fuel.fuel_transactions f JOIN mdata.loads l ON l.id=f.load_id AND l.operating_company_id=f.operating_company_id WHERE f.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND f.voided_at IS NULL AND f.archived_at IS NULL;
-- Q010.9
SELECT count(*) AS duplicate_provider_product_groups,COALESCE(sum(n-1),0) AS excess_rows FROM(SELECT vendor_id,regexp_replace(btrim(transaction_reference),'-1[0-9]{4}$',''),fuel_type,count(*) n FROM fuel.fuel_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND btrim(transaction_reference) ~ '^[0-9]+(-1[0-9]{4})?$' GROUP BY 1,2,3 HAVING count(*)>1) d;
-- Q010.10
SELECT count(*) AS load_expenses,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM expense_attribution.expense_load_links x WHERE x.operating_company_id=e.operating_company_id AND x.expense_id=e.id AND x.load_id=e.load_id)) AS no_attribution_link FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.load_id IS NOT NULL;
-- Q010.11
SELECT x.expense_source,count(*) AS links,count(*) FILTER(WHERE x.load_number IS DISTINCT FROM l.load_number) AS load_number_diff FROM expense_attribution.expense_load_links x JOIN mdata.loads l ON l.id=x.load_id AND l.operating_company_id=x.operating_company_id WHERE x.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' GROUP BY x.expense_source;
-- Q010.12
SELECT count(*) AS eligible_bank_lines,COALESCE(sum(abs(bt.amount_cents)),0)::text AS bank_amount_cents FROM banking.bank_transactions bt WHERE bt.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND bt.voided_at IS NULL AND bt.is_credit=false AND bt.matched_journal_entry_id IS NOT NULL AND bt.matched_expense_id IS NULL AND EXISTS(SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid AND j.operating_company_id=p.operating_company_id JOIN catalogs.accounts a ON a.id=p.account_id AND a.operating_company_id=p.operating_company_id WHERE p.journal_entry_uuid=bt.matched_journal_entry_id AND p.operating_company_id=bt.operating_company_id AND p.source_transaction_type='bank_categorization' AND j.status <> 'voided' AND j.voided_at IS NULL AND p.debit_or_credit='debit' AND a.account_type IN ('Expense','Cost of Goods Sold')) AND NOT EXISTS(SELECT 1 FROM accounting.expenses e WHERE e.operating_company_id=bt.operating_company_id AND e.source_bank_transaction_id=bt.id AND e.voided_at IS NULL);
-- Q010.13
SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname,c.relname) IN (('accounting','bills'),('accounting','expense_lines'),('accounting','expenses'),('fuel','fuel_transactions')) AND NOT t.tgisinternal ORDER BY 1,2,3;
ROLLBACK;
*/

-- Q011 EXECUTED
BEGIN;
-- Q011.1
SET LOCAL app.bypass_rls='lucia';
-- Q011.2
SET TRANSACTION READ ONLY;
-- Q011.3
SET LOCAL statement_timeout='20s';
-- Q011.4
SELECT clock_timestamp() AS measured_at;
-- Q011.5
SELECT s.display_id,s.status,s.is_presettlement,s.gross_pay,s.net_pay,count(sl.id) AS active_lines FROM driver_finance.driver_settlements s LEFT JOIN driver_finance.settlement_lines sl ON sl.settlement_id=s.id AND sl.operating_company_id=s.operating_company_id AND sl.is_active WHERE s.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND s.voided_at IS NULL AND s.status IN('closed','locked','paid') AND NOT EXISTS(SELECT 1 FROM driver_finance.driver_settlement_gl_bills g WHERE g.operating_company_id=s.operating_company_id AND g.settlement_id=s.id AND g.superseded_at IS NULL) GROUP BY s.id;
-- Q011.6
SELECT count(*) AS active_drivers,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM mdata.vendors v WHERE v.operating_company_id=d.operating_company_id AND v.driver_id=d.id AND v.deactivated_at IS NULL)) AS no_linked_active_vendor FROM mdata.drivers d WHERE d.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND d.deactivated_at IS NULL AND d.archived_at IS NULL AND d.is_sample_data IS NOT TRUE;
-- Q011.7
SELECT count(*) AS duplicate_hard_id_groups,COALESCE(sum(n-1),0) AS excess_rows FROM(SELECT cdl_state,upper(regexp_replace(cdl_number,'[^a-zA-Z0-9]','','g')),count(*) n FROM mdata.drivers WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND deactivated_at IS NULL AND archived_at IS NULL AND NULLIF(btrim(cdl_number),'') IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d;
-- Q011.8
SELECT count(*) AS fuel_rows,count(*) FILTER(WHERE f.unit_id IS DISTINCT FROM l.assigned_unit_id) AS unit_diff,count(*) FILTER(WHERE f.driver_id IS DISTINCT FROM l.assigned_primary_driver_id) AS driver_diff FROM fuel.fuel_transactions f JOIN mdata.loads l ON l.id=f.load_id AND l.operating_company_id=f.operating_company_id WHERE f.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND f.voided_at IS NULL AND f.archived_at IS NULL;
-- Q011.9
SELECT count(*) AS duplicate_provider_product_groups,COALESCE(sum(n-1),0) AS excess_rows FROM(SELECT vendor_id,regexp_replace(btrim(transaction_reference),'-1[0-9]{4}$',''),fuel_type,count(*) n FROM fuel.fuel_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND btrim(transaction_reference) ~ '^[0-9]+(-1[0-9]{4})?$' GROUP BY 1,2,3 HAVING count(*)>1) d;
-- Q011.10
SELECT count(*) AS load_expenses,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM expense_attribution.expense_load_links x WHERE x.operating_company_id=e.operating_company_id AND x.expense_id=e.id AND x.load_id=e.load_id)) AS no_attribution_link FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.load_id IS NOT NULL;
-- Q011.11
SELECT x.expense_source,count(*) AS links,count(*) FILTER(WHERE x.load_number IS DISTINCT FROM l.load_number) AS load_number_diff FROM expense_attribution.expense_load_links x JOIN mdata.loads l ON l.id=x.load_id AND l.operating_company_id=x.operating_company_id WHERE x.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' GROUP BY x.expense_source;
-- Q011.12
SELECT count(*) AS eligible_bank_lines,COALESCE(sum(abs(bt.amount_cents)),0)::text AS bank_amount_cents FROM banking.bank_transactions bt WHERE bt.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND bt.voided_at IS NULL AND bt.is_credit=false AND bt.matched_journal_entry_id IS NOT NULL AND bt.matched_expense_id IS NULL AND EXISTS(SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid AND j.operating_company_id=p.operating_company_id JOIN catalogs.accounts a ON a.id=p.account_id AND a.operating_company_id=p.operating_company_id WHERE p.journal_entry_uuid=bt.matched_journal_entry_id AND p.operating_company_id=bt.operating_company_id AND p.source_transaction_type='bank_categorization' AND j.status <> 'voided' AND j.voided_at IS NULL AND p.debit_or_credit='debit' AND a.account_type IN ('Expense','Cost of Goods Sold')) AND NOT EXISTS(SELECT 1 FROM accounting.expenses e WHERE e.operating_company_id=bt.operating_company_id AND e.source_bank_transaction_id=bt.id AND e.voided_at IS NULL);
-- Q011.13
SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname,c.relname) IN (('accounting','bills'),('accounting','expense_lines'),('accounting','expenses'),('fuel','fuel_transactions')) AND NOT t.tgisinternal ORDER BY 1,2,3;
ROLLBACK;

-- Q012 FAILED; no count claimed
/*
BEGIN;
-- Q012.1
SET LOCAL app.bypass_rls='lucia';
-- Q012.2
SET TRANSACTION READ ONLY;
-- Q012.3
SET LOCAL statement_timeout='20s';
-- Q012.4
SELECT clock_timestamp() AS measured_at;
-- Q012.5
SELECT p.source_transaction_type,p.entity_type,count(*) AS rows,sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)::text AS signed_cents FROM accounting.journal_entry_postings p JOIN accounting.chart_of_accounts_roles r ON r.account_id=p.account_id AND r.operating_company_id=p.operating_company_id AND r.role='ap_control' AND r.is_active JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed')) GROUP BY 1,2;
-- Q012.6
WITH gl AS(SELECT p.entity_uuid customer_id,sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END) cents FROM accounting.journal_entry_postings p JOIN accounting.chart_of_accounts_roles r ON r.account_id=p.account_id AND r.operating_company_id=p.operating_company_id AND r.role='ar_control' AND r.is_active JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed')) GROUP BY 1), sub AS(SELECT customer_id,sum(amount_open_cents) cents FROM accounting.invoices WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND status NOT IN ('draft','proforma','void') GROUP BY 1) SELECT count(*) AS customer_groups,count(*) FILTER(WHERE COALESCE(gl.cents,0)<>COALESCE(sub.cents,0)) AS different_groups,sum(abs(COALESCE(gl.cents,0)-COALESCE(sub.cents,0)))::text AS absolute_difference_cents FROM gl FULL JOIN sub USING(customer_id);
-- Q012.7
SELECT count(*) AS live_checks FROM accounting.expenses WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND payment_type='check';
-- Q012.8
SELECT count(*) AS legal_bills_with_matter_load FROM accounting.bills b JOIN legal.matters m ON m.id=b.legal_matter_id AND m.operating_company_id=b.operating_company_id WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND b.voided_at IS NULL AND m.load_id IS NOT NULL;
-- Q012.9
SELECT e.source,e.payment_type,e.posting_status,count(*) AS missing_link_count,sum(e.total_amount_cents)::text AS amount_cents,min(e.created_at) AS earliest,max(e.created_at) AS latest FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.load_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_attribution.expense_load_links x WHERE x.operating_company_id=e.operating_company_id AND x.expense_id=e.id AND x.load_id=e.load_id) GROUP BY 1,2,3;
-- Q012.10
SELECT b.display_id,b.bill_category,l.load_number,l.trailer_source,l.load_trailer_equipment_id IS NOT NULL AS load_has_owned_trailer,l.non_owned_trailer_id IS NOT NULL AS load_has_nonowned_trailer FROM accounting.bills b JOIN mdata.loads l ON l.id=b.load_id AND l.operating_company_id=b.operating_company_id WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND b.voided_at IS NULL AND b.revoked_at IS NULL AND b.trailer_id IS NULL AND b.non_owned_trailer_id IS NULL;
-- Q012.11
SELECT n.nspname,p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname,p.proname) IN (('accounting','refuse_driver_bill_without_links'),('accounting','refuse_expense_line_attr_mismatch'),('accounting','enforce_tier1_unit_driver_invariant'),('fuel','refuse_duplicate_provider_transaction'));
ROLLBACK;
*/

-- Q013 EXECUTED
BEGIN;
-- Q013.1
SET LOCAL app.bypass_rls='lucia';
-- Q013.2
SET TRANSACTION READ ONLY;
-- Q013.3
SET LOCAL statement_timeout='20s';
-- Q013.4
SELECT clock_timestamp() AS measured_at;
-- Q013.5
SELECT p.source_transaction_type,p.entity_type,count(*) AS rows,sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)::text AS signed_cents FROM accounting.journal_entry_postings p JOIN accounting.chart_of_accounts_roles r ON r.account_id=p.account_id AND r.operating_company_id=p.operating_company_id AND r.role='ap_control' AND r.is_active JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed')) GROUP BY 1,2;
-- Q013.6
WITH gl AS(SELECT p.entity_uuid customer_id,sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END) cents FROM accounting.journal_entry_postings p JOIN accounting.chart_of_accounts_roles r ON r.account_id=p.account_id AND r.operating_company_id=p.operating_company_id AND r.role='ar_control' AND r.is_active JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed')) GROUP BY 1), sub AS(SELECT customer_id,sum(amount_open_cents) cents FROM accounting.invoices WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND status NOT IN ('draft','proforma','void') GROUP BY 1) SELECT count(*) AS customer_groups,count(*) FILTER(WHERE COALESCE(gl.cents,0)<>COALESCE(sub.cents,0)) AS different_groups,sum(abs(COALESCE(gl.cents,0)-COALESCE(sub.cents,0)))::text AS absolute_difference_cents FROM gl FULL JOIN sub USING(customer_id);
-- Q013.7
SELECT count(*) AS live_checks FROM accounting.expenses WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND payment_type='check';
-- Q013.8
SELECT count(*) AS legal_bills_with_matter_load FROM accounting.bills b JOIN legal.matters m ON m.id=b.legal_matter_id AND m.operating_company_id=b.operating_company_id WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND b.voided_at IS NULL AND m.load_id IS NOT NULL;
-- Q013.9
SELECT e.source_fuel_transaction_id IS NOT NULL AS from_fuel,e.payment_type,e.posting_status,count(*) AS missing_link_count,sum(e.total_amount_cents)::text AS amount_cents,min(e.created_at) AS earliest,max(e.created_at) AS latest FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.load_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_attribution.expense_load_links x WHERE x.operating_company_id=e.operating_company_id AND x.expense_id=e.id AND x.load_id=e.load_id) GROUP BY 1,2,3;
-- Q013.10
SELECT b.display_id,b.bill_category,l.load_number,l.trailer_source,l.load_trailer_equipment_id IS NOT NULL AS load_has_owned_trailer,l.non_owned_trailer_id IS NOT NULL AS load_has_nonowned_trailer FROM accounting.bills b JOIN mdata.loads l ON l.id=b.load_id AND l.operating_company_id=b.operating_company_id WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND b.voided_at IS NULL AND b.revoked_at IS NULL AND b.trailer_id IS NULL AND b.non_owned_trailer_id IS NULL;
-- Q013.11
SELECT n.nspname,p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname,p.proname) IN (('accounting','refuse_driver_bill_without_links'),('accounting','refuse_expense_line_attr_mismatch'),('accounting','enforce_tier1_unit_driver_invariant'),('fuel','refuse_duplicate_provider_transaction'));
ROLLBACK;

-- Q014 FAILED; no count claimed
/*
BEGIN;
-- Q014.1
SET LOCAL app.bypass_rls='lucia';
-- Q014.2
SET TRANSACTION READ ONLY;
-- Q014.3
SET LOCAL statement_timeout='20s';
-- Q014.4
SELECT clock_timestamp() AS measured_at;
-- Q014.5
WITH vm AS(SELECT driver_id,min(id::text)::uuid vendor_id,count(*) n FROM mdata.vendors WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND driver_id IS NOT NULL AND deactivated_at IS NULL GROUP BY driver_id), p AS(SELECT p.*,CASE WHEN p.entity_type='vendor' THEN p.entity_uuid WHEN p.entity_type='driver' AND vm.n=1 THEN vm.vendor_id END AS vendor_id FROM accounting.journal_entry_postings p JOIN accounting.chart_of_accounts_roles r ON r.account_id=p.account_id AND r.operating_company_id=p.operating_company_id AND r.role='ap_control' AND r.is_active JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id LEFT JOIN vm ON vm.driver_id=p.entity_uuid WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed'))), gl AS(SELECT vendor_id,sum(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE -amount_cents END) cents FROM p GROUP BY 1), sub AS(SELECT mdata_vendor_id vendor_id,sum(amount_cents-COALESCE(paid_cents,0)) cents FROM accounting.bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND revoked_at IS NULL GROUP BY 1) SELECT count(*) AS vendor_groups,count(*) FILTER(WHERE COALESCE(gl.cents,0)<>COALESCE(sub.cents,0)) AS different_groups,sum(abs(COALESCE(gl.cents,0)-COALESCE(sub.cents,0)))::text AS absolute_difference_cents,(SELECT count(*) FROM p WHERE vendor_id IS NULL) AS unmapped_postings FROM gl FULL JOIN sub USING(vendor_id);
-- Q014.6
SELECT count(*) AS live_matches,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM audit.audit_events ae WHERE ae.operating_company_id=rm.operating_company_id AND ae.event_class='bank_match.accepted' AND ae.payload->>'reconciliation_match_id'=rm.id::text)) AS no_accept_audit FROM banking.reconciliation_matches rm WHERE rm.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND rm.voided_at IS NULL AND rm.match_state <> 'released';
-- Q014.7
SELECT count(*) AS loaded_expenses_without_attribution FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.load_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_attribution.expense_load_links x WHERE x.operating_company_id=e.operating_company_id AND x.expense_id=e.id AND x.load_id=e.load_id);
-- Q014.8
SELECT count(*) AS rows,count(*) FILTER(WHERE (lat IS NULL OR lon IS NULL)) AS missing_coordinates FROM mdata.load_stops s JOIN mdata.loads l ON l.id=s.load_id AND l.operating_company_id=s.operating_company_id WHERE l.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND l.soft_deleted_at IS NULL AND l.is_sample_data IS NOT TRUE;
-- Q014.9
SELECT pg_get_functiondef('accounting.fn_account_balances_as_of(uuid,date,date)'::regprocedure) definition;
-- Q014.10
SELECT filename,checksum,applied_at FROM _system._schema_migrations ORDER BY filename;
ROLLBACK;
*/

-- Q015 FAILED; no count claimed
/*
BEGIN;
-- Q015.1
SET LOCAL app.bypass_rls='lucia';
-- Q015.2
SET TRANSACTION READ ONLY;
-- Q015.3
SET LOCAL statement_timeout='20s';
-- Q015.4
SELECT clock_timestamp() AS measured_at;
-- Q015.5
WITH vm AS(SELECT driver_id,min(id::text)::uuid vendor_id,count(*) n FROM mdata.vendors WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND driver_id IS NOT NULL AND deactivated_at IS NULL GROUP BY driver_id), p AS(SELECT p.*,CASE WHEN p.entity_type='vendor' THEN p.entity_uuid WHEN p.entity_type='driver' AND vm.n=1 THEN vm.vendor_id END AS vendor_id FROM accounting.journal_entry_postings p JOIN accounting.chart_of_accounts_roles r ON r.account_id=p.account_id AND r.operating_company_id=p.operating_company_id AND r.role='ap_control' AND r.is_active JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id LEFT JOIN vm ON vm.driver_id=p.entity_uuid WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed'))), gl AS(SELECT vendor_id,sum(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE -amount_cents END) cents FROM p GROUP BY 1), sub AS(SELECT mdata_vendor_id vendor_id,sum(amount_cents-COALESCE(paid_cents,0)) cents FROM accounting.bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND revoked_at IS NULL GROUP BY 1) SELECT count(*) AS vendor_groups,count(*) FILTER(WHERE COALESCE(gl.cents,0)<>COALESCE(sub.cents,0)) AS different_groups,sum(abs(COALESCE(gl.cents,0)-COALESCE(sub.cents,0)))::text AS absolute_difference_cents,(SELECT count(*) FROM p WHERE vendor_id IS NULL) AS unmapped_postings FROM gl FULL JOIN sub USING(vendor_id);
-- Q015.6
SELECT count(*) AS live_matches,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM audit.audit_events ae WHERE ae.event_class='bank_match.accepted' AND ae.payload->>'reconciliation_match_id'=rm.id::text)) AS no_accept_audit FROM banking.reconciliation_matches rm WHERE rm.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND rm.voided_at IS NULL AND rm.match_state <> 'released';
-- Q015.7
SELECT count(*) AS loaded_expenses_without_attribution FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.load_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_attribution.expense_load_links x WHERE x.operating_company_id=e.operating_company_id AND x.expense_id=e.id AND x.load_id=e.load_id);
-- Q015.8
SELECT count(*) AS rows,count(*) FILTER(WHERE (lat IS NULL OR lon IS NULL)) AS missing_coordinates FROM mdata.load_stops s JOIN mdata.loads l ON l.id=s.load_id AND l.operating_company_id=s.operating_company_id WHERE l.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND l.soft_deleted_at IS NULL AND l.is_sample_data IS NOT TRUE;
-- Q015.9
SELECT pg_get_functiondef('accounting.fn_account_balances_as_of(uuid,date,date)'::regprocedure) definition;
-- Q015.10
SELECT filename,checksum,applied_at FROM _system._schema_migrations ORDER BY filename;
ROLLBACK;
*/

-- Q016 EXECUTED
BEGIN;
-- Q016.1
SET LOCAL app.bypass_rls='lucia';
-- Q016.2
SET TRANSACTION READ ONLY;
-- Q016.3
SET LOCAL statement_timeout='20s';
-- Q016.4
SELECT clock_timestamp() AS measured_at;
-- Q016.5
WITH vm AS(SELECT driver_id,min(id::text)::uuid vendor_id,count(*) n FROM mdata.vendors WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND driver_id IS NOT NULL AND deactivated_at IS NULL GROUP BY driver_id), p AS(SELECT p.*,CASE WHEN p.entity_type='vendor' THEN p.entity_uuid WHEN p.entity_type='driver' AND vm.n=1 THEN vm.vendor_id END AS vendor_id FROM accounting.journal_entry_postings p JOIN accounting.chart_of_accounts_roles r ON r.account_id=p.account_id AND r.operating_company_id=p.operating_company_id AND r.role='ap_control' AND r.is_active JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id LEFT JOIN vm ON vm.driver_id=p.entity_uuid WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed'))), gl AS(SELECT vendor_id,sum(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE -amount_cents END) cents FROM p GROUP BY 1), sub AS(SELECT mdata_vendor_id vendor_id,sum(amount_cents-COALESCE(paid_cents,0)) cents FROM accounting.bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND revoked_at IS NULL GROUP BY 1) SELECT count(*) AS vendor_groups,count(*) FILTER(WHERE COALESCE(gl.cents,0)<>COALESCE(sub.cents,0)) AS different_groups,sum(abs(COALESCE(gl.cents,0)-COALESCE(sub.cents,0)))::text AS absolute_difference_cents,(SELECT count(*) FROM p WHERE vendor_id IS NULL) AS unmapped_postings FROM gl FULL JOIN sub USING(vendor_id);
-- Q016.6
SELECT count(*) AS live_matches,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM audit.audit_events ae WHERE ae.event_class='bank_match.accepted' AND ae.payload->>'reconciliation_match_id'=rm.id::text)) AS no_accept_audit FROM banking.reconciliation_matches rm WHERE rm.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND rm.voided_at IS NULL AND rm.match_state <> 'released';
-- Q016.7
SELECT count(*) AS loaded_expenses_without_attribution FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.load_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_attribution.expense_load_links x WHERE x.operating_company_id=e.operating_company_id AND x.expense_id=e.id AND x.load_id=e.load_id);
-- Q016.8
SELECT count(*) AS rows,count(*) FILTER(WHERE (latitude IS NULL OR longitude IS NULL)) AS missing_coordinates FROM mdata.load_stops s JOIN mdata.loads l ON l.id=s.load_id AND l.operating_company_id=s.operating_company_id WHERE l.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND l.soft_deleted_at IS NULL AND l.is_sample_data IS NOT TRUE;
-- Q016.9
SELECT pg_get_functiondef('accounting.fn_account_balances_as_of(uuid,date,date)'::regprocedure) definition;
-- Q016.10
SELECT filename,checksum,applied_at FROM _system._schema_migrations ORDER BY filename;
ROLLBACK;

-- Q017 FAILED; no count claimed
/*
BEGIN;
-- Q017.1
SET LOCAL app.bypass_rls='lucia';
-- Q017.2
SET TRANSACTION READ ONLY;
-- Q017.3
SET LOCAL statement_timeout='20s';
-- Q017.4
SELECT clock_timestamp() AS measured_at;
-- Q017.5
SELECT a.account_type,count(DISTINCT bt.id) AS bank_lines,sum(p.amount_cents)::text AS expense_debit_cents FROM banking.bank_transactions bt JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid=bt.matched_journal_entry_id AND p.operating_company_id=bt.operating_company_id JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid AND j.operating_company_id=p.operating_company_id JOIN catalogs.accounts a ON a.id=p.account_id AND a.operating_company_id=p.operating_company_id WHERE bt.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND bt.voided_at IS NULL AND bt.is_credit=false AND bt.matched_expense_id IS NULL AND p.source_transaction_type='bank_categorization' AND p.debit_or_credit='debit' AND j.voided_at IS NULL AND j.status<>'voided' AND a.account_type IN ('Expense','OtherExpense','CostOfGoodsSold','Cost of Goods Sold') AND NOT EXISTS(SELECT 1 FROM accounting.expenses e WHERE e.operating_company_id=bt.operating_company_id AND e.source_bank_transaction_id=bt.id AND e.voided_at IS NULL) GROUP BY a.account_type;
-- Q017.6
SELECT count(*) AS postings_legacy_trial_balance_would_add FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND NOT (je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed')));
-- Q017.7
SELECT count(*) AS insurance_synthetic_bank_rows FROM banking.bank_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND (description LIKE 'Insurance dispersal %' OR notes LIKE 'Insurance wizard seed transaction%');
-- Q017.8
SELECT count(*) AS insurance_wizard_bills FROM accounting.bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND (qbo_idempotency_key LIKE 'ins:%' OR memo LIKE 'Insurance wizard bill%');
-- Q017.9
SELECT count(*) AS advances_missing_owned_trailer FROM driver_finance.driver_advances a JOIN mdata.loads l ON l.id=a.load_id AND l.operating_company_id=a.operating_company_id WHERE a.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND a.voided_at IS NULL AND a.trailer_id IS NULL AND l.load_trailer_equipment_id IS NOT NULL AND l.non_owned_trailer_id IS NULL;
-- Q017.10
SELECT count(*) AS no_vendor_active_drivers FROM mdata.drivers d WHERE d.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND d.deactivated_at IS NULL AND d.archived_at IS NULL AND d.is_sample_data IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM mdata.vendors v WHERE v.operating_company_id=d.operating_company_id AND v.driver_id=d.id AND v.deactivated_at IS NULL);
-- Q017.11
SELECT count(*) AS duplicate_provider_product_groups FROM(SELECT vendor_id,fuel.provider_base_reference(transaction_reference),fuel_type FROM fuel.fuel_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND fuel.provider_base_reference(transaction_reference) IS NOT NULL GROUP BY 1,2,3 HAVING count(*)>1) d;
-- Q017.12
SELECT count(*) AS live_matches FROM banking.reconciliation_matches WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND match_state<>'released';
-- Q017.13
SELECT p.source_transaction_type,count(*) AS missing_posting_load FROM accounting.journal_entry_postings p WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND p.load_id IS NULL AND accounting.posting_source_load_id(p.operating_company_id,p.source_transaction_type,p.source_transaction_id) IS NOT NULL GROUP BY 1;
ROLLBACK;
*/

-- Q018 EXECUTED
BEGIN;
-- Q018.1
SET LOCAL app.bypass_rls='lucia';
-- Q018.2
SET TRANSACTION READ ONLY;
-- Q018.3
SET LOCAL statement_timeout='20s';
-- Q018.4
SELECT clock_timestamp() AS measured_at;
-- Q018.5
SELECT a.account_type,count(DISTINCT bt.id) AS bank_lines,sum(p.amount_cents)::text AS expense_debit_cents FROM banking.bank_transactions bt JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid=bt.matched_journal_entry_id AND p.operating_company_id=bt.operating_company_id JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid AND j.operating_company_id=p.operating_company_id JOIN catalogs.accounts a ON a.id=p.account_id AND a.operating_company_id=p.operating_company_id WHERE bt.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND bt.voided_at IS NULL AND bt.is_credit=false AND bt.matched_expense_id IS NULL AND p.source_transaction_type='bank_categorization' AND p.debit_or_credit='debit' AND j.voided_at IS NULL AND j.status<>'voided' AND a.account_type IN ('Expense','OtherExpense','CostOfGoodsSold','Cost of Goods Sold') AND NOT EXISTS(SELECT 1 FROM accounting.expenses e WHERE e.operating_company_id=bt.operating_company_id AND e.source_bank_transaction_id=bt.id AND e.voided_at IS NULL) GROUP BY a.account_type;
-- Q018.6
SELECT count(*) AS postings_legacy_trial_balance_would_add FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND NOT (je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed')));
-- Q018.7
SELECT count(*) AS insurance_synthetic_bank_rows FROM banking.bank_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND (description LIKE 'Insurance dispersal %' OR notes LIKE 'Insurance wizard seed transaction%');
-- Q018.8
SELECT count(*) AS insurance_wizard_bills FROM accounting.bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND (qbo_idempotency_key LIKE 'ins:%' OR memo LIKE 'Insurance wizard bill%');
-- Q018.9
SELECT count(*) AS advances_missing_owned_trailer FROM driver_finance.driver_advances a JOIN mdata.loads l ON l.id=a.load_id AND l.operating_company_id=a.operating_company_id WHERE a.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND a.voided_at IS NULL AND a.trailer_id IS NULL AND l.load_trailer_equipment_id IS NOT NULL AND l.non_owned_trailer_id IS NULL;
-- Q018.10
SELECT count(*) AS no_vendor_active_drivers FROM mdata.drivers d WHERE d.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND d.deactivated_at IS NULL AND d.archived_at IS NULL AND d.is_sample_data IS NOT TRUE AND NOT EXISTS(SELECT 1 FROM mdata.vendors v WHERE v.operating_company_id=d.operating_company_id AND v.driver_id=d.id AND v.deactivated_at IS NULL);
-- Q018.11
SELECT count(*) AS duplicate_provider_product_groups FROM(SELECT vendor_id,fuel.provider_base_reference(transaction_reference),fuel_type FROM fuel.fuel_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND fuel.provider_base_reference(transaction_reference) IS NOT NULL GROUP BY 1,2,3 HAVING count(*)>1) d;
-- Q018.12
SELECT count(*) AS live_matches FROM banking.reconciliation_matches WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND match_state<>'released';
ROLLBACK;

-- Q019 FAILED; no count claimed
/*
BEGIN;
-- Q019.1
SET LOCAL app.bypass_rls='lucia';
-- Q019.2
SET TRANSACTION READ ONLY;
-- Q019.3
SET LOCAL statement_timeout='20s';
-- Q019.4
SELECT clock_timestamp() AS measured_at;
-- Q019.5
SELECT count(*) AS expenses,count(*) FILTER(WHERE e.vendor_uuid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mdata.vendors v WHERE v.id=e.vendor_uuid AND v.operating_company_id=e.operating_company_id)) AS missing_company_vendor,count(*) FILTER(WHERE e.driver_uuid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mdata.drivers d WHERE d.id=e.driver_uuid AND d.operating_company_id=e.operating_company_id)) AS missing_company_driver,count(*) FILTER(WHERE e.load_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mdata.loads l WHERE l.id=e.load_id AND l.operating_company_id=e.operating_company_id)) AS missing_company_load FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL;
-- Q019.6
SELECT count(*) AS invoice_lines,count(*) FILTER(WHERE item_id IS NULL) AS no_item FROM accounting.invoice_lines l JOIN accounting.invoices i ON i.id=l.invoice_id AND i.operating_company_id=l.operating_company_id WHERE i.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND i.voided_at IS NULL;
-- Q019.7
SELECT count(*) AS insurance_synthetic_bank_rows FROM banking.bank_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND (description LIKE 'Insurance dispersal %' OR notes LIKE 'Insurance wizard seed transaction%');
-- Q019.8
SELECT count(*) AS insurance_wizard_bills FROM accounting.bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND (qbo_idempotency_key LIKE 'ins:%' OR memo LIKE 'Insurance wizard bill%');
-- Q019.9
SELECT count(*) AS postings,count(*) FILTER(WHERE a.id IS NULL) AS no_scoped_account,count(*) FILTER(WHERE j.id IS NULL) AS no_scoped_je FROM accounting.journal_entry_postings p LEFT JOIN catalogs.accounts a ON a.id=p.account_id AND a.operating_company_id=p.operating_company_id LEFT JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid AND j.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q019.10
SELECT ns.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,(SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) policies FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.relkind IN('r','p') AND ns.nspname IN ('accounting','banking','driver_finance','fuel','mdata','maintenance','expense_attribution','insurance','legal') AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='operating_company_id' AND NOT a.attisdropped) AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)) ORDER BY 1,2;
-- Q019.11
SELECT count(*) AS invoices,count(*) FILTER(WHERE i.total_cents IS DISTINCT FROM COALESCE(x.cents,0)) AS header_lines_differ FROM accounting.invoices i LEFT JOIN LATERAL(SELECT sum(l.amount_cents) AS cents FROM accounting.invoice_lines l WHERE l.invoice_id=i.id AND l.operating_company_id=i.operating_company_id) x ON true WHERE i.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND i.voided_at IS NULL;
ROLLBACK;
*/

-- Q020 EXECUTED
BEGIN;
-- Q020.1
SET LOCAL app.bypass_rls='lucia';
-- Q020.2
SET TRANSACTION READ ONLY;
-- Q020.3
SET LOCAL statement_timeout='20s';
-- Q020.4
SELECT clock_timestamp() AS measured_at;
-- Q020.5
SELECT count(*) AS expenses,count(*) FILTER(WHERE e.vendor_uuid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mdata.vendors v WHERE v.id=e.vendor_uuid AND v.operating_company_id=e.operating_company_id)) AS missing_company_vendor,count(*) FILTER(WHERE e.driver_uuid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mdata.drivers d WHERE d.id=e.driver_uuid AND d.operating_company_id=e.operating_company_id)) AS missing_company_driver,count(*) FILTER(WHERE e.load_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mdata.loads l WHERE l.id=e.load_id AND l.operating_company_id=e.operating_company_id)) AS missing_company_load FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL;
-- Q020.6
SELECT count(*) AS invoice_lines,count(*) FILTER(WHERE item_id IS NULL) AS no_item FROM accounting.invoice_lines l JOIN accounting.invoices i ON i.id=l.invoice_id AND i.operating_company_id=l.operating_company_id WHERE i.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND i.voided_at IS NULL;
-- Q020.7
SELECT count(*) AS insurance_synthetic_bank_rows FROM banking.bank_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND (description LIKE 'Insurance dispersal %' OR notes LIKE 'Insurance wizard seed transaction%');
-- Q020.8
SELECT count(*) AS insurance_wizard_bills FROM accounting.bills WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL AND (qbo_idempotency_key LIKE 'ins:%' OR memo LIKE 'Insurance wizard bill%');
-- Q020.9
SELECT count(*) AS postings,count(*) FILTER(WHERE a.id IS NULL) AS no_scoped_account,count(*) FILTER(WHERE j.id IS NULL) AS no_scoped_je FROM accounting.journal_entry_postings p LEFT JOIN catalogs.accounts a ON a.id=p.account_id AND a.operating_company_id=p.operating_company_id LEFT JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid AND j.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Q020.10
SELECT ns.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,(SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) policies FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.relkind IN('r','p') AND ns.nspname IN ('accounting','banking','driver_finance','fuel','mdata','maintenance','expense_attribution','insurance','legal') AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='operating_company_id' AND NOT a.attisdropped) AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)) ORDER BY 1,2;
-- Q020.11
SELECT count(*) AS invoices,count(*) FILTER(WHERE i.total_cents IS DISTINCT FROM COALESCE(x.cents,0)) AS header_lines_differ FROM accounting.invoices i LEFT JOIN LATERAL(SELECT sum(l.line_total_cents) AS cents FROM accounting.invoice_lines l WHERE l.invoice_id=i.id AND l.operating_company_id=i.operating_company_id AND l.soft_deleted_at IS NULL) x ON true WHERE i.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND i.voided_at IS NULL;
ROLLBACK;

-- Q021 EXECUTED
BEGIN;
-- Q021.1
SET LOCAL app.bypass_rls='lucia';
-- Q021.2
SET TRANSACTION READ ONLY;
-- Q021.3
SET LOCAL statement_timeout='20s';
-- Q021.4
SELECT clock_timestamp() AS measured_at;
-- Q021.5
SELECT count(*) AS company_tables,count(*) FILTER(WHERE NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)) AS missing_rls_configuration FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.relkind IN('r','p') AND ns.nspname IN ('accounting','banking','driver_finance','fuel','mdata','maintenance','expense_attribution','insurance','legal') AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='operating_company_id' AND NOT a.attisdropped);
-- Q021.6
SELECT count(*) AS extra_postings_legacy_trial_balance FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND NOT(je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed')));
-- Q021.7
SELECT p.source_transaction_type,p.debit_or_credit,a.account_number,a.account_name,count(*) AS rows,sum(p.amount_cents)::text AS amount_cents FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid AND je.operating_company_id=p.operating_company_id JOIN catalogs.accounts a ON a.id=p.account_id AND a.operating_company_id=p.operating_company_id LEFT JOIN accounting.posting_batches pb ON pb.id=p.posting_batch_id AND pb.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted','reversed')) GROUP BY 1,2,3,4 ORDER BY 1,2,3;
-- Q021.8
SELECT ns.nspname,c.relname,con.conname,con.contype,con.convalidated,pg_get_constraintdef(con.oid) definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE (ns.nspname,c.relname) IN (('accounting','expense_lines'),('accounting','invoice_lines'),('driver_finance','driver_bills'),('driver_finance','driver_advances'),('accounting','transaction_source_links')) ORDER BY 1,2,3;
ROLLBACK;

-- Q022 EXECUTED
BEGIN;
-- Q022.1
SET LOCAL app.bypass_rls='lucia';
-- Q022.2
SET TRANSACTION READ ONLY;
-- Q022.3
SET LOCAL statement_timeout='20s';
-- Q022.4
SELECT clock_timestamp() AS measured_at;
-- Q022.5
SELECT count(*) AS expense_postings,count(*) FILTER(WHERE p.entity_uuid IS NULL AND COALESCE(e.vendor_uuid,e.driver_uuid,e.payee_customer_uuid) IS NOT NULL) AS no_entity_despite_document,count(*) FILTER(WHERE p.load_id IS DISTINCT FROM e.load_id AND e.load_id IS NOT NULL) AS different_load FROM accounting.journal_entry_postings p JOIN accounting.expenses e ON e.id::text=p.source_transaction_id AND e.operating_company_id=p.operating_company_id JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid AND j.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND p.source_transaction_type='expense' AND e.voided_at IS NULL AND j.voided_at IS NULL AND j.status<>'voided';
-- Q022.6
SELECT count(*) AS missing_attribution,count(*) FILTER(WHERE e.memo LIKE '[SC %') AS creator_memo,count(*) FILTER(WHERE e.journal_entry_id IS NOT NULL) AS header_je_present FROM accounting.expenses e WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND e.voided_at IS NULL AND e.load_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_attribution.expense_load_links x WHERE x.operating_company_id=e.operating_company_id AND x.expense_id=e.id AND x.load_id=e.load_id);
-- Q022.7
SELECT count(*) AS bills_missing_trailer FROM accounting.bills b JOIN mdata.loads l ON l.id=b.load_id AND l.operating_company_id=b.operating_company_id WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND b.voided_at IS NULL AND b.revoked_at IS NULL AND b.trailer_id IS NULL AND b.non_owned_trailer_id IS NULL AND (l.load_trailer_equipment_id IS NOT NULL OR l.non_owned_trailer_id IS NOT NULL);
-- Q022.8
SELECT count(*) AS advances_missing_owned_trailer FROM driver_finance.driver_advances a JOIN mdata.loads l ON l.id=a.load_id AND l.operating_company_id=a.operating_company_id WHERE a.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND a.voided_at IS NULL AND a.trailer_id IS NULL AND l.load_trailer_equipment_id IS NOT NULL AND l.non_owned_trailer_id IS NULL;
ROLLBACK;

-- Q023
BEGIN;
SET LOCAL app.bypass_rls = 'lucia';
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';
SELECT now() measured_at, conname, pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='driver_finance.settlement_lines'::regclass AND conname ILIKE '%extra_pay%';
SELECT tgname, pg_get_functiondef(tgfoid) definition FROM pg_trigger WHERE tgrelid='driver_finance.settlement_lines'::regclass AND NOT tgisinternal AND (tgtype::int & 2)=2;
SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE (table_schema,table_name) IN (('dispatch','load_cancellations'),('accounting','escrow_postings'),('driver_finance','driver_reimbursements')) ORDER BY 1,2,ordinal_position;
ROLLBACK;


-- Q024
BEGIN;
SET LOCAL app.bypass_rls='lucia';
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT now() measured_at,count(*) cancellations FROM dispatch.load_cancellations WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
SELECT c.status,c.billable_to_customer,i.status invoice_status,count(*) FROM dispatch.load_cancellations c LEFT JOIN accounting.invoices i ON i.id=c.charge_invoice_id AND i.operating_company_id=c.operating_company_id WHERE c.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' GROUP BY 1,2,3;
SELECT count(*) deposits,count(*) FILTER(WHERE linked_journal_entry_id IS NULL) missing_je,count(*) FILTER(WHERE source_id IS NULL) missing_source FROM accounting.escrow_postings WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND posting_type='deposit' AND source_type='driver_settlement';
SELECT count(*) total,count(*) FILTER(WHERE status='paid' AND from_bank_account_id IS NOT NULL) paid_bank,count(*) FILTER(WHERE status='paid' AND from_bank_account_id IS NOT NULL AND journal_entry_id IS NULL) paid_bank_no_je FROM driver_finance.driver_reimbursements WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL;
ROLLBACK;


-- Q025
BEGIN;
SET LOCAL app.bypass_rls='lucia';
SET TRANSACTION READ ONLY;
SELECT now() measured_at,count(*) FROM dispatch.load_cancellations WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
SELECT count(*) FROM driver_finance.driver_reimbursements WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL;
ROLLBACK;


-- Q026
BEGIN;
SET LOCAL app.bypass_rls='lucia';
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT now() measured_at,count(*) total,count(*) FILTER(WHERE status='dismissed' AND converted_to_liability_id IS NOT NULL) dismissed_linked_liability FROM safety.civil_fines WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
SELECT count(*) total FROM reports.ifta_filings WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
SELECT count(*) total,count(*) FILTER(WHERE voided_at IS NOT NULL AND archived_at IS NULL) voided_unarchived FROM fuel.fuel_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
SELECT count(*) fuel_with_live_fuel_event_je,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM accounting.expenses e WHERE e.operating_company_id=f.operating_company_id AND e.source_fuel_transaction_id=f.id AND e.voided_at IS NULL)) no_expense FROM fuel.fuel_transactions f WHERE f.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND f.archived_at IS NULL AND f.voided_at IS NULL AND EXISTS(SELECT 1 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid AND j.operating_company_id=p.operating_company_id WHERE p.operating_company_id=f.operating_company_id AND p.source_transaction_type='fuel_event' AND p.source_transaction_id=f.id::text AND j.status='posted' AND j.voided_at IS NULL);
ROLLBACK;


-- Q027
BEGIN;
SET LOCAL app.bypass_rls='lucia';
SET TRANSACTION READ ONLY;
SELECT now() measured_at,count(*) FROM safety.civil_fines WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
SELECT count(*) FROM fuel.fuel_transactions WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NOT NULL AND archived_at IS NULL;
SELECT status,count(*) FROM reports.ifta_filings WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' GROUP BY status;
SELECT j.status,count(*) FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid AND j.operating_company_id=p.operating_company_id WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND p.source_transaction_type='fuel_event' AND j.voided_at IS NULL GROUP BY j.status;
ROLLBACK;


-- Q028
BEGIN;
SET LOCAL app.bypass_rls='lucia';
SET TRANSACTION READ ONLY;
SELECT now() measured_at,p.source_transaction_id,count(*) FROM accounting.journal_entry_postings p WHERE p.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND p.source_transaction_type='fuel_event' GROUP BY p.source_transaction_id ORDER BY p.source_transaction_id LIMIT 3;
ROLLBACK;
