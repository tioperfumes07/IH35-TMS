#!/usr/bin/env tsx
// FUEL-DEDUPE-04 -- the GL consequence of fuel-dedupe-03 (8 additional confirmed duplicate fuel
// rows archived via the Lead's looser Round-43-follow-up matching rule). Same pattern as
// fuel-dedupe-02: checked live BEFORE closing, all 8 archived rows carried a posted, unreversed
// fuel_event GL posting -- reversed via the EXISTING voidJournalEntry engine, no new GL math.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { voidJournalEntry } from "../../apps/backend/src/accounting/journal-entries.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

// journal_entry_uuid values live-queried for the 8 rows fuel-dedupe-03 archived.
const JOURNAL_ENTRY_IDS: string[] = [
  "19a1ecf4-8df1-47ff-9c4a-96a930c8a417",
  "f80a4b17-dec0-474d-aee2-082fca7a6e94",
  "47b645e7-5b85-47b1-8567-050d1c8bfe1c",
  "c47d779d-6291-4934-a5c8-3313c6b8e46d",
  "2c2d5c86-037c-4cb0-99f1-a726b0b782f3",
  "9a712dd3-c99b-40ed-82b2-d3e661baaf41",
  "689b3c6f-0edb-4326-9181-c07496831024",
  "2600e2bc-e3b0-4e09-8634-e94128f107a1",
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("ABORT: DATABASE_URL required.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");
  const dryRun = !process.argv.includes("--execute");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });

  console.log(`fuel-dedupe-04: ${dryRun ? "DRY RUN" : "EXECUTE"} -- ${JOURNAL_ENTRY_IDS.length} JE(s) targeted for reversal`);

  let voided = 0;
  let skipped = 0;
  for (const jeId of JOURNAL_ENTRY_IDS) {
    if (dryRun) {
      console.log(`  WOULD VOID ${jeId}`);
      voided += 1;
      continue;
    }
    try {
      const result = await voidJournalEntry(
        USMCA_COMPANY_ID,
        jeId,
        "FUEL-DEDUPE-03 (2026-09-22, Round 43 follow-up item 1): reverses the GL posting for a fuel.fuel_transactions row archived as a confirmed duplicate via the looser same-unit/card/driver +-1day +-1gal/+-$2 rule, evidence per row in fuel-dedupe-03's own ARCHIVE_LIST.",
        { userId: OWNER_USER_ID, role: "Owner" }
      );
      console.log(`  VOIDED ${jeId} -> reversal ${JSON.stringify(result)}`);
      voided += 1;
    } catch (err) {
      console.error(`  FAILED ${jeId}: ${(err as Error).message}`);
      skipped += 1;
    }
  }

  console.log(`\nfuel-dedupe-04: ${voided} voided, ${skipped} failed.`);

  const client = await pool.connect();
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const stillLive = await client.query<{ n: string }>(
    `SELECT count(*) AS n FROM accounting.journal_entries
      WHERE id = ANY($1::uuid[]) AND status = 'posted' AND reversed_by_je_id IS NULL`,
    [JOURNAL_ENTRY_IDS]
  );
  console.log(`fuel-dedupe-04: re-check -- ${stillLive.rows[0].n} of ${JOURNAL_ENTRY_IDS.length} targeted JEs still unreversed.`);

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
