#!/usr/bin/env tsx
// GL 5010 RETIRED (Lead ruling ROUND 86, 2026-09-23): "GL 5010 IS RETIRED. MY EARLIER RULING IS
// DEAD... DEF, reefer fuel and washout are ITEMS. 5010, 5160 and 5170 are not created, not
// mapped, not cited. Fuel items roll up to 5000 Fuel & Diesel." Read live against the real QBO
// company file: 126 active items / 20 categories, fuel is THREE ITEMS (Fuel-Truck Diesel,
// Fuel-Reefer-Diesel, Fuel-DEF-Diesel Exhaust Fluid) under one category rolling to 5000 -- there
// is no DEF account and no reefer account in the company file we clone.
//
// Ruling, verbatim: "CC-3 OWNS THE RETIREMENT: deactivate 5010 (void-not-delete, it keeps its
// history), repoint expense_category_account_map def -> the DEF ITEM -> 5000... If 5010 carries
// live postings, they are transaction rows and the purge deletes them -- do not repost them.
// Retire the account and let the feed rebuild through the item."
//
// This is the exact reverse of scripts/ops/gl-fix-05-create-def-account-and-repost.ts (which
// created 5010 and repointed def->5010 under the withdrawn Round 67-era ruling this session).
// Unlike gl-fix-05, this script does NOT touch any existing journal_entry_postings on 5010 --
// those are transaction rows the purge deletes; reposting them here would be exactly the
// transaction-row work Round 85/86 forbid.
//
// No backend HTTP server reachable from this environment -- both writes below mirror the REAL
// routes' own UPDATE statements exactly (same columns, same guards):
//   1. catalogs.accounts deactivate -- mirrors POST /api/v1/catalogs/accounts/:id/deactivate
//      (apps/backend/src/catalogs/accounts.routes.ts:548-591): UPDATE ... SET deactivated_at =
//      now() WHERE id=$1 AND deactivated_at IS NULL, refuses if is_locked.
//   2. accounting.expense_category_account_map repoint -- account_id is IMMUTABLE on this table
//      (apps/backend/src/accounting/expense-category-map/routes.ts:337-339, "account_immutable").
//      Mirrors the real DELETE route (soft-deactivate: is_active=false) then the real PATCH route
//      toggling is_active=true on the PRE-EXISTING def->5000 row that gl-fix-05 itself
//      deactivated (reactivating existing history, never inserting a duplicate row) -- the
//      unique-active-mapping-per-category constraint requires the old row go inactive first.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);

  // ---- measurement (both dry-run and execute) ----
  const account5010 = await client.query<{ id: string; deactivated_at: string | null; is_locked: boolean }>(
    `SELECT id::text, deactivated_at, is_locked FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = '5010' LIMIT 1`,
    [USMCA_COMPANY_ID]
  );
  const account5000 = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = '5000' LIMIT 1`,
    [USMCA_COMPANY_ID]
  );
  if (!account5010.rows[0]) {
    console.log("GL 5010 does not exist on USMCA -- nothing to retire. Exiting.");
    client.release();
    await pool.end();
    return;
  }
  const account5010Id = account5010.rows[0].id;
  const fuel5000Id = account5000.rows[0]!.id;
  console.log(`GL 5010 = ${account5010Id} (deactivated_at=${account5010.rows[0].deactivated_at}, is_locked=${account5010.rows[0].is_locked})`);
  console.log(`GL 5000 = ${fuel5000Id}`);

  const activeMap = await client.query<{ id: string; account_id: string }>(
    `SELECT id::text, account_id::text FROM accounting.expense_category_account_map
      WHERE operating_company_id = $1::uuid AND category_kind = 'fuel' AND category_code = 'def' AND is_active = true LIMIT 1`,
    [USMCA_COMPANY_ID]
  );
  const inactive5000Map = await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.expense_category_account_map
      WHERE operating_company_id = $1::uuid AND category_kind = 'fuel' AND category_code = 'def'
        AND account_id = $2::uuid AND is_active = false LIMIT 1`,
    [USMCA_COMPANY_ID, fuel5000Id]
  );
  console.log(`Active def mapping: ${activeMap.rows[0]?.id ?? "none"} -> ${activeMap.rows[0]?.account_id ?? "n/a"}`);
  console.log(`Pre-existing inactive def->5000 mapping to reactivate: ${inactive5000Map.rows[0]?.id ?? "NONE FOUND -- will insert new"}`);

  const livePostings = await client.query<{ n: string; cents: string }>(
    `
      SELECT count(*)::text AS n, COALESCE(sum(jep.amount_cents),0)::text AS cents
        FROM accounting.journal_entry_postings jep
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       WHERE jep.account_id = $1::uuid
         AND je.status = 'posted'
         AND je.reversed_by_je_id IS NULL
    `,
    [account5010Id]
  );
  console.log(
    `Live postings still on 5010 (NOT touched -- transaction rows, purge deletes them): ${livePostings.rows[0]!.n} / $${(Number(livePostings.rows[0]!.cents) / 100).toFixed(2)}`
  );

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made.");
    return;
  }

  // ---- 1. deactivate GL 5010 (mirrors POST /api/v1/catalogs/accounts/:id/deactivate) ----
  if (account5010.rows[0].is_locked) {
    throw new Error("ABORT: GL 5010 is_locked=true -- cannot deactivate, matches the real route's 423 account_is_locked refusal.");
  }
  if (!account5010.rows[0].deactivated_at) {
    await client.query(
      `UPDATE catalogs.accounts SET deactivated_at = now(), updated_by_user_id = $2::uuid WHERE id = $1::uuid AND deactivated_at IS NULL`,
      [account5010Id, OWNER_USER_ID]
    );
    console.log(`Deactivated GL 5010 (${account5010Id}).`);
  } else {
    console.log(`GL 5010 already deactivated at ${account5010.rows[0].deactivated_at}.`);
  }

  // ---- 2. repoint expense_category_account_map def -> 5000 ----
  if (activeMap.rows[0] && activeMap.rows[0].account_id === account5010Id) {
    await client.query(
      `UPDATE accounting.expense_category_account_map SET is_active = false, updated_at = now(), updated_by_user_uuid = $2::uuid WHERE id = $1::uuid`,
      [activeMap.rows[0].id, OWNER_USER_ID]
    );
    console.log(`Deactivated def->5010 mapping ${activeMap.rows[0].id}.`);
  }
  if (inactive5000Map.rows[0]) {
    await client.query(
      `UPDATE accounting.expense_category_account_map SET is_active = true, updated_at = now(), updated_by_user_uuid = $2::uuid WHERE id = $1::uuid`,
      [inactive5000Map.rows[0].id, OWNER_USER_ID]
    );
    console.log(`Reactivated pre-existing def->5000 mapping ${inactive5000Map.rows[0].id}.`);
  } else {
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.expense_category_account_map (
          operating_company_id, category_kind, category_code, account_id, posting_side,
          created_by_user_uuid, updated_by_user_uuid
        ) VALUES ($1::uuid, 'fuel', 'def', $2::uuid, 'debit', $3::uuid, $3::uuid)
        RETURNING id::text
      `,
      [USMCA_COMPANY_ID, fuel5000Id, OWNER_USER_ID]
    );
    console.log(`No pre-existing def->5000 row found -- inserted new mapping ${inserted.rows[0]!.id} -> 5000.`);
  }

  client.release();
  await pool.end();
  console.log("\nDone. 5010's own historical postings were NOT touched -- they purge with every other transaction row.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
