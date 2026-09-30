#!/usr/bin/env -S npx tsx
/**
 * AUTH-137 / Owner Order 2 (item 42) -- void the 13 non-surviving duplicate JE copies across the
 * 10 factoring-advance groups whose survivor was determined against Faro's own exports
 * (docs/audit/GUARD-WORKORDERS.md, two findings 2026-09-30). VOID ONLY, no delete.
 *
 * Each void goes through reverseJournalEntryNoFlip -- the same sanctioned engine AUTH-113 used --
 * a mirroring reversal JE, original untouched except reversed_by_je_id linkage. Survivor copies
 * are never touched (not in this list). Every loser JE is re-verified live (still posted, not
 * already voided/reversed, and NOT the survivor) before voiding.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth137-void-13-duplicate-copies.ts [--apply]
 * (run from repo root)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-137";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const LOSERS: Array<{ invoice: string; loser_je_id: string; survivor_je_id: string }> = [
  { invoice: "1", loser_je_id: "03c73353-7557-4db7-bc33-94a7bc9a75ee", survivor_je_id: "ca5c1bd0-4460-4c28-9d38-297d00f2117f" },
  { invoice: "3", loser_je_id: "60fcca1a-95f8-48be-b8dd-5c1d6dd3a338", survivor_je_id: "f018426d-be1a-42e8-a2d6-647b5559590e" },
  { invoice: "3", loser_je_id: "e102528b-959e-4242-8d48-a177dc2344f7", survivor_je_id: "f018426d-be1a-42e8-a2d6-647b5559590e" },
  { invoice: "4", loser_je_id: "1894f3e0-6778-486f-b234-ddff585e33a1", survivor_je_id: "7fdef252-d7e9-493e-9545-5be9c0016e45" },
  { invoice: "4", loser_je_id: "313f3fc1-3b5e-4559-907f-f43cef25455a", survivor_je_id: "7fdef252-d7e9-493e-9545-5be9c0016e45" },
  { invoice: "7", loser_je_id: "73146611-3a24-4755-852f-0c32bbb3ea68", survivor_je_id: "3c87cf68-30cf-4b7e-9ec6-0a92b87c0875" },
  { invoice: "8", loser_je_id: "96f1f238-5344-4e67-90f9-c96e6bf13f5a", survivor_je_id: "f10e48d8-effc-4d0b-9970-ed8f86b9dfe8" },
  { invoice: "11", loser_je_id: "70a293d6-ca2e-4641-8bf7-94ace1f592c8", survivor_je_id: "23e74ab0-18dd-46f4-bd7f-ce24f79b4e67" },
  { invoice: "16", loser_je_id: "e5fcd443-3413-4671-af44-be4de07f9981", survivor_je_id: "7f6fae15-711a-4dff-86d9-c74f630c59af" },
  { invoice: "16", loser_je_id: "6705aca7-d0c5-45ea-ae0f-bc97805b4c36", survivor_je_id: "7f6fae15-711a-4dff-86d9-c74f630c59af" },
  { invoice: "19", loser_je_id: "d8483aff-43d3-4fb4-86c1-d3012b39e70b", survivor_je_id: "b5934a69-e1ef-4377-b863-bf64892f44fb" },
  { invoice: "41", loser_je_id: "a606edad-5940-47e1-ae13-93282c0eaf74", survivor_je_id: "4a0264a3-0f8b-4370-bbf9-29c04e86d817" },
  { invoice: "42", loser_je_id: "abf7ca21-2c93-47e1-a696-e375042fc5e8", survivor_je_id: "92d6c8d3-aa10-419d-8091-23372655ad66" },
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
  const { reverseJournalEntryNoFlip } = await import(
    path.join(ROOT, "apps/backend/src/accounting/journal-entries.service.ts")
  );

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const before = await client.query(
      `SELECT a.account_number,
              COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL
        WHERE a.operating_company_id = $1 AND a.account_number IN ('1090', '1230', '1235', '2150', '6300', '6400')
        GROUP BY a.account_number ORDER BY a.account_number`,
      [USMCA]
    );
    console.log("BEFORE:", before.rows);

    let voided = 0;
    const skipped: string[] = [];
    for (const row of LOSERS) {
      try {
        const check = await client.query(
          `SELECT status, reversed_by_je_id, voided_at FROM accounting.journal_entries WHERE id = $1 AND operating_company_id = $2`,
          [row.loser_je_id, USMCA]
        );
        const je = check.rows[0];
        if (!je) {
          console.error(`SKIP invoice ${row.invoice} loser ${row.loser_je_id}: JE not found`);
          skipped.push(row.loser_je_id);
          continue;
        }
        if (je.reversed_by_je_id || je.voided_at || je.status !== "posted") {
          console.error(`SKIP invoice ${row.invoice} loser ${row.loser_je_id}: already reversed/voided/not posted -- ${JSON.stringify(je)}`);
          skipped.push(row.loser_je_id);
          continue;
        }
        // sanity: never void the survivor
        if (row.loser_je_id === row.survivor_je_id) {
          console.error(`SKIP invoice ${row.invoice}: loser_je_id equals survivor_je_id, refusing`);
          skipped.push(row.loser_je_id);
          continue;
        }

        if (APPLY) {
          const result = await reverseJournalEntryNoFlip(client, {
            operatingCompanyId: USMCA,
            journalEntryId: row.loser_je_id,
            reason: `AUTH-137 void duplicate copy, invoice ${row.invoice}, survivor is ${row.survivor_je_id}`,
            actorUserId: ACTOR_USER_ID,
          });
          console.log(`VOIDED invoice ${row.invoice}: ${row.loser_je_id} -> reversal ${result.reversal.reversal_journal_entry_id}`);
        } else {
          console.log(`WOULD VOID invoice ${row.invoice}: ${row.loser_je_id}`);
        }
        voided++;
      } catch (e: any) {
        console.error(`SKIP invoice ${row.invoice} loser ${row.loser_je_id}: ${e.code ?? e.message}`);
        skipped.push(row.loser_je_id);
      }
    }

    const after = await client.query(
      `SELECT a.account_number,
              COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL
        WHERE a.operating_company_id = $1 AND a.account_number IN ('1090', '1230', '1235', '2150', '6300', '6400')
        GROUP BY a.account_number ORDER BY a.account_number`,
      [USMCA]
    );
    console.log("AFTER (this transaction, before commit):", after.rows);
    console.log(`voided=${voided} skipped=${skipped.length} of ${LOSERS.length} (${skipped.join(",")})`);

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
