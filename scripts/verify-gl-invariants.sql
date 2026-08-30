-- =====================================================================
-- IH35-TMS · GL INVARIANT RE-VERIFICATION PACK
-- Purpose: let ANY seat independently re-prove every financial number
--          Claude reported on 2026-08-28. Nothing single-sourced.
-- Target:  Neon project tiny-field-89581227 · branch br-fancy-credit-akjnd07a
-- Safety:  READ ONLY. No INSERT/UPDATE/DELETE. Safe to run on prod.
-- Usage:   psql "$DATABASE_URL" -f scripts/verify-gl-invariants.sql
-- Cursor re-prove 2026-08-27 CT: INV-1..15. INV-14 MUST be entity-scoped
-- (display_id is not unique across TRANSP/USMCA). INV-15 can list two
-- voided invoices for one Event-2 JE when they share source_load_id.
-- =====================================================================
\set USMCA  '5c854333-6ea5-4faa-af31-67cb272fef80'
\set TRANSP '91e0bf0a-133f-4ce8-a734-2586cfa66d96'
\set TRK    'b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e'

\echo '=== INV-0  CONTROL (discriminator: proves this connection can SEE the ledger) ==='
-- Any invariant whose pass condition is "zero rows" MUST be preceded by this probe.
-- Zero rows from an RLS-scoped blind read is indistinguishable from zero rows from a
-- clean ledger. Only a non-zero control read can tell them apart.
SELECT count(*) AS je_control FROM accounting.journal_entries;

\echo '=== INV-0B  ENTITY-SCOPED CONTROL (discriminator: proves this connection can see role rows under ENFORCED RLS with a company context set) ==='
-- packet 10-RLS-WILL-BREAK-THE-FIRST-RUN.txt, 2026-08-30, section 3: INV-0's own probe runs
-- under app.bypass_rls -- useless as a discriminator for C30 (entity_isolation), which MUST run
-- under enforced RLS (R5 forbids bypass on an isolation proof) and therefore needs its OWN
-- probe that proves visibility under enforced RLS WITH a company context, or a zero-rows
-- "no duplicates" result would be indistinguishable from "RLS scoped this connection to
-- nothing." The runner sets app.operating_company_id as its own statement (never inline SQL,
-- same pattern as app.bypass_rls) before this query runs -- this block itself carries no
-- WHERE clause. FORCE ROW LEVEL SECURITY does the entity-scoping.
SELECT count(*) AS role_control FROM accounting.chart_of_accounts_roles;

\echo '=== INV-1  TRIAL BALANCE (expect difference_cents = 0) ==='
SELECT sum(CASE WHEN debit_or_credit='debit'  THEN amount_cents ELSE 0 END) AS total_debits_cents,
       sum(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE 0 END) AS total_credits_cents,
       sum(CASE WHEN debit_or_credit='debit'  THEN amount_cents ELSE -amount_cents END) AS difference_cents
FROM accounting.journal_entry_postings;

\echo '=== INV-2  PER-ENTRY BALANCE (expect je_unbalanced = 0) ==='
WITH je AS (
  SELECT j.id,
         sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END) AS diff,
         count(p.id) AS lines
  FROM accounting.journal_entries j
  LEFT JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid=j.id
  GROUP BY j.id)
SELECT count(*) AS total_je,
       count(*) FILTER (WHERE lines=0)               AS je_zero_lines,
       count(*) FILTER (WHERE lines>0 AND diff<>0)   AS je_unbalanced
FROM je;

