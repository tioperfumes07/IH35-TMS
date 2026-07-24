#!/usr/bin/env node
/**
 * Owner-only backfill: fan the QBO A/P payment mirror (mdata.qbo_ap_bill_payments) out into
 * accounting.bill_payments (source_system='qbo'), ONE row per (payment, bill) allocation, matched to
 * accounting.bills by qbo_bill_id. Idempotent upsert on
 *   uq_bill_payments_company_qbo_bp_bill (operating_company_id, qbo_bill_payment_id, bill_id).
 *
 * This is the same set-based projection projectApBillPaymentsToLedger() runs in the scheduler, exposed
 * as a one-shot the owner runs by hand AFTER the two held migrations are applied on the Neon branch and
 * AFTER the bills mirror/projection has landed the bills these payments link to. It NEVER posts GL,
 * NEVER writes to QBO, and NEVER invents rows — allocations whose bill is not present in
 * accounting.bills are skipped and reported as paymentsUnlinked (re-run after the bills land).
 *
 * Agent must not run against prod — Jorge runs with DATABASE_URL.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/ops/backfill-qbo-bill-payments.mjs
 *   DATABASE_URL=... node scripts/ops/backfill-qbo-bill-payments.mjs --company <uuid>
 *   DATABASE_URL=... node scripts/ops/backfill-qbo-bill-payments.mjs --dry-run
 */
import pg from "pg";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const companyIdx = args.indexOf("--company");
const companyId = companyIdx >= 0 ? args[companyIdx + 1] : null;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

// Fan-out projection (mirrors apps/backend/src/qbo-sync/ap-bill-payments-puller.ts projectApBillPaymentsToLedger).
const PROJECT_SQL = `
WITH exploded AS (
  SELECT
    m.operating_company_id,
    m.qbo_id                                    AS qbo_bill_payment_id,
    m.qbo_sync_token,
    m.vendor_qbo_id,
    COALESCE(m.txn_date, CURRENT_DATE)          AS payment_date,
    m.pay_type,
    m.private_note,
    (lt->>'TxnId')                              AS linked_bill_qbo_id,
    (lt->>'TxnType')                            AS linked_txn_type,
    ROUND(COALESCE((line->>'Amount')::numeric, 0) * 100)::bigint AS line_amount_cents
  FROM mdata.qbo_ap_bill_payments m
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.payload_json->'Line', '[]'::jsonb)) AS line
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(line->'LinkedTxn', '[]'::jsonb)) AS lt
  WHERE ($1::uuid IS NULL OR m.operating_company_id = $1::uuid)
),
agg AS (
  SELECT
    operating_company_id,
    qbo_bill_payment_id,
    MAX(qbo_sync_token)  AS qbo_sync_token,
    MAX(vendor_qbo_id)   AS vendor_qbo_id,
    MAX(payment_date)    AS payment_date,
    MAX(pay_type)        AS pay_type,
    MAX(private_note)    AS private_note,
    linked_bill_qbo_id,
    SUM(line_amount_cents)::bigint AS amount_cents
  FROM exploded
  WHERE linked_txn_type = 'Bill'
    AND linked_bill_qbo_id IS NOT NULL
    AND line_amount_cents > 0
  GROUP BY operating_company_id, qbo_bill_payment_id, linked_bill_qbo_id
)
INSERT INTO accounting.bill_payments (
  operating_company_id, bill_id, vendor_id, payment_date, amount_cents, amount,
  payment_method, memo, qbo_bill_payment_id, qbo_sync_token, source_system, status,
  last_qbo_synced_at, created_at, updated_at
)
SELECT
  a.operating_company_id,
  b.id,
  a.vendor_qbo_id,
  a.payment_date,
  a.amount_cents,
  (a.amount_cents / 100.0),
  CASE a.pay_type
    WHEN 'Check'      THEN 'check'
    WHEN 'CreditCard' THEN 'credit_card'
    WHEN 'Cash'       THEN 'cash'
    ELSE 'check'
  END,
  a.private_note,
  a.qbo_bill_payment_id,
  a.qbo_sync_token,
  'qbo',
  'posted',
  now(), now(), now()
FROM agg a
JOIN accounting.bills b
  ON b.operating_company_id = a.operating_company_id
 AND b.qbo_bill_id = a.linked_bill_qbo_id
ON CONFLICT (operating_company_id, qbo_bill_payment_id, bill_id) WHERE qbo_bill_payment_id IS NOT NULL
DO UPDATE SET
  vendor_id = EXCLUDED.vendor_id,
  payment_date = EXCLUDED.payment_date,
  amount_cents = EXCLUDED.amount_cents,
  amount = EXCLUDED.amount,
  payment_method = EXCLUDED.payment_method,
  memo = EXCLUDED.memo,
  qbo_sync_token = EXCLUDED.qbo_sync_token,
  last_qbo_synced_at = now(),
  updated_at = now()
WHERE accounting.bill_payments.source_system = 'qbo'
`;

