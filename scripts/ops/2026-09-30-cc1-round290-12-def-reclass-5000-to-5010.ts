/**
 * AUTH-156 — ROUND 290.12 correction. Reclassifies EVERY USMCA expense line whose posted account
 * disagrees with its own item's configured default_expense_account_id -- the SAME selector as the
 * CI guard `scripts/verify-expense-line-account-matches-item.mjs`, item-based and direction-agnostic.
 *
 * WHY THIS EXISTS -- GOVERNANCE FAILURE IN THE PRIOR ATTEMPT (AUTH-154)
 * AUTH-154 (ROUND 290.12, run earlier today) selected DEF rows by MEMO TEXT
 * (`memo ILIKE '%DEF%' OR memo ILIKE '%exhaust%'`). Memo is free text a human typed; it missed two
 * real August DEF lines whose memo carried neither string, and it could never have caught the
 * REVERSE direction (three August "Fuel-Reefer-Diesel" lines sitting in 5010 instead of 5000 --
 * their memo has nothing to do with DEF at all). Worse: AUTH-154's own script was never committed
 * to the repository -- a production financial write with no reviewable, reproducible source. This
 * file closes both gaps: the correct item-based selector, committed.
 *
 * THE SELECTOR (identical to the guard -- if this file's WHERE clause ever drifts from the guard's,
 * one of them is wrong):
 *   FROM accounting.expense_lines el
 *   JOIN accounting.expenses e ON e.id = el.expense_id
 *   JOIN catalogs.items i ON i.id = el.item_id
 *  WHERE e.operating_company_id = $1 AND el.item_id IS NOT NULL AND e.voided_at IS NULL
 *    AND i.default_expense_account_id IS DISTINCT FROM el.expense_account_uuid
 *
 * Measured live 2026-09-30: 119 lines / 119 docs / $4,236.57 (every affected doc has exactly one
 * mismatched line, confirmed live -- so per-document reverse+repost is equivalent to per-line):
 *   2026-08 Fuel-DEF-Diesel Exhaust Fluid   line=5000 item=5010   2 posted
 *   2026-08 Fuel-Reefer-Diesel              line=5010 item=5000   3 unposted   <- REVERSE direction
 *   2026-09 Driver Reimbursement-Fuel Def   line=5000 item=5010   1 posted
 *   2026-09 Fuel-DEF-Diesel Exhaust Fluid   line=5000 item=5010   104 posted + 9 unposted
 * Totals: 107 posted, 12 unposted.
 *
 * TWO MECHANISMS, NEVER MIXED:
 *   POSTED docs  -> reversePostedSourceTransactionInClientTx (unwind the wrong-account batch) then,
 *                   AFTER correcting the line's own expense_account_uuid, postSourceTransactionInClientTx
 *                   with posting_purpose:'repost', repost_revision:1 -- the SAME two-call pattern
 *                   apps/backend/src/banking/bank-ledger-repoint-remediation.service.ts already uses
 *                   for exactly this "wrong account resolved at post time" shape. No new GL math; the
 *                   engine rebuilds the lines itself once the source data is corrected.
 *   UNPOSTED docs -> no GL exists yet, so there is nothing to reverse. One set-based UPDATE of
 *                   expense_account_uuid, one transaction.
 *
 * Idempotent: re-running finds nothing (the selector requires a live mismatch; once corrected, a
 * row no longer qualifies). Every row is its own try/catch in the posted loop -- one bad row never
 * strands the rest.
 *
 * AUTHORIZATION: OWNER_AUTH_ID=AUTH-156, docs/bus/OWNER-AUTHORIZATIONS.md, verified via
 * scripts/verify-owner-authorization.mjs (run from repo root).
 *
 * USAGE
 *   DRY_RUN=1 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-round290-12-def-reclass-5000-to-5010.ts
 *   OWNER_AUTH_ID=AUTH-156 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-round290-12-def-reclass-5000-to-5010.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required for a real write; refusing a production financial write without an OPEN authorization on main.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

const SELECT_MISMATCHES_SQL = `
  SELECT el.id::text AS line_id, el.expense_id::text, i.item_name, i.default_expense_account_id::text AS target_account,
         el.expense_account_uuid::text AS current_account, e.posting_status::text, el.amount_cents::text,
         to_char(e.transaction_date, 'YYYY-MM') AS month
    FROM accounting.expense_lines el
    JOIN accounting.expenses e ON e.id = el.expense_id
    JOIN catalogs.items i ON i.id = el.item_id
   WHERE e.operating_company_id = $1::uuid
     AND el.item_id IS NOT NULL
     AND e.voided_at IS NULL
     AND i.default_expense_account_id IS DISTINCT FROM el.expense_account_uuid
   ORDER BY month, i.item_name, e.posting_status
`;

async function main() {
  const { postSourceTransactionInClientTx, reversePostedSourceTransactionInClientTx, PostingEngineError } = await import(
    "../../apps/backend/src/accounting/posting-engine.service.js"
  );

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const readClient = await pool.connect();
  let rows: Array<{
    line_id: string;
    expense_id: string;
    item_name: string;
    target_account: string;
    current_account: string | null;
    posting_status: string;
    amount_cents: string;
    month: string;
  }>;
  try {
    await readClient.query("BEGIN");
    await readClient.query("RESET ROLE");
    await readClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const res = await readClient.query(SELECT_MISMATCHES_SQL, [USMCA_ID]);
    rows = res.rows;
    await readClient.query("COMMIT");
  } finally {
    readClient.release();
  }

  const byMonthItem = new Map<string, { lines: number; docs: Set<string>; cents: number; posted: number; unposted: number }>();
  for (const r of rows) {
    const key = `${r.month} ${r.item_name} (${r.current_account ?? "NULL"}->${r.target_account})`;
    const agg = byMonthItem.get(key) ?? { lines: 0, docs: new Set(), cents: 0, posted: 0, unposted: 0 };
    agg.lines += 1;
    agg.docs.add(r.expense_id);
    agg.cents += Number(r.amount_cents);
    if (r.posting_status === "posted") agg.posted += 1;
    else agg.unposted += 1;
    byMonthItem.set(key, agg);
  }
  console.log(`=== PLAN: ${rows.length} mismatched lines across ${new Set(rows.map((r) => r.expense_id)).size} documents ===`);
  for (const [key, agg] of byMonthItem) {
    console.log(`  ${key}: ${agg.lines} lines / ${agg.docs.size} docs / $${(agg.cents / 100).toFixed(2)} (${agg.posted} posted, ${agg.unposted} unposted)`);
  }

  const posted = rows.filter((r) => r.posting_status === "posted");
  const unposted = rows.filter((r) => r.posting_status !== "posted");

  if (DRY_RUN) {
    console.log(`\nDRY_RUN=1 -- would reverse+repost ${posted.length} posted lines, direct-UPDATE ${unposted.length} unposted lines. Zero writes.`);
    await pool.end();
    return;
  }

  // UNPOSTED: one set-based UPDATE, one transaction.
  if (unposted.length > 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      const lineIds = unposted.map((r) => r.line_id);
      const res = await client.query(
        `UPDATE accounting.expense_lines el
            SET expense_account_uuid = i.default_expense_account_id, updated_at = now()
           FROM catalogs.items i
          WHERE el.item_id = i.id AND el.id = ANY($1::uuid[])
        RETURNING el.id::text`,
        [lineIds]
      );
      await client.query("COMMIT");
      console.log(`UNPOSTED: ${res.rows.length} of ${unposted.length} lines corrected via direct UPDATE.`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("UNPOSTED UPDATE FAILED, rolled back:", (err as Error).message);
      process.exitCode = 1;
    } finally {
      client.release();
    }
  }

  // POSTED: reverse -> correct the line -> repost, per document, own transaction each.
  const results: Array<Record<string, unknown>> = [];
  for (const row of posted) {
    const plan: Record<string, unknown> = { expense_id: row.expense_id, line_id: row.line_id, item_name: row.item_name, from: row.current_account, to: row.target_account };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

      let reversedJeId: string | null = null;
      try {
        const rev = await reversePostedSourceTransactionInClientTx(
          client,
          { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: row.expense_id },
          { userId: SYSTEM_ACTOR_USER_ID },
          new Date().toISOString().slice(0, 10)
        );
        reversedJeId = rev.journal_entry_id;
      } catch (revErr) {
        if (!(revErr instanceof PostingEngineError) || revErr.code !== "SOURCE_NOT_FOUND") throw revErr;
        // Nothing live to reverse (claimed posted but no batch) -- fall through, correct the line,
        // then post fresh as initial_post below rather than a repost.
      }

      await client.query(
        `UPDATE accounting.expense_lines el
            SET expense_account_uuid = i.default_expense_account_id, updated_at = now()
           FROM catalogs.items i
          WHERE el.item_id = i.id AND el.id = $1::uuid`,
        [row.line_id]
      );

      const repost = await postSourceTransactionInClientTx(
        client,
        {
          operating_company_id: USMCA_ID,
          source_transaction_type: "expense",
          source_transaction_id: row.expense_id,
          posting_purpose: reversedJeId ? "repost" : "initial_post",
          repost_revision: reversedJeId ? 1 : undefined,
        },
        { userId: SYSTEM_ACTOR_USER_ID }
      );

      if (!repost.posted || !repost.journal_entry_id) {
        throw new Error(`repost failed -- posted=${repost.posted} reason=${(repost as { reason?: string }).reason}`);
      }

      await client.query("COMMIT");
      plan.status = "CORRECTED";
      plan.reversed_je_id = reversedJeId;
      plan.new_je_id = repost.journal_entry_id;
      console.log(`  -> ${row.expense_id}: reversed=${reversedJeId ?? "(none)"} reposted=${repost.journal_entry_id}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      plan.status = `FAILED -- ${err instanceof Error ? err.message : String(err)}`;
      console.error(`  -> ${row.expense_id}: ${plan.status}`);
    } finally {
      client.release();
    }
    results.push(plan);
  }

  const failedCount = results.filter((r) => String(r.status).startsWith("FAILED")).length;
  console.log(`\n=== POSTED SUMMARY: ${results.length - failedCount} of ${results.length} corrected, ${failedCount} failed ===`);
  console.log(JSON.stringify(results, null, 2));
  await pool.end();
  if (failedCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
