#!/usr/bin/env -S npx tsx
/**
 * AUTH-169 -- Lead order (owner-verified, written correction of 7 prior rounds): void the two
 * fabricated factoring advances behind loads 13625/13626. Step 1 of a 6-step order; this script
 * covers step 1 only (void the advances). Steps 2-6 (void invoices, remove fabricated stamps,
 * find the writer, ship a guard) are separate work, not in this script.
 *
 * ROOT CAUSE (Lead, verified live): FAC-2026-00139 (13625, $6,062.50) and FAC-2026-00140 (13626,
 * $3,298.00) both carry source_system='tms' and a faro_invoice_number (103/104) that has ZERO
 * corresponding rows in factor.faro_invoice_lines -- meaning OUR OWN APP wrote these advances and
 * invented the Faro invoice numbers; nothing on the Faro side corroborates either one. Combined
 * with fabricated delivery stamps (arrival==departure==2026-09-25T16:00:00Z, actual_arrival_source
 * NULL, no pickup stamps, load status still 'dispatched') this is: fabricated delivery evidence ->
 * an invoice that should never have been sent -> an advance Faro never made.
 *
 * COMPLICATION FOUND LIVE, not in the original order (FAC-2026-00140 only): this exact record was
 * my own B-06 test artifact from earlier this session (a round-trip void->reinstate proof against
 * the THEN-broken executeVoidCancel/reinstate engine, both since fixed). Its CURRENT live posting
 * is JE 9c8e6897-524d-449a-bff3-d13611767989 -- but that JE's own postings carry
 * source_transaction_type='journal_entry' (pointing at the reversal JE it un-reversed), NOT
 * 'factoring_advance' pointing at FAC-2026-00140's own id. This is exactly the
 * REINSTATE-VOIDJE-REVERSAL-SEVERS-SOURCE-LINKAGE defect (filed + partially fixed this same
 * session, PR #23366) -- the historical row itself cannot be retagged (WORM), so
 * executeVoidCancel's tag-based live-posting lookup would find ZERO live rows for FAC-2026-00140
 * and silently perform a header-only void, missing this real $3,298.00/$51.00/$51.00/$3,400.00 --
 * live-verified via direct query before writing this script. FIX for this one record: reverse JE
 * 9c8e6897 DIRECTLY by its own id (postVoidReversal with entityType:'journal_entry', which reads
 * journal_entry_postings WHERE journal_entry_uuid=<id> directly, not by tag -- finds the real 4
 * lines regardless of their tag), confirmed zero live postings remain by BOTH the standard tag
 * query and a direct check on 9c8e6897 itself, THEN executeVoidCancel for the header (correctly
 * finds nothing further to reverse at that point, clean header-only void). FAC-2026-00139 was
 * never touched by any prior test -- its live JE is correctly tagged, so executeVoidCancel's
 * standard path is used directly with no special handling.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth169-void-13625-13626-factoring-advances.ts [--apply]
 * (run from repo root; DRY RUN first with no --apply flag)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-169";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const FAC_139_ID = "32e3b54b-a789-4b2a-af9f-ae9bff3624a8"; // FAC-2026-00139, load 13625, $6,062.50
const FAC_140_ID = "7ba4abe8-c195-4118-96d3-a10c35f0d8c4"; // FAC-2026-00140, load 13626, $3,298.00
const FAC_140_MISTAGGED_LIVE_JE_ID = "9c8e6897-524d-449a-bff3-d13611767989";

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
  const { postVoidReversal } = await import(path.join(ROOT, "apps/backend/src/accounting/void.service.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  // R-01 / ROUND 293 P0: assert target before any write. AUTH-gated apply → intended production;
  // dry-run without AUTH must refuse production.
  await (APPLY ? assertIsIntendedProduction : assertNotProduction)(client, {
    label: "scripts/ops/2026-09-30-cc2-auth169-void-13625-13626-factoring-advances.ts",
  });

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const acct = async () =>
      (
        await client.query<{ account_number: string; balance_cents: string }>(
          `SELECT a.account_number,
                  COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
             FROM catalogs.accounts a
             LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
             LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.status='posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
            WHERE a.operating_company_id = $1::uuid AND a.account_number IN ('1090', '1230', '2150', '6400')
            GROUP BY a.account_number ORDER BY a.account_number`,
          [USMCA]
        )
      ).rows;

    console.log("BEFORE:", JSON.stringify(await acct()));

    // Preflight: confirm both are still exactly the Lead-measured records.
    const pre139 = await client.query<{ status: string; advance_amount_cents: string }>(
      `SELECT status, advance_amount_cents::text FROM accounting.factoring_advances WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
      [FAC_139_ID, USMCA]
    );
    if (pre139.rows[0]?.status !== "advanced" || pre139.rows[0]?.advance_amount_cents !== "606250") {
      throw new Error(`FAC-2026-00139: preflight mismatch, found ${JSON.stringify(pre139.rows[0])} -- refusing`);
    }
    const pre140 = await client.query<{ status: string; advance_amount_cents: string }>(
      `SELECT status, advance_amount_cents::text FROM accounting.factoring_advances WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
      [FAC_140_ID, USMCA]
    );
    if (pre140.rows[0]?.status !== "advanced" || pre140.rows[0]?.advance_amount_cents !== "329800") {
      throw new Error(`FAC-2026-00140: preflight mismatch, found ${JSON.stringify(pre140.rows[0])} -- refusing`);
    }
    console.log("Preflight OK: both records match Lead's measured figures exactly.");

    // FAC-2026-00139: clean path, never touched by any prior test.
    const void139 = await executeVoidCancel("factoring_advance", {
      client,
      operatingCompanyId: USMCA,
      entityId: FAC_139_ID,
      action: "void",
      userId: ACTOR_USER_ID,
      reason:
        "AUTH-169: Lead order, owner-verified written correction -- FAC-2026-00139 is fabricated (source_system='tms', faro_invoice_number 103 has zero corresponding factor.faro_invoice_lines rows; nothing on the Faro side corroborates it). Not a real Faro purchase.",
    });
    console.log("FAC-2026-00139 void:", JSON.stringify(void139));
    if (void139.kind !== "ok" || !void139.reversing_entry_ref) {
      throw new Error(`FAC-2026-00139: expected a real reversal, got ${JSON.stringify(void139)} -- refusing`);
    }

    // FAC-2026-00140: the mistagged-live-JE complication. Reverse JE 9c8e6897 DIRECTLY by id first.
    const mistaggedCheck = await client.query<{ status: string; reversed_by_je_id: string | null; entry_date: string }>(
      `SELECT status, reversed_by_je_id::text, entry_date::text FROM accounting.journal_entries WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
      [FAC_140_MISTAGGED_LIVE_JE_ID, USMCA]
    );
    const mje = mistaggedCheck.rows[0];
    if (!mje || mje.status !== "posted" || mje.reversed_by_je_id) {
      throw new Error(`FAC-2026-00140: expected JE ${FAC_140_MISTAGGED_LIVE_JE_ID} to be live posted with no reversal yet, found ${JSON.stringify(mje)} -- refusing (state changed since this script was written, re-verify)`);
    }
    const manualReversal = await postVoidReversal(
      client,
      {
        operatingCompanyId: USMCA,
        entityType: "journal_entry",
        entityId: FAC_140_MISTAGGED_LIVE_JE_ID,
        originalDate: mje.entry_date.slice(0, 10),
        memo: `AUTH-169: reverse FAC-2026-00140's mistagged live JE (REINSTATE-VOIDJE-REVERSAL-SEVERS-SOURCE-LINKAGE, PR #23366) directly by id, since executeVoidCancel's tag-based lookup cannot find it. Lead order: FAC-2026-00140 is fabricated, source_system='tms', faro_invoice_number 104 has zero corresponding factor.faro_invoice_lines rows.`,
      },
      { userId: ACTOR_USER_ID }
    );
    console.log("FAC-2026-00140 manual reversal of mistagged live JE:", JSON.stringify(manualReversal));
    if (!manualReversal.reversal_journal_entry_id) {
      throw new Error("FAC-2026-00140: manual reversal of the mistagged live JE produced no JE -- refusing");
    }

    // Confirm zero live postings remain for FAC-2026-00140 (standard tag query) before the header void.
    const liveCheck140 = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.journal_entry_postings jep
         JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid
        WHERE jep.source_transaction_type='factoring_advance' AND jep.source_transaction_id::text=$1
          AND je.status='posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`,
      [FAC_140_ID]
    );
    if (liveCheck140.rows[0]?.n !== "0") {
      throw new Error(`FAC-2026-00140: expected 0 live tagged postings after manual reversal, found ${liveCheck140.rows[0]?.n} -- refusing`);
    }
    console.log("FAC-2026-00140: confirmed 0 live tagged postings remain -- safe to header-void now.");

    const void140 = await executeVoidCancel("factoring_advance", {
      client,
      operatingCompanyId: USMCA,
      entityId: FAC_140_ID,
      action: "void",
      userId: ACTOR_USER_ID,
      reason:
        "AUTH-169: Lead order, owner-verified written correction -- FAC-2026-00140 is fabricated (source_system='tms', faro_invoice_number 104 has zero corresponding factor.faro_invoice_lines rows; nothing on the Faro side corroborates it). Not a real Faro purchase. Its own live posting (JE 9c8e6897, mistagged per REINSTATE-VOIDJE-REVERSAL-SEVERS-SOURCE-LINKAGE) was already reversed directly above -- this call only performs the header void, correctly finding nothing further live.",
    });
    console.log("FAC-2026-00140 header void:", JSON.stringify(void140));
    if (void140.kind !== "ok") {
      throw new Error(`FAC-2026-00140: expected header void kind:'ok', got ${JSON.stringify(void140)} -- refusing`);
    }
    // reversing_entry_ref is expected NULL here -- the real reversal already happened above.
    if (void140.reversing_entry_ref) {
      throw new Error(`FAC-2026-00140: header void unexpectedly produced ANOTHER reversal (${void140.reversing_entry_ref}) -- would double-reverse, refusing`);
    }

    console.log("AFTER:", JSON.stringify(await acct()));

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
