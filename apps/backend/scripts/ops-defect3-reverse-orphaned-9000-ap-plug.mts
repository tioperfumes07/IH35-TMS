#!/usr/bin/env -S npx tsx
/**
 * DEFECT 3 (Lead order, 2026-09-30): "9000 Ask My Accountant, 60 postings each way. No plugs."
 *
 * ROOT CAUSE (verified live, USMCA, bypass_rls transaction): a bulk automated action on
 * 2026-09-25 00:27:28-00:29:44 UTC (actor e4117991-d2c0-406d-8cda-74e98d95bccd, the same system
 * actor other reversal scripts in this repo use) reversed 60 original accounting.expenses-sourced
 * journal entries that had been miscoded to account 9000 "Ask My Accountant" suspense, and posted
 * 60 replacement JEs -- each a blanket "Dr 2000 Accounts Payable / Cr 9000 Ask My Accountant" --
 * with a generic "Reversal of journal entry <id>" memo carrying no category, vendor, or finding
 * reference. $29.7663k (2,976.63) gross each side.
 *
 * Live-verified before writing this script: ALL 60 of the replacement JEs' underlying
 * accounting.expenses.source_transaction_id rows are VOIDED (9 posting_status='reversed', 51
 * posting_status='unposted', 0 live, 0 missing). A voided document must never carry a live
 * posted JE (the same invariant scripts/verify-no-voided-doc-has-live-postings.mjs exists to
 * enforce) -- there is no real, current liability behind any of these 60 Accounts Payable debits.
 * This is not a miscategorization needing a category-map resolution (unlike ACCT-F20260925J's
 * earlier, correctly-handled 2-item reclass of EXP-2026-00053/00050 -- that population is
 * unrelated and untouched by this script, confirmed live: those items' own correcting JEs
 * (0f2c79b8/102d28cd, debiting 9000 against 5310/5400) are a SEPARATE, already-resolved trail
 * from ROUND 157 STEP 0 / PR #22643, and are not in the 60-id list below). There is simply
 * nothing to categorize -- the source document is void, so the only correct fix is to reverse
 * the orphaned replacement JE and restore both 2000 and 9000 to their pre-plug state. NO PLUGS:
 * this script assigns no new account, resolves no category guess -- it only undoes a posting
 * that should never have survived its own source document's void.
 *
 * FIX: reverseJournalEntryNoFlip (the one sanctioned, linked, idempotent reversal primitive --
 * same function used by reverse-repost-usmca-settlements.mts) for each of the 60 JE ids below,
 * citing the void-source-expense root cause in the reversal memo. The original is NEVER flipped
 * (status stays 'posted', linkage recorded both ways) -- pure additive reversal, no new GL math.
 *
 * Run: DATABASE_URL=<prod> npx tsx apps/backend/scripts/ops-defect3-reverse-orphaned-9000-ap-plug.mts [--apply]
 */
import pg from "pg";
import { reverseJournalEntryNoFlip } from "../src/accounting/journal-entries.service.js";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // same system actor that created the orphaned JEs
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-138";
const REASON =
  "DEFECT 3 -- source accounting.expenses row is voided (posting_status reversed/unposted); " +
  "this replacement JE (Dr 2000 AP / Cr 9000) was left live with no real liability behind it. " +
  "No category resolved, no plug substituted -- pure reversal of an orphaned posting.";

