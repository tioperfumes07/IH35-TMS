#!/usr/bin/env node
/**
 * Owner-only backfill: project the QBO Purchase mirror (mdata.qbo_purchases) into the expense subledger
 * accounting.expenses (qbo_purchase_id set) + accounting.expense_lines — a one-shot catch-up equivalent to
 * the scheduler's qbo_purchases_project stage (qbo-purchases-puller.ts projectPurchasesToExpenses), but
 * runnable standalone with DATABASE_URL. Idempotent (header upsert on the partial-unique
 * uq_expenses_company_qbo_purchase_id; line upsert on UNIQUE(expense_id,line_sequence) — delete-free per
 * void-not-delete).
 *
 * PARALLEL BOOKS: SUBLEDGER ONLY. posting_status stays 'unposted' — NO GL/journal is written. QuickBooks
 * owns the GL for qbo-sourced rows; the posting engine additionally refuses to post them
 * (EXPENSE_POST_GL_REFUSED). Never invents CoA; unmapped AccountRef values leave expense_account_uuid NULL.
 *
 * PREREQUISITE: Stage 1 (mirror) must have populated mdata.qbo_purchases first (scheduler tick with
 * QBO_PURCHASES_MIRROR_PULL_ENABLED ON for the entity, or a manual pull). This script does NOT call QBO.
 *
 * Agent must NOT run against prod — Jorge runs with DATABASE_URL (Neon).
 *
 * Usage:
 *   DATABASE_URL=... node scripts/ops/backfill-qbo-purchases-expenses.mjs
 *   DATABASE_URL=... node scripts/ops/backfill-qbo-purchases-expenses.mjs --company <uuid>
 *   DATABASE_URL=... node scripts/ops/backfill-qbo-purchases-expenses.mjs --dry-run
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

// 1) Header upsert — QBO Purchase mirror -> accounting.expenses (subledger).
const HEADER_SQL = `
INSERT INTO accounting.expenses (
  operating_company_id, qbo_purchase_id, vendor_uuid, transaction_date,
  total_amount_cents, memo, status, posting_status, qbo_sync_pending, is_active, created_at, updated_at
)
SELECT
  m.operating_company_id,
  m.qbo_id,
  v.id,
  COALESCE(m.txn_date, CURRENT_DATE),
  m.total_cents,
  m.private_note,
  'posted', 'unposted', false, true, now(), now()
FROM mdata.qbo_purchases m
LEFT JOIN mdata.vendors v
  ON v.operating_company_id = m.operating_company_id
 AND v.qbo_vendor_id = m.entity_qbo_id
 AND (m.entity_type IS NULL OR m.entity_type = 'Vendor')
WHERE m.active = true
  AND m.total_cents > 0
  AND ($1::uuid IS NULL OR m.operating_company_id = $1::uuid)
ON CONFLICT (operating_company_id, qbo_purchase_id) WHERE qbo_purchase_id IS NOT NULL
DO UPDATE SET
  vendor_uuid = EXCLUDED.vendor_uuid,
  transaction_date = EXCLUDED.transaction_date,
  total_amount_cents = EXCLUDED.total_amount_cents,
  memo = EXCLUDED.memo,
  is_active = true,
  updated_at = now()
RETURNING id
`;

// 2) Line upsert — QBO Purchase.Line[] (positive AccountBasedExpenseLineDetail lines) -> expense_lines.
//    row_number() makes line_sequence contiguous after skipping zero/negative lines.
const LINES_SQL = `
WITH src AS (
  SELECT
    e.id AS expense_id,
    e.operating_company_id,
    ln.ord AS orig_ord,
    (ln.elem->>'Amount')::numeric AS amt,
    ln.elem->>'Description' AS description,
    ln.elem->'AccountBasedExpenseLineDetail'->'AccountRef'->>'value' AS account_qbo_id
  FROM accounting.expenses e
  JOIN mdata.qbo_purchases m
    ON m.operating_company_id = e.operating_company_id
   AND m.qbo_id = e.qbo_purchase_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.payload_json->'Line', '[]'::jsonb))
    WITH ORDINALITY AS ln(elem, ord)
  WHERE e.qbo_purchase_id IS NOT NULL
    AND COALESCE((ln.elem->>'Amount')::numeric, 0) > 0
    AND ($1::uuid IS NULL OR e.operating_company_id = $1::uuid)
),
seq AS (
  SELECT
    src.*,
    row_number() OVER (PARTITION BY src.expense_id ORDER BY src.orig_ord)::int AS line_sequence
  FROM src
)
INSERT INTO accounting.expense_lines (
  expense_id, line_sequence, amount, amount_cents, description, expense_account_uuid, ps_category_qbo_id, section
)
SELECT
  s.expense_id,
  s.line_sequence,
  s.amt,
  round(s.amt * 100)::bigint,
  s.description,
  ca.id,
  s.account_qbo_id,
  'B'
FROM seq s
LEFT JOIN catalogs.accounts ca
  ON ca.operating_company_id = s.operating_company_id
 AND ca.qbo_account_id = s.account_qbo_id
 AND ca.deactivated_at IS NULL
ON CONFLICT (expense_id, line_sequence)
DO UPDATE SET
  amount = EXCLUDED.amount,
  amount_cents = EXCLUDED.amount_cents,
  description = EXCLUDED.description,
  expense_account_uuid = EXCLUDED.expense_account_uuid,
  ps_category_qbo_id = EXCLUDED.ps_category_qbo_id
RETURNING expense_id
`;

// 3) Synthesize a single header-total line for expenses whose QBO Purchase carried no usable positive line.
const SYNTH_LINE_SQL = `
INSERT INTO accounting.expense_lines (
  expense_id, line_sequence, amount, amount_cents, description, section
)
SELECT
  e.id,
  1,
  (e.total_amount_cents / 100.0),
  e.total_amount_cents,
  e.memo,
  'B'
FROM accounting.expenses e
WHERE e.qbo_purchase_id IS NOT NULL
  AND ($1::uuid IS NULL OR e.operating_company_id = $1::uuid)
  AND NOT EXISTS (SELECT 1 FROM accounting.expense_lines l WHERE l.expense_id = e.id)
ON CONFLICT (expense_id, line_sequence) DO NOTHING
RETURNING expense_id
`;

const DRYRUN_SQL = `
SELECT
  (SELECT count(*) FROM mdata.qbo_purchases m
     WHERE m.active = true AND m.total_cents > 0
       AND ($1::uuid IS NULL OR m.operating_company_id = $1::uuid)) AS mirror_rows_eligible,
  (SELECT count(*) FROM accounting.expenses e
     WHERE e.qbo_purchase_id IS NOT NULL
       AND ($1::uuid IS NULL OR e.operating_company_id = $1::uuid)) AS expenses_already_projected
`;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

  if (dryRun) {
    const res = await client.query(DRYRUN_SQL, [companyId]);
    const r = res.rows[0] ?? {};
    console.log(
      `[dry-run] mirror rows eligible=${r.mirror_rows_eligible ?? 0}; expenses already projected=${r.expenses_already_projected ?? 0} (no writes)`
    );
    await client.query("COMMIT");
  } else {
    const header = await client.query(HEADER_SQL, [companyId]);
    const lines = await client.query(LINES_SQL, [companyId]);
    const synth = await client.query(SYNTH_LINE_SQL, [companyId]);
    await client.query("COMMIT");
    console.log(
      `projected expenses (upserted headers)=${header.rowCount ?? 0}; expense lines upserted=${lines.rowCount ?? 0}; synthesized total-lines=${synth.rowCount ?? 0}`
    );
  }
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
