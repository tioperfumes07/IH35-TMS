#!/usr/bin/env -S npx tsx
/**
 * AUTH-160 -- correct invoice_total_cents on 4 factoring_advances rows (FAC-2026-00048/63/64/82)
 * to match their own notes.FARO_FEES.purchase value.
 *
 * Discovered running verify-ldt-4-factoring-money.mjs immediately after ROUND 285.2.1-R reinstated
 * these 4 (AUTH-140): advance_amount_cents + reserve_amount_cents + factor_fee_cents +
 * wire_fee_cents + cash_rsv_cents != invoice_total_cents on all 4. AUTH-113 (2026-09-28) had
 * already found and named this exact "notes.purchase != invoice_total_cents" mismatch on these
 * same 4 rows and refused to touch them -- it stands unfixed until now.
 *
 * Confirmed by direct read of each row's own notes field (Faro's own original reported breakdown,
 * FARO_FEES JSON) that invoice_total_cents is the ONLY wrong field -- the other 4 header fields
 * (advance/reserve/fee/wire/cash_rsv) already reconcile exactly to notes.purchase, and the LIVE GL
 * (journal_entry_postings, confirmed by direct query) already used notes.purchase's value for the
 * 2150 credit and 1090 debit -- so no GL is wrong, only this one header display/derived field.
 * This is a metadata correction (Law 280.0.b: no journal entry, correct the document), not a GL
 * change -- no JE is touched by this script.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth151-fix-4-stale-invoice-total-cents.ts [--apply]
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
const AUTH_ID = "AUTH-160";

const CORRECTIONS: Array<{ id: string; display_id: string; correct_invoice_total_cents: number }> = [
  { id: "43bf2fc5-4984-4b56-8d13-7eeaf244d080", display_id: "FAC-2026-00048", correct_invoice_total_cents: 611500 },
  { id: "7b2da4bc-fcf0-4649-a3a6-ebbac086666c", display_id: "FAC-2026-00063", correct_invoice_total_cents: 415000 },
  { id: "5c44b184-aecc-4132-8247-7543f14e618a", display_id: "FAC-2026-00064", correct_invoice_total_cents: 412000 },
  { id: "e9f9df8a-a91c-46b4-a5bf-0dced674b933", display_id: "FAC-2026-00082", correct_invoice_total_cents: 320000 },
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
  await (process.env.OWNER_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(client, { label: "scripts/ops/2026-09-30-cc2-auth160-fix-4-stale-invoice-total-cents.ts" });

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    for (const rec of CORRECTIONS) {
      const pre = await client.query<{
        invoice_total_cents: string;
        reserve_amount_cents: string;
        factor_fee_cents: string;
        wire_fee_cents: string;
        cash_rsv_cents: string;
        advance_amount_cents: string;
        notes: string;
      }>(
        `SELECT invoice_total_cents::text, reserve_amount_cents::text, factor_fee_cents::text,
                wire_fee_cents::text, cash_rsv_cents::text, advance_amount_cents::text, notes
           FROM accounting.factoring_advances WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
        [rec.id, USMCA]
      );
      const row = pre.rows[0];
      if (!row) throw new Error(`${rec.display_id}: not found`);
      const sum =
        Number(row.advance_amount_cents) +
        Number(row.reserve_amount_cents) +
        Number(row.factor_fee_cents) +
        Number(row.wire_fee_cents) +
        Number(row.cash_rsv_cents);
      if (sum !== rec.correct_invoice_total_cents) {
        throw new Error(
          `${rec.display_id}: SAFETY -- components sum to ${sum}, expected correction target ${rec.correct_invoice_total_cents}. Refusing.`
        );
      }
      if (Number(row.invoice_total_cents) === rec.correct_invoice_total_cents) {
        console.log(`SKIP ${rec.display_id}: invoice_total_cents already correct (${row.invoice_total_cents})`);
        continue;
      }
      console.log(
        `${rec.display_id}: invoice_total_cents ${row.invoice_total_cents} -> ${rec.correct_invoice_total_cents} (notes: ${row.notes?.slice(0, 80)}...)`
      );
      const updated = await client.query(
        `UPDATE accounting.factoring_advances
            SET invoice_total_cents = $2
          WHERE id = $1::uuid AND operating_company_id = $3::uuid
          RETURNING id`,
        [rec.id, rec.correct_invoice_total_cents, USMCA]
      );
      if (!updated.rows[0]) throw new Error(`${rec.display_id}: UPDATE affected 0 rows`);
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
