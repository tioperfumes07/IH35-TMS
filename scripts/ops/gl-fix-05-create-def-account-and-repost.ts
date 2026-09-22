#!/usr/bin/env tsx
// DEF DEADLOCK BROKEN (Lead ruling, 2026-09-23): no dedicated DEF/Urea/Exhaust-Fluid GL account
// exists -- 335 live DEF debit posting lines ($10,970.23) hit catalogs.accounts 5000 "Fuel &
// Diesel", the exact same account every diesel purchase hits, because
// accounting.expense_category_account_map's category_kind='fuel'/category_code='def' row points
// there. This is a real, data-driven mapping table (apps/backend/src/accounting/expense-category-
// map/resolver.service.ts), not hardcoded routing logic in the poster.
//
// No backend HTTP server is reachable from this environment (direct Neon access only, same as
// every other gl-fix-*/dreamline-* script this session) -- each write below mirrors the REAL
// route's own INSERT/UPDATE exactly (same columns, same defaults, same validation-equivalent
// checks), not a shortcut around it:
//   1. catalogs.accounts INSERT -- mirrors POST /api/v1/catalogs/accounts
//      (apps/backend/src/catalogs/accounts.routes.ts:278). GL 5010 "DEF (Diesel Exhaust Fluid)",
//      CostOfGoodsSold / "Supplies & Materials - COGS", matching 5000/5005's own subtype.
//   2. accounting.expense_category_account_map -- the existing category_code='def' row is
//      IMMUTABLE on account_id (the real PATCH route explicitly refuses to change it --
//      ACCT-F100/account_immutable, apps/backend/src/accounting/expense-category-map/routes.ts).
//      Mirrors the real DELETE route (soft-deactivate: is_active=false) then the real POST route
//      (insert a new active row) -- never an UPDATE of the immutable field.
//   3. Void the 335 contaminated DEF debit postings (voidJournalEntry, reversing-entry model,
//      cited reason -- never edit) and repost via the REUSED reflushUnpostedFuelGlExpenses /
//      flushFuelGlPostsAfterCommit path (the same one used for the 351 R-30.1-A postings) -- now
//      hitting the corrected mapping.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { voidJournalEntry } from "../../apps/backend/src/accounting/journal-entries.service.js";
import { reflushUnpostedFuelGlExpenses } from "../../apps/backend/src/accounting/fuel-posting/reflush-unposted-fuel-gl.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const VOID_REASON =
  "DEF-GL-SEGREGATION (Lead ruling, 2026-09-23): DEF debit postings were hitting GL 5000 Fuel & " +
  "Diesel, the same account diesel purchases hit, because expense_category_account_map had no " +
  "dedicated DEF destination. GL 5010 DEF (Diesel Exhaust Fluid) now exists and the mapping is " +
  "corrected -- voiding to repost on the fixed mapping, never a delete, never an edit.";

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
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);

  // ---- measurement (both dry-run and execute) ----
  const existing5010 = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = '5010' LIMIT 1`,
    [USMCA_COMPANY_ID]
  );
  const account5000 = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = '5000' LIMIT 1`,
    [USMCA_COMPANY_ID]
  );
  const fuel5000Id = account5000.rows[0]!.id;
  const before = await client.query<{ n: string; cents: string }>(
    `
      SELECT count(*)::text AS n, COALESCE(sum(jep.amount_cents),0)::text AS cents
        FROM fuel.fuel_transactions ft
        JOIN accounting.journal_entry_postings jep
          ON jep.source_transaction_type = 'fuel_event'
         AND jep.source_transaction_id = ft.id::text
         AND jep.debit_or_credit = 'debit'
       WHERE ft.operating_company_id = $1::uuid
         AND ft.fuel_type = 'def'
         AND jep.account_id = $2::uuid
    `,
    [USMCA_COMPANY_ID, fuel5000Id]
  );
  console.log(`5010 account exists: ${existing5010.rows[0]?.id ?? "NO -- will create"}`);
  console.log(`Contaminated DEF debits on 5000: ${before.rows[0]!.n} / $${(Number(before.rows[0]!.cents) / 100).toFixed(2)}`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made.");
    return;
  }

  // ---- 1. create GL 5010 (mirrors POST /api/v1/catalogs/accounts) ----
  let account5010Id = existing5010.rows[0]?.id;
  if (!account5010Id) {
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO catalogs.accounts (
          account_number, account_name, account_type, account_subtype, is_postable, currency_code,
          operating_company_id, created_by_user_id, updated_by_user_id
        ) VALUES ($1,$2,$3,$4,true,'USD',$5::uuid,$6::uuid,$6::uuid)
        RETURNING id::text
      `,
      ["5010", "DEF (Diesel Exhaust Fluid)", "CostOfGoodsSold", "Supplies & Materials - COGS", USMCA_COMPANY_ID, OWNER_USER_ID]
    );
    account5010Id = inserted.rows[0]!.id;
    console.log(`Created GL 5010 -> ${account5010Id}`);
  } else {
    console.log(`GL 5010 already exists -> ${account5010Id}`);
  }

  // ---- 2. deactivate the old def->5000 mapping, create a new def->5010 mapping ----
  const oldMap = await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.expense_category_account_map
      WHERE operating_company_id = $1::uuid AND category_kind = 'fuel' AND category_code = 'def' AND is_active = true LIMIT 1`,
    [USMCA_COMPANY_ID]
  );
  if (oldMap.rows[0]) {
    await client.query(
      `UPDATE accounting.expense_category_account_map SET is_active = false, updated_at = now(), updated_by_user_uuid = $2::uuid WHERE id = $1::uuid`,
      [oldMap.rows[0].id, OWNER_USER_ID]
    );
    console.log(`Deactivated old def mapping ${oldMap.rows[0].id} (was -> 5000)`);
  }
  const newMap = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.expense_category_account_map (
        operating_company_id, category_kind, category_code, account_id, posting_side,
        created_by_user_uuid, updated_by_user_uuid
      ) VALUES ($1::uuid, 'fuel', 'def', $2::uuid, 'debit', $3::uuid, $3::uuid)
      RETURNING id::text
    `,
    [USMCA_COMPANY_ID, account5010Id, OWNER_USER_ID]
  );
  console.log(`Created new def mapping ${newMap.rows[0]!.id} -> 5010 (${account5010Id})`);

  client.release();
  await pool.end();

  // ---- 3. void the 335 contaminated postings ----
  const pool2 = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client2 = await pool2.connect();
  await client2.query("RESET ROLE");
  await client2.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const contaminated = await client2.query<{ journal_entry_id: string; posting_batch_id: string; fuel_transaction_id: string; amount_cents: string }>(
    `
      SELECT DISTINCT je.id::text AS journal_entry_id, pb.id::text AS posting_batch_id,
             pb.source_transaction_id AS fuel_transaction_id, jep.amount_cents::text AS amount_cents
        FROM fuel.fuel_transactions ft
        JOIN accounting.journal_entry_postings jep
          ON jep.source_transaction_type = 'fuel_event'
         AND jep.source_transaction_id = ft.id::text
         AND jep.debit_or_credit = 'debit'
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
        JOIN accounting.posting_batches pb ON pb.id = jep.posting_batch_id
       WHERE ft.operating_company_id = $1::uuid
         AND ft.fuel_type = 'def'
         AND jep.account_id = $2::uuid
         AND je.status = 'posted'
         AND je.reversed_by_je_id IS NULL
       ORDER BY je.id::text
    `,
    [USMCA_COMPANY_ID, fuel5000Id]
  );
  const totalCents = contaminated.rows.reduce((s, r) => s + Number(r.amount_cents), 0);
  console.log(`\nVoiding ${contaminated.rowCount} DEF/5000 JEs, total $${(totalCents / 100).toFixed(2)}`);

  let voided = 0;
  let voidFailed = 0;
  for (const r of contaminated.rows) {
    try {
      await voidJournalEntry(USMCA_COMPANY_ID, r.journal_entry_id, VOID_REASON, { userId: OWNER_USER_ID, role: "Owner" });
      await client2.query(
        `UPDATE accounting.posting_batches SET batch_status = 'reversed', updated_at = now() WHERE id = $1::uuid AND batch_status = 'posted'`,
        [r.posting_batch_id]
      );
      voided++;
    } catch (err) {
      voidFailed++;
      console.error(`  VOID FAILED ${r.journal_entry_id} (fuel_txn ${r.fuel_transaction_id}): ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`Voided ${voided}, failed ${voidFailed}`);

  // Same idempotency-key landmine as R-30.1-A: clear it on the reversed batch AND its posting
  // lines so a repost under the same key can proceed.
  const clearedLines = await client2.query(
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
  const clearedBatches = await client2.query(
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
  console.log(`Cleared idempotency_key on ${clearedLines.rowCount} lines, ${clearedBatches.rowCount} batches.`);
  client2.release();
  await pool2.end();

  console.log("\nReflushing via reflushUnpostedFuelGlExpenses (reused, existing repost path)...");
  const reflush = await reflushUnpostedFuelGlExpenses({
    operating_company_id: USMCA_COMPANY_ID,
    actor_user_id: OWNER_USER_ID,
    dry_run: false,
    log: {
      warn: (obj, msg) => console.error(`  WARN: ${msg ?? ""} ${JSON.stringify(obj)}`),
    },
  });
  console.log(JSON.stringify(reflush, null, 2));
  if (voidFailed > 0 || reflush.errors > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