const JE_IDS = [
  "d86ad8d5-edfd-4ce0-907c-d039b55f0686", "9180c23e-08bd-44ab-a24d-091a24139731",
  "4e6f4117-ad5a-48c0-bf98-fec334c3b72f", "83e2547d-243c-4e5d-86d8-8ea0fe8180fd",
  "78e14293-2d00-4961-85be-02cee17078c5", "9c39dbd2-e23c-40e9-baa1-cccbb6f4e37b",
  "a7a46eef-cdc3-405e-b0ec-874ec65d0408", "caf06ac6-b05c-46c5-a6d3-c030aecd9f3c",
  "03a7a8a5-bdf1-465f-99ad-39bee7a3171d", "a89c23e9-2f51-4d9f-a27f-7f8069f895ba",
  "a401e2a7-cab8-4f6d-9c4b-e5bd21fdc63f", "36dd960f-d32e-4f38-a8c8-17f45fcfc706",
  "6051cf1b-0e60-4a6c-9ff1-347e61f7d23d", "2c78c7c2-b965-4ae0-8e32-a11f551edadf",
  "90c9f2bc-39c3-488c-a1d8-37ebf2df5384", "60c1cc74-558f-449d-ba85-67466570ad42",
  "a25f9a3a-19db-4df5-b7c7-bda316d17234", "c98c7f5f-d932-4804-83b7-4109b38620e9",
  "d742d4fa-fe8f-428d-8ee5-757908eee78f", "eaeb907e-2a75-4609-99ac-4dca35ad2fb6",
  "e4c2d158-7923-418f-ae68-224207be8e22", "a96bab22-ca58-49b8-b355-49bed48d94b9",
  "e55c503e-09de-41f0-9aaa-b11135c50f27", "141c229f-714e-4b3c-9a0c-c95ac4b5645f",
  "24f10173-7dcf-4028-b619-6ae965c2fcc7", "699d8e9a-06b9-4588-b061-b4bd537e923b",
  "6e58489f-de84-490c-b81a-62a7aaa25b57", "9e589f61-b954-4488-8a00-c20538069c27",
  "81540c8f-28c2-4555-a154-d32cbe4d5fe7", "bff89e10-2490-474b-a646-792b003a2100",
  "8e36c588-b170-4978-9ea9-b66c63223104", "cb60eb11-ce10-475a-9fc9-2aaa4b5804cf",
  "98a26ea7-061f-495b-9a3c-e410f456d37b", "7cf650e9-4bea-4c19-b63a-eaec204914bd",
  "580105be-ebb6-4870-9d8c-eb64a4a371f8", "4fda61b8-498c-414d-a2b1-e5a63c1801b8",
  "16225216-f5fd-4340-928e-fab7e8dc8f4a", "236c12f2-96ae-4861-983b-f6630e4cf1b8",
  "985ec585-5344-4bbe-9ae5-6f3578db6e01", "71bfd2da-5620-4dec-a821-b5dcce24ac14",
  "bdf13dfd-a149-473c-96ee-584958900577", "dd6352c5-5168-49bb-b402-559e53ba4ef5",
  "b1edaa37-b39b-4e0b-b59a-200c07d53fe2", "a5562fa7-d2fb-4d71-99db-b35dce2f0631",
  "ddcc8489-9cc2-4e67-8a6b-01fb3c2179b8", "f5c7389f-8ca0-440b-ac2e-49261edbc987",
  "9a8b0c09-fda1-4a78-b634-e7ad22b997e5", "87797674-8d8b-4aaa-b6a6-ac1d67b071ba",
  "da62c69d-5f76-43cf-8ece-2f87396a6a5b", "471d7412-a14b-4453-8e85-98db23120d97",
  "721b769d-b48e-473f-b299-3c070e0d6b8f", "e85601e7-1ad6-4ff9-a177-b0b396fe8c9e",
  "03cede36-7825-42f5-97bd-56aba02dbb81", "935ecdf2-3e5f-480c-86b1-059e8c3dfc67",
  "d300657e-1874-494e-80f5-68624202c3e0", "4f167ad9-6c40-407a-8461-5a8d3d30d8d5",
  "910c4226-b1cc-42ab-9c7f-68440a7fa6bc", "5ea836dd-727b-4eeb-8906-d4bb83a6a951",
  "03136bb9-e17c-4ee3-9ccb-82ae20889bfb", "e890e84f-3130-46af-8da5-fc7e03504737",
];

async function main() {
  if (JE_IDS.length !== 60) throw new Error(`expected 60 JE ids, got ${JE_IDS.length}`);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
      process.exit(1);
    }
  }
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

    // Pre-flight: re-verify every JE is still live (credit to 9000, unreversed) and its source
    // expense is still voided, immediately before touching anything.
    const pre = await client.query<{ id: string; voided: boolean; reversed: boolean; expense_voided: boolean | null }>(
      `SELECT je.id::text,
              (je.voided_at IS NOT NULL) AS voided,
              (je.reversed_by_je_id IS NOT NULL) AS reversed,
              e.voided_at IS NOT NULL AS expense_voided
         FROM accounting.journal_entries je
         JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
              AND jep.source_transaction_type = 'expense'
         LEFT JOIN accounting.expenses e ON e.id = jep.source_transaction_id::uuid
        WHERE je.id = ANY($1::uuid[]) AND je.operating_company_id = $2::uuid`,
      [JE_IDS, OPCO]
    );
    const bad = pre.rows.filter((r) => r.voided || r.reversed || r.expense_voided !== true);
    if (bad.length > 0) {
      console.error("PRE-FLIGHT FAILED -- one or more JEs changed state since this script was written:", JSON.stringify(bad));
      throw new Error("preflight_state_mismatch");
    }
    console.log(`PRE-FLIGHT OK: all ${pre.rows.length} JEs live, unreversed, source expense voided.`);

    const results: Array<{ je_id: string; reversal_je_id: string | null }> = [];
    for (const jeId of JE_IDS) {
      const rev = await reverseJournalEntryNoFlip(client as never, {
        operatingCompanyId: OPCO,
        journalEntryId: jeId,
        reason: REASON,
        actorUserId: ACTOR,
      });
      results.push({ je_id: jeId, reversal_je_id: rev.reversal?.reversal_journal_entry_id ?? null });
    }
    console.log(`Reversed ${results.length} JEs.`);

    const after = await client.query<{ debit_or_credit: string; cnt: string; sum: string }>(
      `SELECT jep.debit_or_credit, count(*) AS cnt, sum(jep.amount_cents) AS sum
         FROM accounting.journal_entry_postings jep
         JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = jep.account_id
        WHERE je.operating_company_id = $1::uuid AND a.account_number = '9000'
          AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
        GROUP BY 1`,
      [OPCO]
    );
    console.log("AFTER -- live 9000 postings remaining (should be empty from this population):", JSON.stringify(after.rows));

    if (APPLY) {
      await client.query("COMMIT");
      console.log("COMMITTED");
    } else {
      await client.query("ROLLBACK");
      console.log("ROLLED BACK -- dry run only");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
