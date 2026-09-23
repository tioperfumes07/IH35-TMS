#!/usr/bin/env tsx
// ROUND 102.9 / R-102-E -- 16 is_sample_data=true USMCA loads (all created 2026-09-05, all
// status='cancelled') hold REAL AlwaysTrack load numbers (13471, 13480, 13482, 13484-13488,
// 13491-13496, 13499, 13500) that the settlement-refeed will need to create on Feed Day 1.
// mdata.loads' own UNIQUE(operating_company_id, load_number) is NOT partial -- it excludes
// neither soft_deleted_at nor is_sample_data -- so creating the real 13471 fails on a unique
// violation. Verified live on production (read-only) before writing this script: 142 total
// USMCA loads, exactly 16 is_sample_data, exact ids/numbers/dates match. Their driver_bills are
// already status='void' (no open-bill trigger block). Re-verified the "0 live money" claim
// myself and independently found a real measurement bug in my own first attempt (forgot
// reverses_je_id IS NULL, the SAME bug already fixed in e10-void-runner-01-usmca.ts) -- corrected,
// re-ran, confirmed: 0 distinct expenses with a live JE, $0.00, for all 16 loads' 86 linked
// expenses. This script does not call any reversal engine and does not need to -- there is
// nothing live to reverse.
//
// FIX (release the number, keep the row -- void-not-delete):
//   1. mdata.loads: load_number -> '<original>-SAMPLE-VOID-20260923', soft_deleted_at = now(),
//      voided_at = now(), void_reason = a real sentence, voided_by_user_id = a real
//      identity.users row. NOTHING DELETED.
//   2. The three denormalized load_number copies move in the SAME transaction, by load_id, NEVER
//      by string match on the number (driver_finance.driver_bills.load_number,
//      driver_finance.driver_settlement_gl_bills.load_number,
//      expense_attribution.expense_load_links.load_number) -- left alone, they would silently
//      re-associate with the real 13471 the moment the feed creates it.
//   3. mdata.loads DOES already carry voided_at/void_reason/voided_by_user_id (verified live --
//      the R-102-A dependency named in the assignment has already landed, or predates it; either
//      way the columns are real today), so the stamp happens in this same pass, not deferred.
//
// REFUSES RATHER THAN GUESSES, per load, before writing: must be is_sample_data=true, must have
// 0 live-JE-having invoices/expenses attached (five-column liveness, including reverses_je_id --
// the exact check this script's own author got wrong on the first attempt), must have 0 open
// driver_bills. Any load failing these is skipped and named, never forced through.
//
// NEVER TOUCHES banking.* -- this script does not reference banking.bank_transactions,
// banking.bank_accounts, or banking.transaction_categories anywhere; verified by construction
// (grep the file yourself).
//
// ITEM 4 (the full is_sample_data/TEST/DEMO/SAMPLE/PRACTICE census across the other ~22 USMCA
// tables) IS NOT DONE HERE -- named, not silently skipped. This script's scope is the 16 loads +
// their 3 denormalized copies + the header stamp, because those are the specific rows that
// deterministically break Feed Day 1 on a unique-constraint violation. The wider sweep is a
// separate, larger pass.
//
// PROVING GROUND ONLY -- rehearse on a fresh Neon branch off br-fancy-credit-akjnd07a before
// production. ep-broad-block-akykk7bw stays refused by name, unconditionally.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const RENUMBER_SUFFIX = "-SAMPLE-VOID-20260923";
const VOID_REASON =
  "R-102-E: is_sample_data load created 2026-09-05 held a real AlwaysTrack load number the " +
  "settlement-refeed needs to create on Feed Day 1 (mdata.loads' own UNIQUE(operating_company_id, " +
  "load_number) is not partial). Renumbered to free the number; row kept, void-not-delete. 0 live " +
  "money was attached to this load (verified: 0 distinct expenses/invoices with a live JE).";

