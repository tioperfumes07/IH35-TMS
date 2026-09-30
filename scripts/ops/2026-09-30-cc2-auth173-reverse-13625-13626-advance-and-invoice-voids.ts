#!/usr/bin/env -S npx tsx
/**
 * AUTH-173 -- Lead correction (owner-supplied Faro CSVs prove FAC-2026-00139/00140 are REAL):
 * reverse AUTH-170 (factoring advance voids) and AUTH-171 (invoice voids). Lead's own words:
 * "Faro purchased them, Faro wired them, and our advances match to the cent. I told you they were
 * app-fabricated because factor.faro_invoice_lines is empty. That table is empty because THE
 * IMPORTER NEVER LOADED THESE FILES — absence of a record is not evidence of absence."
 *
 * STEP A -- factoring advances: restore via the FRESH RE-POST path (R-02 Step 2 pattern,
 * postFactoringAdvanceEventInClientTx -- the SAME poster used for a brand-new advance, matching
 * AUTH-144/A-10's proven pattern), NEVER a reversal-of-reversal. Header reinstated via
 * stampDocumentReinstated directly (not the full reinstateDocument dispatcher -- this is a fresh
 * repost, not an undo-a-reversal, so neither the twin-check nor the GL-restore-refuse gate apply).
 *
 * STEP B -- invoices: these never had any GL posting in the first place (confirmed under
 * AUTH-171), so reinstating the header alone (via reinstateDocumentThenVoidReversal, which finds
 * voidReversalJeId=null and proceeds cleanly) is the complete, correct fix -- there is no GL to
 * restore.
 *
 * NOT reversed here (Lead's order says unchanged, still correct): the fabricated delivery stamps
 * on 13625/13626 (AUTH-172) stay removed -- "Faro purchasing an invoice does not make a truck
 * have delivered. The invoice being REAL and the delivery evidence being FAKE are two separate
 * facts and both hold." The 14 pre-invoices (13624/27-39) are separately still void-then-delete,
 * untouched by this script.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth173-reverse-13625-13626-advance-and-invoice-voids.ts [--apply]
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
const AUTH_ID = "AUTH-173";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const FAC_139_ID = "32e3b54b-a789-4b2a-af9f-ae9bff3624a8"; // FAC-2026-00139, load 13625
const FAC_140_ID = "7ba4abe8-c195-4118-96d3-a10c35f0d8c4"; // FAC-2026-00140, load 13626
const INV_13625_ID = "efb40666-aa53-4c00-89a0-bb63ed3aef87";
const INV_13626_ID = "066eacf5-b14b-4747-9bc0-475a853a4539";

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

  const { postFactoringAdvanceEventInClientTx } = await import(
    path.join(ROOT, "apps/backend/src/accounting/factoring-posting/poster.service.ts")
  );
  const { stampDocumentReinstated } = await import(path.join(ROOT, "apps/backend/src/accounting/void-document-stamp.service.ts"));
  const { reinstateDocumentThenVoidReversal } = await import(path.join(ROOT, "apps/backend/src/accounting/reinstate-document.service.ts"));
  const { appendCrudAudit } = await import(path.join(ROOT, "apps/backend/src/audit/crud-audit.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await (APPLY ? assertIsIntendedProduction : assertNotProduction)(client, {
    label: "scripts/ops/2026-09-30-cc2-auth173-reverse-13625-13626-advance-and-invoice-voids.ts",
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
            WHERE a.operating_company_id = $1::uuid AND a.account_number IN ('1090', '1230', '2150', '6400', '1100')
            GROUP BY a.account_number ORDER BY a.account_number`,
          [USMCA]
        )
      ).rows;

    console.log("BEFORE (currently the post-void state):", JSON.stringify(await acct()));

    // Preflight: confirm both advances are still voided as AUTH-170 left them.
    for (const [id, disp] of [[FAC_139_ID, "FAC-2026-00139"], [FAC_140_ID, "FAC-2026-00140"]] as const) {
      const pre = await client.query<{ status: string }>(
        `SELECT status FROM accounting.factoring_advances WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
        [id, USMCA]
      );
      if (pre.rows[0]?.status !== "voided") {
        throw new Error(`${disp}: expected status='voided', found ${JSON.stringify(pre.rows[0])} -- refusing, state changed since this script was written`);
      }
    }
    console.log("Preflight OK: both advances still voided as AUTH-170 left them.");

    // STEP A -- fresh re-post for both advances (R-02 Step 2 pattern, never a reversal-of-reversal).
    for (const [id, disp] of [[FAC_139_ID, "FAC-2026-00139"], [FAC_140_ID, "FAC-2026-00140"]] as const) {
      const repost = await postFactoringAdvanceEventInClientTx(client, {
        operating_company_id: USMCA,
        factoring_advance_id: id,
        actor_user_id: ACTOR_USER_ID,
      });
      console.log(`${disp} fresh re-post:`, JSON.stringify(repost));
      if (!(repost as { posted?: boolean }).posted) {
        throw new Error(`${disp}: fresh re-post did not report posted:true -- refusing, got ${JSON.stringify(repost)}`);
      }

      const stamp = await stampDocumentReinstated(client, {
        operatingCompanyId: USMCA,
        family: "factoring_advance",
        documentId: id,
        reinstateReason:
          "AUTH-173: Lead correction, owner-supplied Faro CSVs prove this advance is real (faro_daily_purchase_report.csv, FARO-PAYMENTS_TO_YOU_REPORT.csv, FARO_AGING_REPORT.csv, FARO_ALL_FEES.csv, all 09-25-2026, matching to the cent). AUTH-170's void is reversed via a fresh re-post (R-02 Step 2 pattern), not a reversal-of-reversal.",
        reinstatedByUserId: ACTOR_USER_ID,
        restoreStatus: "advanced",
      });
      console.log(`${disp} header reinstate:`, JSON.stringify(stamp));
    }

    // STEP B -- reinstate both invoices (no GL to restore, header-only is correct and complete).
    const runInTx = (fn: (c: typeof client) => Promise<unknown>) => fn(client);
    for (const [id, disp] of [[INV_13625_ID, "13625"], [INV_13626_ID, "13626"]] as const) {
      const result = await reinstateDocumentThenVoidReversal(runInTx as never, {
        operatingCompanyId: USMCA,
        type: "invoice",
        id,
        reason:
          "AUTH-173: Lead correction -- invoice was never fabricated, it is a real factored receivable. Its factoring advance is reinstated via a fresh re-post above. Cancelling AUTH-171's void.",
        actor: { userId: ACTOR_USER_ID, role: "Owner" },
      });
      console.log(`${disp} invoice reinstate:`, JSON.stringify(result));
    }

    await appendCrudAudit(
      client,
      ACTOR_USER_ID,
      "accounting.factoring_advance.auth173_correction_reversal",
      {
        operating_company_id: USMCA,
        reversed_auths: ["AUTH-170", "AUTH-171"],
        reason: "Owner-supplied Faro CSVs prove FAC-2026-00139/00140 and invoices 13625/13626 are real, not fabricated. AUTH-172 (fabricated delivery stamps removed) stands unchanged -- delivery evidence and factoring reality are separate facts.",
      },
      "warning",
      "AUTH-173"
    );

    const after = await acct();
    console.log("AFTER (should equal the ORIGINAL pre-void state exactly):", JSON.stringify(after));

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
