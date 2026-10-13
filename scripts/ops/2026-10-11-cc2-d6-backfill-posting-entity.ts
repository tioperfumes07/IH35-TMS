#!/usr/bin/env tsx
/**
 * D6 (Lead order 2026-10-11; ruling 443.35 "(a) fill-once -- set entity + load on the 221 postings where NULL, no
 * reclassification"; AUTH-406) -- every posting a Settlement Creator post causes carries its entity: the customer on
 * A/R + revenue, the driver on labor / A/P / escrow / clearing, the vendor on fuel / expense and the card payable.
 * The writer (posting-line-writer.ts writeLine) now derives it at INSERT time through resolvePostingSourceEntity().
 * This script fills the lines already posted before that fix, through THE SAME resolver -- no hand-written entity
 * mapping, no new journal entry, no amount touched.
 *
 * SAFETY:
 *   - Only rows with entity_uuid IS NULL are touched. accounting.refuse_posting_fact_update allows entity_uuid /
 *     entity_type to be written ONCE from NULL and refuses any repoint, so this fill cannot overwrite anything.
 *   - Every UPDATE is recorded by audit.tg_audit_row on journal_entry_postings.
 *   - HARD CHECK before COMMIT: the company's trial balance and posting count are identical before and after.
 *   - A line the resolver cannot attribute is left NULL and printed by name -- never guessed.
 *
 * Scope: USMCA Creator-document postings (invoice, bill, bill_payment, expense, driver_settlement, driver_advance) created at/after --since (default: the first Creator post of 2026-10-11, 00:50Z).
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-11-cc2-d6-backfill-posting-entity.ts            (dry run)
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-d6-backfill-posting-entity.ts --rehearse (write, check, roll back)
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-406 npx tsx scripts/ops/2026-10-11-cc2-d6-backfill-posting-entity.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { resolvePostingSourceEntity } from "../../apps/backend/src/accounting/posting-line-writer.js";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const apply = process.argv.includes("--apply");
// --rehearse: write every fill, fire deferred constraint triggers, check the trial balance, then ROLL BACK (fork proof).
const rehearse = !apply && process.argv.includes("--rehearse");
const write = apply || rehearse;
const sinceArg = process.argv.find((a) => a.startsWith("--since="));
// The documents a Settlement Creator post writes (the D6 ruling's scope). Relay deposits / fuel events are not Creator postings.
const CREATOR_SOURCES = ["invoice", "bill", "bill_payment", "expense", "driver_settlement", "driver_advance"];
const since = sinceArg ? sinceArg.slice("--since=".length) : "2026-10-11T00:50:00Z";

if (apply) {
  const auth = process.env.OWNER_AUTH_ID ?? "";
  if (auth !== "AUTH-406") {
    console.error(`FAIL: --apply requires OWNER_AUTH_ID=AUTH-406 (got ${JSON.stringify(auth || null)}).`);
    process.exit(1);
  }
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

type Row = {
  id: string;
  source_transaction_type: string | null;
  source_transaction_id: string | null;
  reversal_of_line_id: string | null;
  account_number: string;
  entity_null: boolean;
  load_null: boolean;
  source_load_id: string | null;
};

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  // verify-ops-scripts-assert-not-production: name the target before any write (443.52 C).
  if (apply) await assertIsIntendedProduction(client, { label: "2026-10-11-cc2-d6-backfill-posting-entity.ts" });
  else if (rehearse) await assertNotProduction(client, { label: "2026-10-11-cc2-d6-backfill-posting-entity.ts" });
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls','lucia', true)`);

  const tb = () =>
    client.query<{ n: string; rows: string }>(
      `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text n, count(*)::text rows
         FROM accounting.journal_entry_postings WHERE operating_company_id=$1`,
      [USMCA]
    );
  const before = (await tb()).rows[0];

  const res = await client.query<Row>(
    `SELECT p.id::text, p.source_transaction_type, p.source_transaction_id::text, p.reversal_of_line_id::text, a.account_number,
            (p.entity_uuid IS NULL) AS entity_null, (p.load_id IS NULL) AS load_null,
            accounting.posting_source_load_id(p.source_transaction_type, p.source_transaction_id::text,
                                              p.source_transaction_line_id::text, p.reversal_of_line_id)::text AS source_load_id
       FROM accounting.journal_entry_postings p
       JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE p.operating_company_id = $1 AND (p.entity_uuid IS NULL OR p.load_id IS NULL) AND p.created_at >= $2::timestamptz
        AND p.source_transaction_type = ANY($3::text[])
      ORDER BY p.created_at, p.id`,
    [USMCA, since, CREATOR_SOURCES]
  );

  const filled: Record<string, number> = {};
  const unresolved: Row[] = [];
  let loadsFilled = 0;
  let loadless = 0;
  for (const row of res.rows) {
    // Load: fill once from NULL with the posting's own source document's load (the writer's INSERT rule); a settlement-level
    // aggregate line that spans several loads has none and stays NULL.
    if (row.load_null) {
      if (row.source_load_id) {
        loadsFilled++;
        if (write)
          await client.query(
            `UPDATE accounting.journal_entry_postings SET load_id = $1::uuid
              WHERE id = $2::uuid AND operating_company_id = $3 AND load_id IS NULL`,
            [row.source_load_id, row.id, USMCA]
          );
      } else loadless++;
    }
    if (!row.entity_null) continue;
    const ent = await resolvePostingSourceEntity(client, row);
    if (!ent) {
      unresolved.push(row);
      continue;
    }
    const key = `${row.source_transaction_type}/${row.account_number} -> ${ent.entity_type}`;
    filled[key] = (filled[key] ?? 0) + 1;
    if (write) {
      await client.query(
        `UPDATE accounting.journal_entry_postings SET entity_uuid = $1::uuid, entity_type = $2
          WHERE id = $3::uuid AND operating_company_id = $4 AND entity_uuid IS NULL`,
        [ent.entity_uuid, ent.entity_type, row.id, USMCA]
      );
    }
  }

  console.log(`Scope: ${res.rows.length} USMCA posting(s) with entity or load NULL created since ${since}.`);
  console.log(`Load: ${loadsFilled} filled from the source document; ${loadless} have no single load (settlement-level aggregate).`);
  for (const [k, n] of Object.entries(filled).sort()) console.log(`  fill ${String(n).padStart(4)}  ${k}`);
  console.log(`Unresolved: ${unresolved.length}`);
  for (const u of unresolved) console.log(`  ${u.id} ${u.source_transaction_type} ${u.source_transaction_id} acct ${u.account_number}`);

  if (write) {
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    const left = await client.query<{ n: string; l: string }>(
      `SELECT count(*) FILTER (WHERE entity_uuid IS NULL)::text n,
              count(*) FILTER (WHERE load_id IS NULL AND accounting.posting_source_load_id(source_transaction_type,
                 source_transaction_id::text, source_transaction_line_id::text, reversal_of_line_id) IS NOT NULL)::text l
         FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1 AND created_at >= $2::timestamptz AND source_transaction_type = ANY($3::text[])`,
      [USMCA, since, CREATOR_SOURCES]
    );
    console.log(`Entity NULL in scope after fill: ${left.rows[0].n}; load NULL where the source has one: ${left.rows[0].l}`);
    const after = (await tb()).rows[0];
    if (before.n !== after.n || before.rows !== after.rows) {
      throw new Error(`REFUSED: trial balance or posting count changed. before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    }
    console.log(`Trial balance unchanged: ${after.n} cents across ${after.rows} postings.`);
    if (rehearse) {
      await client.query("ROLLBACK");
      console.log("REHEARSAL -- every fill written and every deferred check fired, then rolled back.");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
  } else {
    await client.query("ROLLBACK");
    console.log("DRY RUN -- rolled back, no writes.");
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