-- ACCT-F59 tie-out basis fix (2026-08-28, GO-2228 blocker): this CTE used to compare GL to
-- subledger with is_sample_data included on BOTH sides — internally consistent, but not comparable
-- to what the balance sheet / trial balance / P&L / cash-flow / register actually show, since
-- #16832 excluded is_sample_data from all of those (`AND COALESCE(je.is_sample_data, false) = false`
-- on the GL side, mirrored here exactly). A "$0.00" on the OLD (sample-included) basis proved nothing
-- about what the balance sheet reports — two different A/R numbers existed under the same invariant
-- name. Both ar_gl/ap_gl (join journal_entries, filter je.is_sample_data) and ar_sub/ap_sub (filter
-- the subledger row's own is_sample_data column — accounting.invoices/bills both carry it, migration
-- 202612370000) now compute REAL-ONLY, same basis as the reports.
\echo '=== INV-3  SUBLEDGER TIE-OUT, USMCA, REAL-ONLY basis matching TB/BS (expect both differences = 0.00) ==='
WITH ar_gl AS (SELECT coalesce(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)/100.0 g
               FROM accounting.journal_entry_postings p
               JOIN catalogs.accounts a ON a.id=p.account_id
               JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid
               WHERE a.system_purpose='accounts_receivable' AND a.operating_company_id=:'USMCA'
                 AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false),
     ar_sub AS (SELECT coalesce(sum(amount_open_cents),0)/100.0 s FROM accounting.invoices
               WHERE operating_company_id=:'USMCA' AND voided_at IS NULL AND status NOT IN ('draft','proforma')
                 AND COALESCE(is_sample_data,false)=false),
     ap_gl AS (SELECT coalesce(sum(CASE WHEN p.debit_or_credit='credit' THEN p.amount_cents ELSE -p.amount_cents END),0)/100.0 g
               FROM accounting.journal_entry_postings p
               JOIN catalogs.accounts a ON a.id=p.account_id
               JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid
               WHERE a.system_purpose='accounts_payable' AND a.operating_company_id=:'USMCA'
                 AND je.status<>'voided' AND COALESCE(je.is_sample_data,false)=false),
     ap_sub AS (SELECT coalesce(sum(total_amount-coalesce(paid_amount,0)),0) s FROM accounting.bills
               WHERE operating_company_id=:'USMCA' AND voided_at IS NULL AND status<>'draft'
                 AND COALESCE(is_sample_data,false)=false)
SELECT (SELECT g FROM ar_gl) AS ar_gl, (SELECT s FROM ar_sub) AS ar_subledger,
       (SELECT g FROM ar_gl)-(SELECT s FROM ar_sub) AS ar_difference,
       (SELECT g FROM ap_gl) AS ap_gl, (SELECT s FROM ap_sub) AS ap_subledger,
       (SELECT g FROM ap_gl)-(SELECT s FROM ap_sub) AS ap_difference;

\echo '=== INV-4  DOCUMENTS WITH NO GL DELTA (expect 0 rows) ==='
SELECT c.code AS opco, i.display_id, i.status, i.total_cents/100.0 AS total,
       i.amount_paid_cents/100.0 AS paid, i.created_at::date AS created
FROM accounting.invoices i JOIN org.companies c ON c.id=i.operating_company_id
WHERE i.source_system='tms' AND i.voided_at IS NULL
  AND i.status IN ('sent','partial','paid')
  AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                  WHERE p.source_transaction_type='invoice' AND p.source_transaction_id=i.id::text)
ORDER BY i.created_at;

\echo '=== INV-5  A/R REGRESSION TIMELINE (posted_to_ar should not stop) ==='
SELECT date_trunc('week', i.created_at)::date AS week,
       count(*) AS tms_invoices,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
              WHERE p.source_transaction_type='invoice' AND p.source_transaction_id=i.id::text)) AS posted_to_ar
FROM accounting.invoices i WHERE i.source_system='tms'
GROUP BY 1 ORDER BY 1;

\echo '=== INV-6  STRANDED INTERMEDIATE ACCOUNTS (expect 0.00) ==='
SELECT a.account_number, a.account_name, c.code AS opco,
       sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)/100.0 AS balance
FROM accounting.journal_entry_postings p
JOIN catalogs.accounts a ON a.id=p.account_id
JOIN org.companies c ON c.id=a.operating_company_id
WHERE a.system_purpose IN ('unbilled_revenue','undeposited_funds','cash_clearing')
GROUP BY 1,2,3 HAVING sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)<>0
ORDER BY 4 DESC;

\echo '=== INV-7  TEST / SAMPLE DATA INSIDE THE TRIAL BALANCE (expect 0) ==='
SELECT count(DISTINCT j.id) AS sample_jes, count(p.id) AS sample_lines,
       sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE 0 END)/100.0 AS sample_debits
FROM accounting.journal_entries j JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid=j.id
WHERE j.is_sample_data;

\echo '=== INV-8  PERIOD CLOSE (expect closed > 0 and lock dates set) ==='
SELECT status, count(*) AS n, count(*) FILTER (WHERE closed_at IS NOT NULL) AS closed,
       count(*) FILTER (WHERE locks_txn_dates_le IS NOT NULL) AS with_lock_date
FROM accounting.periods GROUP BY 1;

\echo '=== INV-9  FUTURE-DATED ENTRIES (expect 0) ==='
SELECT count(*) AS future_dated, max(entry_date) AS furthest
FROM accounting.journal_entries WHERE entry_date > CURRENT_DATE;

