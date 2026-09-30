#!/usr/bin/env -S npx tsx
/**
 * AUTH-164 -- BANK-STOREMATCH-STALE-VOID-ON-REACCEPT: backfill 8 banking.reconciliation_matches
 * rows left internally inconsistent (match_state='user_matched' AND voided_at IS NOT NULL) by the
 * same pre-code-fix defect AUTH-163 hit and corrected one row of by hand.
 *
 * ROOT CAUSE: storeMatch()'s ON CONFLICT DO UPDATE never cleared voided_at/void_reason/
 * voided_by_user_id on a re-accepted natural-key match (fixed in this same PR). All 8 rows here
 * share the identical 2026-09-28T14:32:43.764542+00 void_reason ("LEAD REVERSAL — persisted
 * outside the explicit accept handler... Re-propose through the engine and accept properly"),
 * then were correctly re-accepted through the real engine at 2026-09-28T16:08:34-46Z (a ~12s
 * batch), landing in the same simultaneously-matched-and-voided state as AUTH-163's row. Verified
 * live, every one: the paired bank_transaction.review_state='matched' with matched_expense_id
 * equal to this row's own ledger_entry_id, and the expense itself status='posted',
 * voided_at IS NULL -- all 8 are genuine, currently-active matches, not stale/orphaned links.
 *
 * Pure metadata: sets ONLY voided_at/void_reason/voided_by_user_id to NULL, ONLY on these 8 ids,
 * ONLY where match_state='user_matched' AND voided_at IS NOT NULL. No JE, no GL, no other column.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth164-backfill-8-stale-void-reconciliation-matches.ts [--apply]
 * (run from repo root)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-164";

const MATCH_IDS = [
  "f3511525-ec85-4539-a2b7-c7ac5aa0f425",
  "48bbc9d1-41e7-482b-a048-6e9d958006a2",
  "a844bd37-521c-418c-86a7-1cd8808ad732",
  "480cd215-a3ed-4276-9e93-e335d24d12d6",
  "690d89c2-7e17-47f2-a53b-a7a470232827",
  "415ef6d5-ad6c-4a09-ad7a-26dc9e349357",
  "7e6a0f08-6363-4026-8e5b-5b34070cb006",
  "3994df3f-608b-4b37-be15-5bb8d720a3dd",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const pre = await client.query<{
      id: string; match_state: string; voided_at: string | null; ledger_entry_kind: string; ledger_entry_id: string;
    }>(
      `SELECT id::text, match_state, voided_at::text, ledger_entry_kind, ledger_entry_id::text
         FROM banking.reconciliation_matches WHERE id = ANY($1::uuid[])`,
      [MATCH_IDS]
    );
    if (pre.rows.length !== MATCH_IDS.length) {
      throw new Error(`expected ${MATCH_IDS.length} rows, found ${pre.rows.length}`);
    }
    for (const r of pre.rows) {
      if (r.match_state !== "user_matched") throw new Error(`${r.id}: match_state is ${r.match_state}, not user_matched -- refusing`);
      if (!r.voided_at) throw new Error(`${r.id}: voided_at already NULL -- refusing (nothing to fix)`);
      // Re-verify the pairing is still genuinely active before touching it.
      const check = await client.query<{ review_state: string; bt_matched_id: string | null; doc_status: string | null; doc_voided_at: string | null }>(
        r.ledger_entry_kind === "expense"
          ? `SELECT bt.review_state, bt.matched_expense_id::text AS bt_matched_id, e.status AS doc_status, e.voided_at::text AS doc_voided_at
               FROM banking.reconciliation_matches rm
               JOIN banking.bank_transactions bt ON bt.id = rm.bank_transaction_id
               LEFT JOIN accounting.expenses e ON e.id = rm.ledger_entry_id
              WHERE rm.id = $1::uuid`
          : `SELECT bt.review_state, bt.matched_factoring_advance_id::text AS bt_matched_id, fa.status AS doc_status, NULL::text AS doc_voided_at
               FROM banking.reconciliation_matches rm
               JOIN banking.bank_transactions bt ON bt.id = rm.bank_transaction_id
               LEFT JOIN accounting.factoring_advances fa ON fa.id = rm.ledger_entry_id
              WHERE rm.id = $1::uuid`,
        [r.id]
      );
      const c = check.rows[0];
      if (!c || c.review_state !== "matched" || c.bt_matched_id !== r.ledger_entry_id || c.doc_voided_at) {
        throw new Error(`${r.id}: no longer a clean active match on re-check (${JSON.stringify(c)}) -- refusing`);
      }
    }
    console.log(`Preflight OK: ${pre.rows.length} rows, all user_matched/voided/re-confirmed active.`);

    const upd = await client.query<{ id: string }>(
      `UPDATE banking.reconciliation_matches
          SET voided_at = NULL, void_reason = NULL, voided_by_user_id = NULL
        WHERE id = ANY($1::uuid[]) AND match_state = 'user_matched' AND voided_at IS NOT NULL
        RETURNING id::text`,
      [MATCH_IDS]
    );
    console.log(`Updated ${upd.rows.length} rows:`, upd.rows.map((r) => r.id).join(", "));
    if (upd.rows.length !== MATCH_IDS.length) {
      throw new Error(`expected to update ${MATCH_IDS.length}, updated ${upd.rows.length} -- refusing to commit a partial result`);
    }

    if (APPLY) {
      await client.query("COMMIT");
      console.log("COMMITTED");
    } else {
      await client.query("ROLLBACK");
      console.log("DRY RUN — rolled back, nothing written");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
