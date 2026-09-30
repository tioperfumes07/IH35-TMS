#!/usr/bin/env -S npx tsx
/**
 * AUTH-171 -- Lead order (owner-verified, written correction): void the two fabricated invoices
 * behind loads 13625/13626. Step 2 of the standing order (AUTH-170 already voided the two
 * factoring advances FAC-2026-00139/00140 that funded these same invoices).
 *
 * ROOT CAUSE: same as AUTH-170's -- fabricated delivery evidence -> an invoice that should never
 * have been sent -> an advance Faro never made. Invoices 13625 ($6,250.00) and 13626 ($3,400.00),
 * status='sent', both source-linked to loads whose delivery stamps are fabricated (no real
 * evidence). Lead's order: "confirm AR moves by exactly $9,650.00."
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth171-void-13625-13626-invoices.ts [--apply]
 * (run from repo root; DRY RUN first with no --apply flag)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-171";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const INV_13625_ID = "efb40666-aa53-4c00-89a0-bb63ed3aef87"; // display_id 13625, $6,250.00
const INV_13626_ID = "066eacf5-b14b-4747-9bc0-475a853a4539"; // display_id 13626, $3,400.00

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

  const { executeVoidCancel } = await import(path.join(ROOT, "apps/backend/src/governance/void-cancel-executors.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const arAccount = async () =>
      (
        await client.query<{ balance_cents: string }>(
          `SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
             FROM catalogs.accounts a
             LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
             LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.status='posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
            WHERE a.operating_company_id = $1::uuid AND a.account_number = '1100'`,
          [USMCA]
        )
      ).rows[0]?.balance_cents ?? "0";

    console.log("BEFORE AR (1100):", await arAccount());

    const pre625 = await client.query<{ status: string; total_cents: string }>(
      `SELECT status, total_cents::text FROM accounting.invoices WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
      [INV_13625_ID, USMCA]
    );
    if (pre625.rows[0]?.status !== "sent" || pre625.rows[0]?.total_cents !== "625000") {
      throw new Error(`13625: preflight mismatch, found ${JSON.stringify(pre625.rows[0])} -- refusing`);
    }
    const pre626 = await client.query<{ status: string; total_cents: string }>(
      `SELECT status, total_cents::text FROM accounting.invoices WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
      [INV_13626_ID, USMCA]
    );
    if (pre626.rows[0]?.status !== "sent" || pre626.rows[0]?.total_cents !== "340000") {
      throw new Error(`13626: preflight mismatch, found ${JSON.stringify(pre626.rows[0])} -- refusing`);
    }
    console.log("Preflight OK: both invoices match expected figures exactly.");

    const void625 = await executeVoidCancel("invoice", {
      client,
      operatingCompanyId: USMCA,
      entityId: INV_13625_ID,
      action: "void",
      userId: ACTOR_USER_ID,
      reason:
        "AUTH-171: Lead order, owner-verified written correction -- invoice 13625 ($6,250.00) was sent on a load with fabricated delivery evidence (arrival==departure==2026-09-25T16:00:00Z, actual_arrival_source NULL, no pickup stamps). Never should have been sent. Its factoring advance FAC-2026-00139 already voided under AUTH-170.",
    });
    console.log("13625 void:", JSON.stringify(void625));

    const void626 = await executeVoidCancel("invoice", {
      client,
      operatingCompanyId: USMCA,
      entityId: INV_13626_ID,
      action: "void",
      userId: ACTOR_USER_ID,
      reason:
        "AUTH-171: Lead order, owner-verified written correction -- invoice 13626 ($3,400.00) was sent on a load with fabricated delivery evidence (arrival==departure==2026-09-25T16:00:00Z, actual_arrival_source NULL, no pickup stamps). Never should have been sent. Its factoring advance FAC-2026-00140 already voided under AUTH-170.",
    });
    console.log("13626 void:", JSON.stringify(void626));

    if (void625.kind !== "ok" || void626.kind !== "ok") {
      throw new Error(`unexpected void kind -- 13625:${void625.kind} 13626:${void626.kind} -- refusing`);
    }

    const afterAr = await arAccount();
    console.log("AFTER AR (1100):", afterAr);

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
