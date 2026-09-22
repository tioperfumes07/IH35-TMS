#!/usr/bin/env tsx
// Follow-up to gl-fix-04: the 351 reflush attempts failed with
// "duplicate key value violates unique constraint uq_posting_batches_company_idempotency_key".
// Root cause: accounting.posting_batches has a PARTIAL UNIQUE index on
// (operating_company_id, idempotency_key) WHERE idempotency_key IS NOT NULL -- unique on the key
// itself, not filtered by batch_status. Flipping the voided batch to batch_status='reversed' (as
// gl-fix-04 already did, matching the codebase's own reversal-flow precedent) does NOT free the
// idempotency_key slot; the OLD row still physically holds it, so a repost using the SAME
// deterministic key (fuel_event_id + posting_path never change) collides.
//
// Fix: the reversed batch's idempotency_key is no longer the LIVE posting for this fuel_event --
// null it out (the partial index only applies WHERE idempotency_key IS NOT NULL). This is a
// metadata correction on an already-reversed, already-audited row -- no GL amount changes, no
// data loss (source_transaction_type/id, all journal_entry_postings, and the original JE's
// reversed_by_je_id trail all stay exactly as they are). The reused reflush path
// (reflushUnpostedFuelGlExpenses) then finds these fuel_transaction_ids as unposted again and
// reposts them through the corrected R-30.1-A rail-resolution code.
//
// SAME landmine exists one level down: accounting.journal_entry_postings carries its own PARTIAL
// unique index uq_jep_company_idempotency_line on (operating_company_id, idempotency_key,
// line_sequence) WHERE idempotency_key IS NOT NULL -- the original (now-reversed) batch's OWN
// posting lines still hold the old key, so the repost's new lines collide there too, even after
// the batch-level key is cleared. Null it on those lines as well, same rationale.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { reflushUnpostedFuelGlExpenses } from "../../apps/backend/src/accounting/fuel-posting/reflush-unposted-fuel-gl.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const rows = await client.query<{ batch_id: string; idempotency_key: string | null }>(
    `
      SELECT id::text AS batch_id, idempotency_key
        FROM accounting.posting_batches
       WHERE operating_company_id = $1::uuid
         AND source_transaction_type = 'fuel_event'
         AND batch_status = 'reversed'
         AND idempotency_key IS NOT NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Found ${rows.rowCount} reversed fuel_event batches still holding an idempotency_key.`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("DRY RUN -- would null idempotency_key on each, then reflush.");
    return;
  }

  const jepRes = await client.query(
    `
      UPDATE accounting.journal_entry_postings jep
         SET idempotency_key = NULL, updated_at = now()
        FROM accounting.posting_batches pb
       WHERE jep.posting_batch_id = pb.id
         AND pb.operating_company_id = $1::uuid
         AND pb.source_transaction_type = 'fuel_event'
         AND pb.batch_status = 'reversed'
         AND jep.idempotency_key IS NOT NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Cleared idempotency_key on ${jepRes.rowCount} posting lines.`);

  const res = await client.query(
    `
      UPDATE accounting.posting_batches
         SET idempotency_key = NULL, updated_at = now()
       WHERE operating_company_id = $1::uuid
         AND source_transaction_type = 'fuel_event'
         AND batch_status = 'reversed'
         AND idempotency_key IS NOT NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Cleared idempotency_key on ${res.rowCount} batches.`);
  client.release();
  await pool.end();

  console.log("\nReflushing via reflushUnpostedFuelGlExpenses (reused, existing repost path)...");
  const reflush = await reflushUnpostedFuelGlExpenses({
    operating_company_id: USMCA_COMPANY_ID,
    actor_user_id: OWNER_USER_ID,
    dry_run: false,
    log: {
      warn: (obj, msg) => console.error(`  WARN: ${msg ?? ""} ${JSON.stringify(obj)}`),
      info: (obj, msg) => console.log(`  INFO: ${msg ?? ""} ${JSON.stringify(obj)}`),
    },
  });
  console.log(JSON.stringify(reflush, null, 2));
  if (reflush.errors > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
