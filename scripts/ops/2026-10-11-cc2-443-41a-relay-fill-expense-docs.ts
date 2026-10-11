#!/usr/bin/env tsx
/**
 * Lead 443.41 A (AUTH-411): every Relay fill ALREADY POSTED (a live journal entry whose postings carry
 * source_transaction_type 'fuel_event' + the integrations.relay_fuel_transactions id) gets its accounting.expenses
 * DOCUMENT through the engine — adoptRelayFillExpenseDocument — adopting THAT SAME journal entry. Nothing posts: no new
 * JE, no amount, account or side changes; trial balance and posting count asserted unchanged before COMMIT.
 * Idempotent: a fill whose entry already has a live document is skipped.
 *
 * Usage:
 *   DATABASE_URL=<db>   npx tsx scripts/ops/2026-10-11-cc2-443-41a-relay-fill-expense-docs.ts                 (dry run)
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-41a-relay-fill-expense-docs.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-411 npx tsx scripts/ops/2026-10-11-cc2-443-41a-relay-fill-expense-docs.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { adoptRelayFillExpenseDocument } from "../../apps/backend/src/fuel/fuel-expense-document.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-411") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-411 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const metrics = async (label: string) => {
  const r = (await client.query<Record<string, string>>(
    `WITH fills AS (
       SELECT DISTINCT p.journal_entry_uuid je
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
        WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'fuel_event'
          AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
          AND EXISTS (SELECT 1 FROM integrations.relay_fuel_transactions r WHERE r.id::text = p.source_transaction_id::text))
     SELECT (SELECT count(*) FROM fills)::text relay_fill_jes,
            (SELECT count(*) FROM fills f WHERE NOT EXISTS (SELECT 1 FROM accounting.expenses e
               WHERE e.operating_company_id = $1::uuid AND e.journal_entry_id = f.je AND e.deleted_at IS NULL))::text fill_jes_without_document,
            (SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0)
               FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
               JOIN catalogs.accounts a ON a.id = jep.account_id
              WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL AND a.account_number = '5000'
                AND NOT EXISTS (SELECT 1 FROM driver_finance.settlement_line_item_splits g2 WHERE g2.adjusting_journal_entry_id = je.id))::text gl_5000_net,
            (SELECT COALESCE(SUM(el.amount_cents),0) FROM accounting.expenses e JOIN accounting.expense_lines el ON el.expense_id = e.id
               JOIN catalogs.accounts a ON a.id = el.expense_account_uuid
              WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.posting_status = 'posted' AND a.account_number = '5000')::text expense_lines_5000,
            (SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)
               FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid)::text tb,
            (SELECT count(*) FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid)::text postings,
            (SELECT count(*) FROM accounting.journal_entries WHERE operating_company_id = $1::uuid)::text jes`,
    [USMCA])).rows[0]!;
  console.log(`${label}: ${JSON.stringify(r)}`);
  return r;
};

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const before = await metrics("BEFORE");
  const todo = (await client.query<{ je: string; fill: string }>(
    `SELECT DISTINCT p.journal_entry_uuid::text je, p.source_transaction_id::text fill
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'fuel_event'
        AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
        AND EXISTS (SELECT 1 FROM integrations.relay_fuel_transactions r WHERE r.id::text = p.source_transaction_id::text)
        AND NOT EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.operating_company_id = $1::uuid AND e.journal_entry_id = je.id AND e.voided_at IS NULL)
      ORDER BY 1`, [USMCA])).rows;
  const by: Record<string, number> = {};
  for (const t of todo) {
    const r = await adoptRelayFillExpenseDocument(client as never, { operating_company_id: USMCA, relay_fill_id: t.fill, journal_entry_id: t.je, requesting_user_uuid: OWNER });
    by[r.outcome] = (by[r.outcome] ?? 0) + 1;
    if (r.outcome === "refused") console.log(`  REFUSED je ${t.je} fill ${t.fill}: ${r.reason}`);
  }
  console.log(`Relay fill entries without a document: ${todo.length} -> ${JSON.stringify(by)}`);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  const after = await metrics("AFTER");
  if (before.tb !== after.tb || before.postings !== after.postings || before.jes !== after.jes)
    throw new Error("REFUSED: trial balance, posting count or JE count changed — a document must never post");
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else { await client.query("ROLLBACK"); console.log("DRY RUN — rolled back."); }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
