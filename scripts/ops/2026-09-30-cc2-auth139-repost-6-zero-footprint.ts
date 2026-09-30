#!/usr/bin/env -S npx tsx
/**
 * AUTH-138 -- repost the correct funding entry for 6 factoring advances (invoices 3, 4, 7, 8, 11,
 * 16) whose determined-survivor copy was found, while executing AUTH-137, to have ALSO already
 * been reversed by the same prior undocumented process that produced DEFECT 1. These 6 advances
 * currently have ZERO live funding JE.
 *
 * Does NOT reverse anything -- that already happened. Only reposts the correct entry through the
 * sanctioned engine (postFactoringAdvanceEventInClientTx), reusing each advance's own already-
 * determined-correct reserve/fee/face/wire-fee figures.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth138-repost-6-zero-footprint.ts [--apply]
 * (run from repo root)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-139";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const ROWS: Array<{ invoice: string; fa_id: string; invoice_total_cents: number; reserve_cents: number; fee_cents: number; ach_cents: number }> = [
  { invoice: "3", fa_id: "f2feaa5e-a306-4fe2-88d3-dadf64d766be", invoice_total_cents: 250000, reserve_cents: 3090, fee_cents: 4410, ach_cents: 1000 },
  { invoice: "4", fa_id: "5985201f-b957-4db8-8985-9792d0dc8b6b", invoice_total_cents: 170000, reserve_cents: 2550, fee_cents: 2550, ach_cents: 1000 },
  { invoice: "7", fa_id: "e93a0d50-2082-492b-befd-d29b1d7692f8", invoice_total_cents: 35000, reserve_cents: 502, fee_cents: 548, ach_cents: 0 },
  { invoice: "8", fa_id: "9ed5dc2a-2233-49b7-abab-c5360c877dc4", invoice_total_cents: 52500, reserve_cents: 788, fee_cents: 788, ach_cents: 0 },
  { invoice: "11", fa_id: "f746d306-6c3b-4d6f-baed-1cc8f2b1327c", invoice_total_cents: 70000, reserve_cents: 911, fee_cents: 1189, ach_cents: 0 },
  { invoice: "16", fa_id: "93c0d5b0-480c-4def-9ba6-ceffec6f5de8", invoice_total_cents: 380000, reserve_cents: 5700, fee_cents: 5700, ach_cents: 1000 },
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
  await (process.env.OWNER_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(client, { label: "scripts/ops/2026-09-30-cc2-auth139-repost-6-zero-footprint.ts" });
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
        WHERE a.operating_company_id = $1 AND a.account_number IN ('1090', '1230', '2150', '6300', '6400')
        GROUP BY a.account_number ORDER BY a.account_number`,
      [USMCA]
    );
    console.log("BEFORE:", before.rows);

    let posted = 0;
    const skipped: string[] = [];
    for (const row of ROWS) {
      try {
        const already = await client.query(
          `SELECT 1 FROM accounting.journal_entry_postings jep
             JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
            WHERE jep.source_transaction_type = 'factoring_advance' AND jep.source_transaction_id = $1
              AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL`,
          [row.fa_id]
        );
        if (already.rows.length > 0) {
          console.error(`SKIP invoice ${row.invoice}: a live unreversed funding JE already exists -- already fixed, do not double-post`);
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
              ach_cents: row.ach_cents,
              cash_rsv_cents: 0,
            },
          });
          if (!result?.posted) {
            console.error(`SKIP invoice ${row.invoice}: poster returned not-posted -- ${JSON.stringify(result)}`);
            skipped.push(row.fa_id);
            continue;
          }
        }
        console.log(`${APPLY ? "POSTED" : "WOULD POST"}: invoice ${row.invoice} (${row.fa_id})`);
        posted++;
      } catch (e: any) {
        console.error(`SKIP invoice ${row.invoice}: ${e.code ?? e.message}`);
        skipped.push(row.fa_id);
      }
    }

    const after = await client.query(
      `SELECT a.account_number,
              COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL
        WHERE a.operating_company_id = $1 AND a.account_number IN ('1090', '1230', '2150', '6300', '6400')
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