const UNLINKED_SQL = `
WITH exploded AS (
  SELECT
    m.operating_company_id,
    (lt->>'TxnId')   AS linked_bill_qbo_id,
    (lt->>'TxnType') AS linked_txn_type,
    ROUND(COALESCE((line->>'Amount')::numeric, 0) * 100)::bigint AS line_amount_cents
  FROM mdata.qbo_ap_bill_payments m
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.payload_json->'Line', '[]'::jsonb)) AS line
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(line->'LinkedTxn', '[]'::jsonb)) AS lt
  WHERE ($1::uuid IS NULL OR m.operating_company_id = $1::uuid)
)
SELECT count(*)::int AS unlinked
FROM exploded e
WHERE e.linked_txn_type = 'Bill'
  AND e.linked_bill_qbo_id IS NOT NULL
  AND e.line_amount_cents > 0
  AND NOT EXISTS (
    SELECT 1 FROM accounting.bills b
    WHERE b.operating_company_id = e.operating_company_id
      AND b.qbo_bill_id = e.linked_bill_qbo_id
  )
`;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

  const unlinked = (await client.query(UNLINKED_SQL, [companyId])).rows[0]?.unlinked ?? 0;

  if (dryRun) {
    // Count what WOULD upsert without writing (matched allocations only).
    const dryCount = await client.query(
      `
      WITH exploded AS (
        SELECT m.operating_company_id, m.qbo_id AS qbo_bill_payment_id,
               (lt->>'TxnId') AS linked_bill_qbo_id, (lt->>'TxnType') AS linked_txn_type,
               ROUND(COALESCE((line->>'Amount')::numeric,0)*100)::bigint AS line_amount_cents
        FROM mdata.qbo_ap_bill_payments m
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.payload_json->'Line','[]'::jsonb)) AS line
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(line->'LinkedTxn','[]'::jsonb)) AS lt
        WHERE ($1::uuid IS NULL OR m.operating_company_id = $1::uuid)
      ), agg AS (
        SELECT operating_company_id, qbo_bill_payment_id, linked_bill_qbo_id
        FROM exploded
        WHERE linked_txn_type='Bill' AND linked_bill_qbo_id IS NOT NULL AND line_amount_cents > 0
        GROUP BY operating_company_id, qbo_bill_payment_id, linked_bill_qbo_id
      )
      SELECT count(*)::int AS would_project
      FROM agg a
      JOIN accounting.bills b
        ON b.operating_company_id = a.operating_company_id AND b.qbo_bill_id = a.linked_bill_qbo_id
      `,
      [companyId]
    );
    console.log(
      `[dry-run] would upsert ${dryCount.rows[0]?.would_project ?? 0} bill_payment allocations; ${unlinked} unlinked (bill not in accounting.bills)`
    );
    await client.query("ROLLBACK");
  } else {
    const res = await client.query(PROJECT_SQL, [companyId]);
    console.log(
      `projected ${res.rowCount ?? 0} bill_payment allocations (source_system='qbo'); ${unlinked} unlinked (bill not in accounting.bills — re-run after bills land)`
    );
    await client.query("COMMIT");
  }
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
