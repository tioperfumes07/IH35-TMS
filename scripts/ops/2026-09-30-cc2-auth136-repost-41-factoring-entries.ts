#!/usr/bin/env -S npx tsx
/**
 * AUTH-136 / claude/00-POSTING-AUDIT-ROUND-1-FOUR-DEFECTS-FIX-THESE.md DEFECT 1 -- repost the 41
 * factoring-advance funding entries whose net-wire amount was originally misposted to account 6300
 * (Bank Service Charges & Wire Fees) instead of 1090 (Undeposited Funds).
 *
 * All 41 were already reversed by a prior, undocumented repair pass (each reversal's memo reads
 * "repair zero-advance: ach_cents was Net Adv (feed-sep-faro-fas bug)"), leaving these 41 real Faro
 * advances with ZERO net GL footprint right now. This script does NOT reverse anything -- that
 * already happened. It only does the missing step 2: repost the correct entry through the
 * sanctioned engine (postFactoringAdvanceEventInClientTx), reusing each entry's own
 * reserve/fee/face figures (never wrong, only the account for the net-wire leg was), ach_cents=0
 * for all 41 (none carry a genuine separate wire fee).
 *
 * Every row is re-verified live against its ORIGINAL (now-reversed) journal entry's own posted
 * lines before posting -- if live data does not match what was measured when this AUTH was
 * written, that row is skipped and reported, never forced.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth136-repost-41-factoring-entries.ts [--apply]
 * (run from repo root)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-136";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

// Measured live 2026-09-30 -- fa_id, invoice_total_cents (2150 credit), reserve_cents (1230 debit),
// fee_cents (6400 debit), all read from each advance's original (now-reversed) funding JE.
const ROWS: Array<{ fa_id: string; invoice_total_cents: number; reserve_cents: number; fee_cents: number }> = [
  { fa_id: "ddfd1b8c-a20c-460f-b42b-768d0d9ba421", invoice_total_cents: 360000, reserve_cents: 5400, fee_cents: 5400 },
  { fa_id: "27862cbc-9ed8-4ea3-a883-ab9df789b32e", invoice_total_cents: 590000, reserve_cents: 8850, fee_cents: 8850 },
  { fa_id: "b49e47b1-e057-4f96-9626-df9ea2acc6a1", invoice_total_cents: 360000, reserve_cents: 5400, fee_cents: 5400 },
  { fa_id: "fe658d97-002c-4754-bf0a-53cfbee560b3", invoice_total_cents: 490000, reserve_cents: 7350, fee_cents: 7350 },
  { fa_id: "86d9a162-5835-4395-864b-e02ba3ad0c6f", invoice_total_cents: 521700, reserve_cents: 7826, fee_cents: 7826 },
  { fa_id: "ebf46cea-03a3-498c-982f-fcf15007bfbf", invoice_total_cents: 490000, reserve_cents: 7350, fee_cents: 7350 },
  { fa_id: "43bf2fc5-4984-4b56-8d13-7eeaf244d080", invoice_total_cents: 611500, reserve_cents: 9173, fee_cents: 9173 },
  { fa_id: "75e07f0c-5e10-4b92-a0c0-7e0b2de80099", invoice_total_cents: 521000, reserve_cents: 7815, fee_cents: 7815 },
  { fa_id: "7b2da4bc-fcf0-4649-a3a6-ebbac086666c", invoice_total_cents: 415000, reserve_cents: 6225, fee_cents: 6225 },
  { fa_id: "779d5e2d-c4c6-45de-9024-104ffea55344", invoice_total_cents: 110000, reserve_cents: 1650, fee_cents: 1650 },
  { fa_id: "bbc2597b-e740-472d-837d-8fae9935d89c", invoice_total_cents: 440000, reserve_cents: 6600, fee_cents: 6600 },
  { fa_id: "5e38e177-02b5-4d39-841c-b7492781eb9f", invoice_total_cents: 60000, reserve_cents: 900, fee_cents: 900 },
  { fa_id: "449b660c-9c75-4d29-903f-25d4f9e08abf", invoice_total_cents: 570000, reserve_cents: 8550, fee_cents: 8550 },
  { fa_id: "cba06b11-612d-41e6-a1ea-ddd14f005eb0", invoice_total_cents: 570000, reserve_cents: 8550, fee_cents: 8550 },
  { fa_id: "12ed0f66-e912-4987-9af8-f42ecd5bcd98", invoice_total_cents: 440000, reserve_cents: 6600, fee_cents: 6600 },
  { fa_id: "3f679023-18a8-4343-847d-e557e49bb6e9", invoice_total_cents: 325000, reserve_cents: 4875, fee_cents: 4875 },
  { fa_id: "848b0038-c151-4ca4-b938-e44ee863e3ab", invoice_total_cents: 370000, reserve_cents: 5550, fee_cents: 5550 },
  { fa_id: "d0cdf081-f964-4e6d-87db-27f2ecffd120", invoice_total_cents: 490000, reserve_cents: 7350, fee_cents: 7350 },
  { fa_id: "51a844cb-0985-44ff-a2df-49fda17f5373", invoice_total_cents: 440000, reserve_cents: 6600, fee_cents: 6600 },
  { fa_id: "13df2248-64fc-49c9-a756-007a08f4958b", invoice_total_cents: 350000, reserve_cents: 5250, fee_cents: 6250 },
  { fa_id: "e409769c-a618-4233-aa16-6788abfa5cca", invoice_total_cents: 400000, reserve_cents: 6000, fee_cents: 7000 },
  { fa_id: "9d0cf33f-9cbf-4eed-9ee0-51ef072f539a", invoice_total_cents: 330000, reserve_cents: 4950, fee_cents: 4950 },
  { fa_id: "83b34f22-f36e-45c4-b259-39f1c56b09a3", invoice_total_cents: 370000, reserve_cents: 5550, fee_cents: 5550 },
  { fa_id: "dce6834c-624c-40aa-b485-ccb1bcf74c2e", invoice_total_cents: 490000, reserve_cents: 7350, fee_cents: 7350 },
  { fa_id: "c4135326-0d17-49a0-a529-494e21ae4229", invoice_total_cents: 490000, reserve_cents: 7350, fee_cents: 7350 },
  { fa_id: "187d0386-b1e1-4181-9d02-4760478c4f0a", invoice_total_cents: 490000, reserve_cents: 7350, fee_cents: 7350 },
  { fa_id: "3deb5c6b-ede5-4ef1-99a8-14c4e28a4093", invoice_total_cents: 210000, reserve_cents: 3150, fee_cents: 3150 },
  { fa_id: "715871cd-8792-4d42-bd71-67786f690ef4", invoice_total_cents: 230000, reserve_cents: 3450, fee_cents: 3450 },
  { fa_id: "134ed807-5cc9-41a7-8a43-71998d520c25", invoice_total_cents: 490000, reserve_cents: 7350, fee_cents: 7350 },
  { fa_id: "280b0225-eae8-4e35-ba73-d4984c3eba2a", invoice_total_cents: 400000, reserve_cents: 6000, fee_cents: 7000 },
  { fa_id: "94f29401-8c4f-4321-b1ad-20bccf99a87e", invoice_total_cents: 345000, reserve_cents: 5175, fee_cents: 5175 },
  { fa_id: "52d17900-c8d5-4c36-ac82-921a4fc4e573", invoice_total_cents: 440000, reserve_cents: 6600, fee_cents: 6600 },
  { fa_id: "5038df26-f95b-434f-8f57-4b1ab7364b5c", invoice_total_cents: 440000, reserve_cents: 6600, fee_cents: 6600 },
  { fa_id: "89e88642-353c-4c69-a03e-6145560d34af", invoice_total_cents: 685000, reserve_cents: 10275, fee_cents: 10275 },
  { fa_id: "e9f9df8a-a91c-46b4-a5bf-0dced674b933", invoice_total_cents: 320000, reserve_cents: 4800, fee_cents: 4800 },
  { fa_id: "a3d02d96-0c3e-4a4a-a5c2-ff924485bab3", invoice_total_cents: 220000, reserve_cents: 3300, fee_cents: 3300 },
  { fa_id: "afa05f35-b653-41ac-92a0-25feb3fca802", invoice_total_cents: 210000, reserve_cents: 3150, fee_cents: 4150 },
  { fa_id: "eb05c290-4de9-4b47-b9dd-2b50b885cc53", invoice_total_cents: 370000, reserve_cents: 5550, fee_cents: 5550 },
  { fa_id: "3b68e8e7-14ab-4936-b92c-19332231b2c3", invoice_total_cents: 490000, reserve_cents: 7350, fee_cents: 7350 },
  { fa_id: "5c44b184-aecc-4132-8247-7543f14e618a", invoice_total_cents: 412000, reserve_cents: 6180, fee_cents: 6180 },
  { fa_id: "3fb5ed8b-2e05-446f-bc98-a5234947e1d6", invoice_total_cents: 100000, reserve_cents: 1500, fee_cents: 1500 },
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
  const { postFactoringAdvanceEventInClientTx } = await import(
    path.join(ROOT, "apps/backend/src/accounting/factoring-posting/poster.service.ts")
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
        WHERE a.operating_company_id = $1 AND a.account_number IN ('1090', '6300', '2150', '6400', '1230')
        GROUP BY a.account_number ORDER BY a.account_number`,
      [USMCA]
    );
    console.log("BEFORE:", before.rows);

    let posted = 0;
    const skipped: string[] = [];
    for (const row of ROWS) {
      try {
        // Re-verify live: the original (now-reversed) JE still carries these exact figures.
        const check = await client.query(
          `SELECT a.account_number, jep.amount_cents
             FROM accounting.journal_entry_postings jep
             JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
             JOIN catalogs.accounts a ON a.id = jep.account_id
            WHERE jep.source_transaction_type = 'factoring_advance' AND jep.source_transaction_id = $1
              AND je.reversed_by_je_id IS NOT NULL AND je.voided_at IS NULL`,
          [row.fa_id]
        );
        const live = Object.fromEntries(check.rows.map((r: any) => [r.account_number, Number(r.amount_cents)]));
        if (
          live["2150"] !== row.invoice_total_cents ||
          (live["1230"] ?? 0) !== row.reserve_cents ||
          (live["6400"] ?? 0) !== row.fee_cents
        ) {
          console.error(`SKIP ${row.fa_id}: live figures do not match recorded figures -- ${JSON.stringify(live)} vs ${JSON.stringify(row)}`);
          skipped.push(row.fa_id);
          continue;
        }
        // Confirm no LIVE (unreversed) funding JE already exists for this advance (would mean
        // someone already fixed it since this AUTH was written).
        const already = await client.query(
          `SELECT 1 FROM accounting.journal_entry_postings jep
             JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
            WHERE jep.source_transaction_type = 'factoring_advance' AND jep.source_transaction_id = $1
              AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL`,
          [row.fa_id]
        );
        if (already.rows.length > 0) {
          console.error(`SKIP ${row.fa_id}: a live unreversed funding JE already exists -- already fixed, do not double-post`);
          skipped.push(row.fa_id);
          continue;
        }

        if (APPLY) {
          const result = await postFactoringAdvanceEventInClientTx(client, {
            operating_company_id: USMCA,
            factoring_advance_id: row.fa_id,
            actor_user_id: ACTOR_USER_ID,
            funding_figures: {
              invoice_total_cents: row.invoice_total_cents,
              reserve_cents: row.reserve_cents,
              fee_cents: row.fee_cents,
              ach_cents: 0,
              cash_rsv_cents: 0,
            },
          });
          if (!result?.posted) {
            console.error(`SKIP ${row.fa_id}: poster returned not-posted -- ${JSON.stringify(result)}`);
            skipped.push(row.fa_id);
            continue;
          }
        }
        console.log(`${APPLY ? "POSTED" : "WOULD POST"}: ${row.fa_id}`);
        posted++;
      } catch (e: any) {
        console.error(`SKIP ${row.fa_id}: ${e.code ?? e.message}`);
        skipped.push(row.fa_id);
      }
    }

    const after = await client.query(
      `SELECT a.account_number,
              COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL
        WHERE a.operating_company_id = $1 AND a.account_number IN ('1090', '6300', '2150', '6400', '1230')
        GROUP BY a.account_number ORDER BY a.account_number`,
      [USMCA]
    );
    console.log("AFTER (this transaction, before commit):", after.rows);
    console.log(`posted=${posted} skipped=${skipped.length} of ${ROWS.length} (${skipped.join(",")})`);

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
