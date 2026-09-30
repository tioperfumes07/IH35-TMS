#!/usr/bin/env -S npx tsx
/**
 * AUTH-162 -- ROUND 282.3/282.4 residual: backfill voided_by_user_id on 24 accounting.invoices
 * rows whose ledger is correctly all-dead (no live postings, no financial risk) but whose header
 * never got a real voided_by_user_id stamped, per verify-void-is-whole.mjs's "1-silent-void" class.
 *
 * ROOT CAUSE (fixed in the same PR, apps/backend/src/dispatch/cancellation.service.ts): the
 * load-cancellation cascade's raw UPDATE on accounting.invoices set status/voided_at/void_reason/
 * updated_by_user_id but never voided_by_user_id, even though the real actor (userId) was in
 * scope the whole time. All 24 rows share this exact cascade (ROUND 153 item 1, 2026-09-25,
 * "Pre-Faro TRANSPORTATION/QBO, not USMCA" reclassification). audit.row_changes/audit.audit_events
 * confirm the real actor for every one of these 24 voids is e4117991-d2c0-406d-8cda-74e98d95bccd
 * (Owner, tioperfumes07@gmail.com) -- the SAME actor every sibling artifact of this exact cascade
 * (fuel_transactions, driver_bills) already correctly recorded as voided_by_user_id.
 *
 * Pure metadata backfill: sets ONLY voided_by_user_id, ONLY where it is currently NULL, ONLY on
 * these exact 24 ids. No JE, no GL, no other column touched.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth162-backfill-24-invoice-voided-by-user-id.ts [--apply]
 * (run from repo root)
 */
import pg from "pg";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-162";
const REAL_ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const INVOICE_IDS = [
  "5417d83c-a264-4b1a-92b2-a3b8b2dbbe57",
  "49c44322-4660-4212-bbae-4965198ebea7",
  "f6be884a-1ca2-4afe-abb0-0757ac42e2e6",
  "707f94b8-d2e0-4c8d-99ef-734f41c71e21",
  "27b6a6e5-6649-4a43-bee7-46d6e9f8dca5",
  "0fdc1b7f-c897-42e1-b5ee-ee8cb81e9f55",
  "4901cb98-c8c9-44e4-89bd-ecaa9791ff15",
  "7d6d0ea3-f06d-4d08-a4e8-6e907902df7b",
  "18c041cb-380a-4a2e-bd54-9197e88d2e86",
  "eef162b6-91b3-4e82-ba53-d5da4f6d767e",
  "341db418-13ab-4fc4-862e-5da3e654a085",
  "967af04d-4626-4416-8016-c12fefb9b62e",
  "8152b9b7-a616-497f-b6fd-dc3d1e820148",
  "5ccbd80b-10f9-4716-acf4-e4e327342b0d",
  "b3bf27c8-6544-4767-8879-1badeb42d561",
  "6dbbd241-815a-4a28-8b90-adbde2feee5c",
  "413aa999-c465-4129-afc6-65126c0a7508",
  "1dc4c262-3f48-4aec-8cbd-95675899e58c",
  "78037cce-d86d-4615-9f1c-eb94c19d7b14",
  "da51e218-463f-45cb-afa0-13e396ba18ea",
  "6635babf-c7d4-48cb-affa-37e4c3f7f2d5",
  "0cc2a96c-0631-42dc-8a59-0dca7d45c25d",
  "3beb791b-30e6-4c13-8099-cecc7f077941",
  "317da69a-0057-4e68-8311-189f83b209f2",
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

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    // Preflight: every id must be voided, ledger all-dead (no live JE), and currently NULL voider.
    const pre = await client.query<{
      id: string; display_id: string; voided_at: string | null; voided_by_user_id: string | null; live_jes: string;
    }>(
      `
        SELECT d.id::text, d.display_id, d.voided_at::text, d.voided_by_user_id::text,
               (
                 SELECT count(*)::int FROM accounting.journal_entry_postings p
                 JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
                 WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id::uuid = d.id
                   AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
                   AND je.reverses_je_id IS NULL AND p.reversed_by_line_id IS NULL
               ) AS live_jes
        FROM accounting.invoices d
        WHERE d.id = ANY($1::uuid[]) AND d.operating_company_id = $2::uuid
      `,
      [INVOICE_IDS, USMCA]
    );
    if (pre.rows.length !== INVOICE_IDS.length) {
      throw new Error(`expected ${INVOICE_IDS.length} rows, found ${pre.rows.length}`);
    }
    for (const r of pre.rows) {
      if (!r.voided_at) throw new Error(`${r.display_id} is not voided -- refusing`);
      if (r.voided_by_user_id) throw new Error(`${r.display_id} already has a voided_by_user_id (${r.voided_by_user_id}) -- refusing`);
      if (Number(r.live_jes) > 0) throw new Error(`${r.display_id} has ${r.live_jes} LIVE journal entries -- refusing, this script is metadata-only`);
    }
    console.log(`Preflight OK: ${pre.rows.length} invoices, all voided/all-dead-ledger/currently-NULL voider.`);

    const upd = await client.query<{ id: string; display_id: string }>(
      `
        UPDATE accounting.invoices
           SET voided_by_user_id = $1::uuid
         WHERE id = ANY($2::uuid[]) AND operating_company_id = $3::uuid
           AND voided_at IS NOT NULL AND voided_by_user_id IS NULL
        RETURNING id::text, display_id
      `,
      [REAL_ACTOR, INVOICE_IDS, USMCA]
    );
    console.log(`Updated ${upd.rows.length} rows:`, upd.rows.map((r) => r.display_id).join(", "));
    if (upd.rows.length !== INVOICE_IDS.length) {
      throw new Error(`expected to update ${INVOICE_IDS.length}, updated ${upd.rows.length} -- refusing to commit a partial result`);
    }

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
