/**
 * Lead 2026-10-01 — REHEARSAL ONLY (throwaway Neon branch, never prod): apply + undo one reclassify
 * batch through the real engine on a real posted USMCA expense line, and prove the ledger math.
 * Usage: DATABASE_URL=<branch> POSTING_ID=… TARGET_ACCOUNT_ID=… ACTOR_USER_ID=… npx tsx scripts/ops/2026-10-01-lead-rehearse-reclassify-on-branch.ts
 */
import pg from "pg";
import { assertNotProduction } from "../lib/assert-not-production.mjs";
import { applyReclassify, undoReclassifyBatch } from "../../apps/backend/src/accounting/reclassify/reclassify.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const url = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
await assertNotProduction(client, { label: "rehearse-reclassify" });
const postingId = process.env.POSTING_ID!;
const target = process.env.TARGET_ACCOUNT_ID!;
const actor = { userId: process.env.ACTOR_USER_ID!, role: "Owner" };

async function balance(accountId: string) {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'"); // transaction-local, never session-scoped
  const res = await client.query<{ net: string }>(
    `SELECT coalesce(sum(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS net
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid
      WHERE p.operating_company_id=$1::uuid AND p.account_id=$2::uuid AND je.status='posted'`, [USMCA, accountId]);
  await client.query("ROLLBACK");
  return Number(res.rows[0]!.net);
}
const before = await client.query<{ account_id: string; amount_cents: string; line: string | null }>(
  `SELECT account_id::text, amount_cents::text, source_transaction_line_id AS line FROM accounting.journal_entry_postings WHERE id=$1::uuid`, [postingId]);
const from = before.rows[0]!.account_id; const amt = Number(before.rows[0]!.amount_cents);
const fromBefore = await balance(from); const toBefore = await balance(target);
console.log("BEFORE", { from, fromBefore, target, toBefore, amt });

const res = await applyReclassify({ operating_company_id: USMCA, posting_ids: [postingId], reason: "REHEARSAL on throwaway branch: DEF charged to 5010 belongs on 6300", to_account_id: target }, actor);
console.log("APPLY", JSON.stringify(res, null, 1));
const fromAfter = await balance(from); const toAfter = await balance(target);
console.log("AFTER APPLY", { fromAfter, toAfter, movedFrom: fromBefore - fromAfter, movedTo: toAfter - toBefore });
if (fromBefore - fromAfter !== amt || toAfter - toBefore !== amt) throw new Error("ledger did not move exactly the amount");
const el = await client.query(`SELECT expense_account_uuid::text FROM accounting.expense_lines WHERE id=$1::uuid`, [before.rows[0]!.line]);
console.log("EXPENSE LINE ACCOUNT AFTER APPLY", el.rows[0], "target", target);

const undo = await undoReclassifyBatch({ operating_company_id: USMCA, batch_id: res.batch_id, reason: "REHEARSAL undo" }, actor);
console.log("UNDO", undo);
const fromUndo = await balance(from); const toUndo = await balance(target);
console.log("AFTER UNDO", { fromUndo, toUndo, restored: fromUndo === fromBefore && toUndo === toBefore });
const el2 = await client.query(`SELECT expense_account_uuid::text FROM accounting.expense_lines WHERE id=$1::uuid`, [before.rows[0]!.line]);
console.log("EXPENSE LINE ACCOUNT AFTER UNDO", el2.rows[0], "from", from);
client.release(); await pool.end();