\echo '=== INV-10 ENTITY ROLE PARITY  [CORRECTED 2026-08-28] ==='
\echo '--- 10a: roles MISSING entirely in an entity (no row at all) ---'
WITH ents AS (SELECT id, code FROM org.companies),
     roles AS (SELECT DISTINCT role FROM accounting.chart_of_accounts_roles)
SELECT r.role, e.code AS missing_in_opco
FROM roles r CROSS JOIN ents e
WHERE NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles x
                  WHERE x.role=r.role AND x.operating_company_id=e.id)
ORDER BY 1,2;

\echo '--- 10b: roles PRESENT but with NO active row (genuinely off) ---'
SELECT r.role, c.code AS opco, count(*) AS rows_present
FROM accounting.chart_of_accounts_roles r JOIN org.companies c ON c.id=r.operating_company_id
GROUP BY 1,2 HAVING bool_or(r.is_active) IS NOT TRUE
ORDER BY 1,2;

\echo '--- 10c: DUPLICATE role rows — resolution is order-dependent (expect 0) ---'
SELECT c.code AS opco, r.role, count(*) AS dup_rows,
       count(*) FILTER (WHERE r.is_active) AS active_rows
FROM accounting.chart_of_accounts_roles r JOIN org.companies c ON c.id=r.operating_company_id
GROUP BY 1,2 HAVING count(*)>1
ORDER BY count(*) DESC,1,2;

\echo '--- 10d: is there a unique constraint protecting (operating_company_id, role)? ---'
SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
WHERE conrelid='accounting.chart_of_accounts_roles'::regclass AND contype IN ('u','p');

\echo '=== INV-11 REVERSAL SYMMETRY (expect reversal_of = reversed_by) ==='
SELECT count(*) FILTER (WHERE reverses_je_id IS NOT NULL)   AS je_marked_reversal,
       count(*) FILTER (WHERE reversed_by_je_id IS NOT NULL) AS je_marked_reversed,
       count(*) FILTER (WHERE voided_at IS NOT NULL)         AS je_voided_in_place_MUST_BE_0
FROM accounting.journal_entries;

\echo '=== INV-12 OPENING BALANCE vs QBO (compare to live QBO BS as of 2024-12-31) ==='
SELECT a.account_number, a.account_name, a.account_type,
       sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)/100.0 AS ih35_signed_debit
FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id=p.account_id
WHERE p.journal_entry_uuid IN (SELECT id FROM accounting.journal_entries WHERE memo ILIKE 'Opening balance%')
GROUP BY 1,2,3 ORDER BY abs(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)) DESC;

\echo '=== INV-13 A/R CONTROL ACCOUNT, LINE BY LINE (USMCA) ==='
SELECT j.entry_date, left(j.memo,70) AS memo, p.debit_or_credit AS dc,
       p.amount_cents/100.0 AS amt, coalesce(p.source_transaction_type,'-') AS src,
       (j.reverses_je_id IS NOT NULL) AS is_reversal
FROM accounting.journal_entry_postings p
JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid
JOIN catalogs.accounts a ON a.id=p.account_id
WHERE a.system_purpose='accounts_receivable'
  AND a.operating_company_id=:'USMCA'
ORDER BY j.entry_date, j.created_at;

\echo '=== INV-14 PAYMENTS CREDITING A/R WITH NO INVOICE APPLICATION (USMCA only; expect 0) ==='
SELECT x.display_id, x.amount_cents/100.0 AS amt, x.payment_date,
       (SELECT count(*) FROM accounting.payment_applications pa WHERE pa.payment_id=x.id) AS applied_to
FROM accounting.payments x
WHERE x.source_system='tms' AND x.voided_at IS NULL
  AND x.operating_company_id=:'USMCA'
  AND (SELECT count(*) FROM accounting.payment_applications pa WHERE pa.payment_id=x.id)=0
ORDER BY x.payment_date;

\echo '=== INV-15 VOIDED INVOICES WHOSE REVREC EVENT-2 A/R LEG WAS NEVER REVERSED ==='
SELECT i.display_id, i.status, i.total_cents/100.0 AS total, i.source_load_id
FROM accounting.invoices i
WHERE i.source_system='tms' AND i.voided_at IS NOT NULL AND i.source_load_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM accounting.journal_entries j
              JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid=j.id
              JOIN catalogs.accounts a ON a.id=p.account_id
              WHERE j.memo LIKE '%'||i.source_load_id::text||'%'
                AND j.memo ILIKE '%Event 2%'
                AND a.system_purpose='accounts_receivable'
                AND j.reverses_je_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM accounting.journal_entries r WHERE r.reverses_je_id=j.id))
ORDER BY i.display_id;
