#!/usr/bin/env node
/**
 * Owner-only backfill: set catalogs.items.default_expense_account_id from
 * mdata.qbo_items.payload_json->ExpenseAccountRef via catalogs.accounts.qbo_account_id.
 *
 * Does NOT invent CoA. Unmapped ExpenseAccountRef values stay NULL.
 * Agent must not run against prod — Jorge runs with DATABASE_URL.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/ops/backfill-qbo-item-expense-accounts.mjs
 *   DATABASE_URL=... node scripts/ops/backfill-qbo-item-expense-accounts.mjs --company <uuid>
 *   DATABASE_URL=... node scripts/ops/backfill-qbo-item-expense-accounts.mjs --dry-run
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

const sql = `
WITH mapped AS (
  SELECT
    ci.id AS item_id,
    ci.operating_company_id,
    ca.id AS account_id
  FROM catalogs.items ci
  INNER JOIN mdata.qbo_items qi
    ON qi.operating_company_id = ci.operating_company_id
   AND qi.qbo_id = ci.qbo_item_id
  INNER JOIN catalogs.accounts ca
    ON ca.operating_company_id = ci.operating_company_id
   AND ca.qbo_account_id = qi.payload_json->'ExpenseAccountRef'->>'value'
   AND ca.deactivated_at IS NULL
  WHERE ci.qbo_item_id IS NOT NULL
    AND COALESCE(qi.payload_json->'ExpenseAccountRef'->>'value', '') <> ''
    AND (ci.default_expense_account_id IS DISTINCT FROM ca.id)
    AND ($1::uuid IS NULL OR ci.operating_company_id = $1::uuid)
)
${
  dryRun
    ? `SELECT count(*)::int AS would_update FROM mapped`
    : `UPDATE catalogs.items ci
       SET default_expense_account_id = m.account_id,
           updated_at = now()
       FROM mapped m
       WHERE ci.id = m.item_id
       RETURNING ci.id`
}
`;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const res = await client.query(sql, [companyId]);
  if (dryRun) {
    console.log(`[dry-run] would update ${res.rows[0]?.would_update ?? 0} catalog items`);
  } else {
    console.log(`updated ${res.rowCount ?? 0} catalog items default_expense_account_id`);
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