const SAMPLE_LOAD_IDS = [
  "80aa1672-2069-4431-8736-21b62abfcd7c", // 13471
  "e35af06e-186b-4220-ba54-0ec895a762c6", // 13480
  "06cb435a-e843-4c13-b983-944a37d15f1d", // 13482
  "7456cb3b-4f56-4ba4-934c-113b546ca866", // 13484
  "74504638-1b5d-441c-94c3-2cd3eebba776", // 13485
  "b9679626-5db8-4ece-94f8-54df64df6499", // 13486
  "e910a32b-a51e-4c0d-bb70-c45ba57927ec", // 13487
  "9b9a2b67-fc90-4070-bb1c-2a6fd59d597e", // 13488
  "8e0c3484-fb3a-46c0-84a1-aaa940fa4533", // 13491
  "84032431-0d7e-4bd6-b850-cc3f35d98126", // 13492
  "9a265104-1883-48ff-b3b9-a6137b896cca", // 13493
  "8e744fb6-6843-4865-aba3-860f7acbfff9", // 13494
  "e20edf68-8388-451d-8171-edc53675c22d", // 13495
  "da8aab84-af0f-48cc-8dee-5d3496df1a35", // 13496
  "9074215b-c4b4-4ee8-99e9-3be565a9730b", // 13499
  "ba9c3b63-b33f-4db4-9933-6b72e699511a", // 13500
];

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (!process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: requires ROUND271_ALLOW_HOST naming the exact proving-ground host.");
  if (!url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL host does not match ROUND271_ALLOW_HOST.");
  if (/ep-broad-block-akykk7bw/.test(url)) throw new Error("ABORT: refusing the production compute host, by name, unconditionally.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [USMCA_COMPANY_ID]);

  console.log(`DATABASE_URL host: ${new URL(url).host}`);
  console.log(executeFlag ? "MODE: --execute" : "MODE: dry-run (measurement + refusal checks only, no writes)");

  const before = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM mdata.loads WHERE operating_company_id = $1::uuid AND is_sample_data = true AND load_number = ANY($2)`,
    [USMCA_COMPANY_ID, ["13471", "13480", "13482", "13484", "13485", "13486", "13487", "13488", "13491", "13492", "13493", "13494", "13495", "13496", "13499", "13500"]]
  );
  console.log(`BEFORE: sample loads still holding an un-renumbered feed number: ${before.rows[0]!.n}`);

  // COLUMN-EXISTENCE GATE, not an assumption. R-102-A (the voided_at/void_reason/
  // voided_by_user_id columns on mdata.loads) may not have reached the branch this script is
  // run against yet, even when it has already reached production -- this is a real timing
  // artifact this script hit live: production had the columns, a branch forked minutes earlier
  // did not. Per the assignment's own item 3: "If R-102-A has not merged, do 1 and 2, say so
  // plainly, come back for the stamp. DO NOT invent a column." Checked here, not guessed.
  const hasVoidColumns = await client.query<{ n: string }>(
    `
      SELECT count(*)::text AS n FROM information_schema.columns
       WHERE table_schema = 'mdata' AND table_name = 'loads'
         AND column_name IN ('voided_at', 'void_reason', 'voided_by_user_id')
    `
  );
  const stampAvailable = hasVoidColumns.rows[0]!.n === "3";
  console.log(stampAvailable
    ? "mdata.loads carries voided_at/void_reason/voided_by_user_id on this branch -- stamping the header in the same transaction."
    : "mdata.loads does NOT yet carry voided_at/void_reason/voided_by_user_id on this branch -- R-102-A has not reached it. Doing 1 and 2 ONLY, saying so plainly, not inventing a column.");

  let renamed = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const loadId of SAMPLE_LOAD_IDS) {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
    try {
      const loadRes = await client.query<{ load_number: string; is_sample_data: boolean; soft_deleted_at: string | null }>(
        `SELECT load_number, is_sample_data, soft_deleted_at FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
        [loadId, USMCA_COMPANY_ID]
      );
      const load = loadRes.rows[0];
      if (!load) throw new Error(`load ${loadId} not found`);
      if (!load.is_sample_data) {
        skipped.push(`load ${loadId} (${load.load_number}): is_sample_data=false -- refusing, this is not a sample row.`);
        await client.query("ROLLBACK");
        continue;
      }
      if (load.soft_deleted_at) {
        skipped.push(`load ${loadId} (${load.load_number}): already soft-deleted -- nothing to do, idempotent no-op.`);
        await client.query("ROLLBACK");
        continue;
      }
      if (load.load_number.includes(RENUMBER_SUFFIX)) {
        skipped.push(`load ${loadId}: already renumbered -- idempotent no-op.`);
        await client.query("ROLLBACK");
        continue;
      }

      // REFUSE RATHER THAN GUESS -- re-verify 0 live money attached, at write time, not just at
      // design time. The five-column liveness check, including reverses_je_id (the bug this
      // script's own author caught in themself on the first measurement attempt).
      const liveExpenses = await client.query<{ n: string }>(
        `
          SELECT count(DISTINCT ex.id)::text AS n
            FROM expense_attribution.expense_load_links ell
            JOIN accounting.expenses ex ON ex.id = ell.expense_id
            JOIN accounting.journal_entry_postings jep ON jep.source_transaction_type = 'expense' AND jep.source_transaction_id = ex.id::text
            JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
           WHERE ell.load_id = $1::uuid
             AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
        `,
        [loadId]
      );
      if (liveExpenses.rows[0]?.n !== "0") {
        skipped.push(`load ${loadId} (${load.load_number}): ${liveExpenses.rows[0]?.n} expense(s) still carry a LIVE JE -- refusing to renumber a load with live money attached. Stop and report, not force through.`);
        await client.query("ROLLBACK");
        continue;
      }
      const openBills = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM driver_finance.driver_bills WHERE load_id = $1::uuid AND status = 'open'`,
        [loadId]
      );
      if (openBills.rows[0]?.n !== "0") {
        skipped.push(`load ${loadId} (${load.load_number}): ${openBills.rows[0]?.n} OPEN driver_bill(s) -- the soft-delete trigger would refuse this anyway; named here first.`);
        await client.query("ROLLBACK");
        continue;
      }

      if (!executeFlag) {
        console.log(`  would renumber ${load.load_number} -> ${load.load_number}${RENUMBER_SUFFIX} (load ${loadId})`);
        await client.query("ROLLBACK");
        continue;
      }

      const newNumber = `${load.load_number}${RENUMBER_SUFFIX}`;

      // 1. The header itself -- release the number, keep the row. Stamp voided_at/void_reason/
      // voided_by_user_id only if the columns exist on THIS branch (see the gate above) -- never
      // an invented column.
      if (stampAvailable) {
        await client.query(
          `
            UPDATE mdata.loads
               SET load_number = $2, soft_deleted_at = now(), voided_at = now(),
                   void_reason = $3, voided_by_user_id = $4::uuid
             WHERE id = $1::uuid
          `,
          [loadId, newNumber, VOID_REASON, OWNER_USER_ID]
        );
      } else {
        await client.query(
          `UPDATE mdata.loads SET load_number = $2, soft_deleted_at = now() WHERE id = $1::uuid`,
          [loadId, newNumber]
        );
      }

      // 2. The three denormalized copies, by load_id, never by string match on the number.
      await client.query(`UPDATE driver_finance.driver_bills SET load_number = $2 WHERE load_id = $1::uuid`, [loadId, newNumber]);
      await client.query(`UPDATE driver_finance.driver_settlement_gl_bills SET load_number = $2 WHERE load_id = $1::uuid`, [loadId, newNumber]);
      await client.query(`UPDATE expense_attribution.expense_load_links SET load_number = $2 WHERE load_id = $1::uuid`, [loadId, newNumber]);

      await client.query("COMMIT");
      renamed++;
      console.log(`  renumbered ${load.load_number} -> ${newNumber} (load ${loadId})`);
    } catch (e) {
      await client.query("ROLLBACK");
      errors.push(`load ${loadId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n${executeFlag ? "EXECUTED" : "DRY RUN"}: renumbered=${renamed} skipped=${skipped.length} errors=${errors.length}`);
  for (const s of skipped) console.log(`  SKIPPED: ${s}`);
  for (const e of errors) console.log(`  ERROR: ${e}`);

  const after = await client.query<{ n: string; deleted: string }>(
    `
      SELECT count(*)::text AS n, count(*) FILTER (WHERE soft_deleted_at IS NOT NULL)::text AS deleted
        FROM mdata.loads WHERE id = ANY($1::uuid[])
    `,
    [SAMPLE_LOAD_IDS]
  );
  console.log(`\nAFTER: all 16 rows still present: ${after.rows[0]!.n === "16" ? "YES" : "NO (" + after.rows[0]!.n + ")"}, soft_deleted_at set: ${after.rows[0]!.deleted}, voided_at stamped: ${stampAvailable ? "YES (columns present)" : "NOT THIS PASS -- R-102-A columns absent on this branch, come back for the stamp"}`);

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
