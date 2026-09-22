#!/usr/bin/env tsx
// RETRACTION of gl-fix-03: the Lead withdrew the instruction to post 4 driver_advance
// disbursement debits. R-30.2-A already ruled these 4 historical rows (CA-SEP-61727a46,
// CA-BF-3445cf68, CA-BF-a785bea7, CA-BF-40022039) are a PRE-CONVERSION OPENING BALANCE, not a
// disbursement that failed to post -- posting a fabricated disbursement event for a record whose
// disbursement never happened in this app invents a transaction. Void the 4 JEs gl-fix-03 posted
// (reversing-entry model, never delete) with a cited reason. No new opening-balance posting here --
// that is a separate decision for whoever owns opening balances, not invented in this script.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { voidJournalEntry } from "../../apps/backend/src/accounting/journal-entries.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

// journal_entry_ids posted by gl-fix-03-post-driver-advance-disbursements.ts --execute
const JE_IDS = [
  "3d21c866-3ed5-412f-8ad8-d9c90e1eed01", // CA-BF-3445cf68
  "3885233f-7418-461f-a5bc-e6a3fa3f4702", // CA-BF-a785bea7
  "85a3bd8e-bc5c-457d-8d5f-b316ea04f24a", // CA-BF-40022039
  "e77bc1b0-7bcb-451a-9365-f9d463c0e2e3", // CA-SEP-61727a46
];

const VOID_REASON =
  "RETRACTED per Lead instruction + R-30.2-A: these 4 driver_advances (CA-SEP-61727a46, " +
  "CA-BF-3445cf68, CA-BF-a785bea7, CA-BF-40022039) are a pre-conversion opening balance, not a " +
  "disbursement that failed to post. gl-fix-03 wrongly posted a fabricated disbursement event. " +
  "Voiding to restore the account to its pre-fix state; opening-balance treatment is a separate " +
  "decision, not invented here.";

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  if (!executeFlag) {
    console.log("DRY RUN -- would void:", JE_IDS.join(", "));
    return;
  }

  let voided = 0;
  let failed = 0;
  for (const jeId of JE_IDS) {
    try {
      const result = await voidJournalEntry(USMCA_COMPANY_ID, jeId, VOID_REASON, { userId: OWNER_USER_ID, role: "Owner" });
      console.log(`  VOIDED ${jeId} -> reversing_entry_id=${(result as { reversing_journal_entry_id?: string }).reversing_journal_entry_id ?? "?"}`);
      voided++;
    } catch (err) {
      failed++;
      console.error(`  FAILED ${jeId}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\nEXECUTE done: voided ${voided}, failed ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
