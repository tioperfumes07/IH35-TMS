#!/usr/bin/env npx tsx
/**
 * ROUND 236/248 — populate accounting.expenses_review_queue (migration 202614560000) with the 77
 * AUTH-089-voided expenses that carry no vendor_document_number. Idempotent: ON CONFLICT
 * (source_expense_id) DO NOTHING, safe to re-run. Also backfills claimed_duplicate_expense_id/memo
 * for any row missing it (the specific live row AUTH-089's (load, amount) match claimed this
 * expense duplicated).
 *
 * Usage: OWNER_AUTH_ID=AUTH-129 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-29-cc1-populate-expenses-review-queue.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
{
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required");
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], {
    stdio: "inherit",
  });
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  if (process.env.OWNER_AUTH_ID !== "AUTH-129") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-129");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const inserted = await client.query(
      `INSERT INTO accounting.expenses_review_queue (operating_company_id, source_expense_id, load_id, load_number, transaction_date, amount_cents, memo)
         SELECT e.operating_company_id, e.id, e.load_id, l.load_number, e.transaction_date, e.total_amount_cents, e.memo
           FROM accounting.expenses e JOIN mdata.loads l ON l.id = e.load_id
          WHERE e.operating_company_id = $1::uuid AND e.void_reason LIKE 'AUTH-089%' AND e.vendor_document_number IS NULL
       ON CONFLICT (source_expense_id) DO NOTHING
       RETURNING id`,
      [USMCA]
    );
    console.log(`Inserted: ${inserted.rowCount}`);

    const claimed = await client.query(
      `UPDATE accounting.expenses_review_queue q
          SET claimed_duplicate_expense_id = e2.id, claimed_duplicate_memo = e2.memo, updated_at = now()
         FROM accounting.expenses e2
        WHERE e2.load_id = q.load_id AND e2.total_amount_cents = q.amount_cents
          AND e2.voided_at IS NULL AND e2.id <> q.source_expense_id
          AND q.operating_company_id = $1::uuid AND q.claimed_duplicate_expense_id IS NULL`,
      [USMCA]
    );
    console.log(`Backfilled claimed_duplicate: ${claimed.rowCount}`);

    const total = await client.query(
      `SELECT count(*)::int AS n, count(claimed_duplicate_expense_id)::int AS with_claim
         FROM accounting.expenses_review_queue WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    console.log("Totals:", total.rows[0]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAIL", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
