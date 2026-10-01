/**
 * AUTH-194 — ROUND 315 (FINAL) step 0: the 16 USMCA bank deposits that were matched to factoring advances go back
 * to the review worklist through the CANONICAL unmatch primitive (void.service.ts unmatchBankTransactionById — the
 * same reset every void cascade uses: status pending_categorization, review_state for_review, every matched_* /
 * categorization_* / linked_entity_id cleared), plus one audit row per line.
 *
 * Why after the delete: AUTH-193 (applied 2026-10-01 16:09Z, before the FINAL order arrived) only nulled
 * matched_factoring_advance_id so the advances could be deleted; review_state stayed 'matched' on all 16 — and
 * match.service refuses to re-match a 'matched' row, so the owner could not match these deposits to his purchases.
 * The 16 are identified from audit.row_changes of that transaction (old matched_factoring_advance_id), not guessed.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cc2-auth194-unmatch-16-faro-bank-lines.ts [--rehearse | --apply]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const REHEARSE = !APPLY && process.argv.includes("--rehearse");
const AUTH_ID = "AUTH-194";
const ACTOR = "00000000-0000-4000-8000-000000000001";
const EXPECTED_ROWS = 16;
const REASON = "ROUND 315 step 0: factoring clean slate (AUTH-193) -- deposit returned to review for the owner's own purchase match";

const TARGETS = `
  SELECT DISTINCT ON (b.id) b.id::text, b.transaction_date::date::text AS d, b.amount_cents::text AS cents, b.status, b.review_state,
         rc.old_data->>'matched_factoring_advance_id' AS old_advance_id
    FROM audit.row_changes rc
    JOIN banking.bank_transactions b ON b.id::text = rc.row_pk
   WHERE rc.schema_name = 'banking' AND rc.table_name = 'bank_transactions'
     AND rc.changed_at BETWEEN '2026-10-01 16:05Z' AND '2026-10-01 16:12Z'
     AND rc.old_data->>'matched_factoring_advance_id' IS NOT NULL
     AND b.operating_company_id = $1::uuid
   ORDER BY b.id, rc.changed_at`;

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
  const { unmatchBankTransactionById } = await import("../../apps/backend/src/accounting/void.service.js");
  const client = new pg.Client({ connectionString: url, statement_timeout: 60000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    if (APPLY) await assertIsIntendedProduction(client);
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const rows = (await client.query<{ id: string; d: string; cents: string; status: string; review_state: string; old_advance_id: string }>(TARGETS, [USMCA])).rows;
    rows.sort((a, b) => a.d.localeCompare(b.d));
    for (const r of rows) console.log(`  before ${r.id} ${r.d} $${(Number(r.cents) / 100).toFixed(2)} status=${r.status} review=${r.review_state}`);
    if (rows.length !== EXPECTED_ROWS) {
      await client.query("ROLLBACK");
      console.error(`REFUSED: expected ${EXPECTED_ROWS} rows, found ${rows.length}`);
      process.exit(1);
    }
    if (!APPLY && !REHEARSE) {
      await client.query("ROLLBACK");
      console.log(`DRY RUN: would reset ${rows.length} bank lines via unmatchBankTransactionById. --rehearse or --apply.`);
      return;
    }
    for (const r of rows) {
      const ok = await unmatchBankTransactionById(client, USMCA, r.id, { userId: ACTOR, reason: REASON });
      if (!ok) throw new Error(`unmatch returned false for ${r.id}`);
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
        "banking.bank_transaction_unmatched", "info",
        JSON.stringify({ auth: AUTH_ID, operating_company_id: USMCA, bank_transaction_id: r.id, transaction_date: r.d, amount_cents: Number(r.cents),
          prior_review_state: r.review_state, prior_matched_factoring_advance_id: r.old_advance_id, reason: REASON }),
        `CC-2-${AUTH_ID}`,
      ]);
    }
    const after = (await client.query<{ id: string; status: string; review_state: string }>(
      `SELECT id::text, status, review_state FROM banking.bank_transactions WHERE id = ANY($1::uuid[]) ORDER BY transaction_date`, [rows.map((r) => r.id)]
    )).rows;
    for (const a of after) console.log(`  after  ${a.id} status=${a.status} review=${a.review_state}`);
    if (after.some((a) => a.review_state !== "for_review" || a.status !== "pending_categorization")) throw new Error("reset did not land on every row");
    if (REHEARSE) {
      await client.query("ROLLBACK");
      console.log("REHEARSAL complete, rolled back — nothing written.");
      return;
    }
    await client.query("COMMIT");
    console.log(`APPLIED under ${AUTH_ID}: ${rows.length} bank lines back to review; ${rows.length} audit rows (source CC-2-${AUTH_ID}).`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

await main();
process.exit(0);
