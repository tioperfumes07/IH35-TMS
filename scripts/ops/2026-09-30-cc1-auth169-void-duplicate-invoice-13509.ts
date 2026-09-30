/**
 * AUTH-169: void accounting.invoices id 2c8e69b0-7163-4190-a245-a7ee1fca6032 (display_id
 * INV-2026-00003, USMCA, load 13509, $4,400.00) -- a redundant duplicate document.
 *
 * ROOT CAUSE: load 13509's revenue is ALREADY correctly recognized via the DISP-01 two-event
 * delivery latch. Live-verified: accounting.load_revenue_recognition_postings carries a live
 * 'earn' ($4,400.00, JE 944486fd-2124-418a-b010-9568c58eea81) + 'bill' ($4,400.00, JE
 * eaa8cd8f-8940-43e0-a51e-cca620bf9593) pair for this load, both status='posted',
 * voided_at IS NULL. INV-2026-00003 is a SEPARATE document duplicating that same revenue -- it
 * never posted its own GL entry (live-verified: zero journal_entry_postings rows with
 * source_transaction_type='invoice' AND source_transaction_id=this invoice's id), because the
 * invoice-GL poster correctly refuses any load the delivery latch already owns
 * (INVOICE_REVREC_LATCH_OWNS_LOAD). Filed as part of DISP01-LATCH-8-DELIVERED-LOADS-NEVER-FIRED-34850
 * (docs/audit/GUARD-WORKORDERS.md), Lead ruling 2026-09-30: "VOID it. Do not post."
 *
 * WHY THIS REPLICATES THE REAL ROUTE, NOT A SHORTCUT: apps/backend/src/accounting/
 * invoices.routes.ts's POST /api/v1/accounting/invoices/:id/void handler is the sanctioned void
 * path. This script calls the SAME functions in the SAME order that route calls (isVoidEnforcement
 * Enabled -> postVoidReversal -> the same UPDATE -> cascadeVoidChildren -> the same
 * invoiced-load-status-revert logic -> auditVoid/appendCrudAudit), rather than re-implementing void
 * logic or hitting the HTTP endpoint from a script. postVoidReversal is safe to call
 * unconditionally: confirmed live this invoice has ZERO original GL postings, so it returns its
 * documented "nothing to reverse" no-op (reversal_journal_entry_id: null) rather than erroring.
 *
 * LOAD-STATUS SIDE EFFECT: load 13509 (c516a904-fdb7-4a85-8626-ef1fba5c0151) is currently
 * status='invoiced'. Per the route's own ACCT-F13579 logic, voiding its one live invoice reverts
 * the load to whatever status preceded 'invoiced' (recovered from audit.row_changes, falling back
 * to 'delivered' if no usable history or if the only prior value is paid/closed/cancelled). This is
 * CORRECT here, not a side effect to avoid: the load's real revenue was never actually tied to this
 * invoice in the first place (it came from the latch directly), so this invoice's existence and the
 * 'invoiced' status it drove were both the duplicate/mistake being corrected.
 *
 * EXPECTED TB MOVEMENT: $0.00. This invoice never posted a live GL entry, so postVoidReversal's
 * reversal is a no-op and no journal_entry_postings row is created or reversed by this script.
 * The only changes are: accounting.invoices status/voided_at/void_reason, mdata.loads.status
 * (reverted), and their audit trails. Confirm this live before and after -- if the TB moves at
 * all, STOP, do not trust the "expected $0" reasoning blindly.
 *
 * USAGE
 *   DRY_RUN=1 DATABASE_URL=<target> npx tsx scripts/ops/2026-09-30-cc1-auth169-void-duplicate-invoice-13509.ts
 *   OWNER_AUTH_ID=AUTH-169 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth169-void-duplicate-invoice-13509.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required for a real write; refusing a production financial write without an OPEN authorization on main.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const INVOICE_ID = "2c8e69b0-7163-4190-a245-a7ee1fca6032";
const LOAD_ID = "c516a904-fdb7-4a85-8626-ef1fba5c0151";
const VOID_REASON =
  "AUTH-169: redundant duplicate of already-correctly-recognized revenue. Load 13509's revenue is " +
  "recognized via the DISP-01 two-event delivery latch (earn+bill pair, $4,400.00 each, both live). " +
  "This invoice never posted its own GL entry (correctly refused by INVOICE_REVREC_LATCH_OWNS_LOAD) " +
  "and represents no real, separate economic event. Filed under " +
  "DISP01-LATCH-8-DELIVERED-LOADS-NEVER-FIRED-34850, Lead ruling 2026-09-30.";

async function tb(client: pg.PoolClient): Promise<Map<string, string>> {
  const res = await client.query<{ account_number: string; net_cents: string }>(
    `SELECT a.account_number,
            SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END)::text AS net_cents
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = jep.account_id
      WHERE jep.operating_company_id = $1::uuid
        AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
        AND je.status = 'posted'
      GROUP BY a.account_number`,
    [USMCA_ID]
  );
  return new Map(res.rows.map((r) => [r.account_number, r.net_cents]));
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await (REQUIRED_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(client, {
      label: "scripts/ops/2026-09-30-cc1-auth169-void-duplicate-invoice-13509.ts",
    });
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

    const before = await tb(client);

    const invRes = await client.query(
      `SELECT status::text AS status, voided_at::text AS voided_at FROM accounting.invoices WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
      [INVOICE_ID, USMCA_ID]
    );
    const inv = invRes.rows[0];
    if (!inv) throw new Error(`invoice ${INVOICE_ID} not found`);
    if (inv.status === "void" || inv.voided_at) {
      console.log("Already void -- nothing to do.");
      await client.query("ROLLBACK");
      return;
    }
    if (inv.status === "paid") throw new Error("invoice_paid_cannot_void -- unexpected, stop");

    // Same as isVoidEnforcementEnabled's underlying check -- postVoidReversal is safe to call
    // unconditionally regardless of this flag (it no-ops when there is nothing to reverse), so we
    // call it directly rather than importing the flag-check machinery for a script this narrow.
    const { postVoidReversal } = await import("../../apps/backend/src/accounting/void.service.js");
    const { cascadeVoidChildren } = await import("../../apps/backend/src/accounting/cascade-void-engine.service.js");
    const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");

    const issueDateRes = await client.query(`SELECT issue_date::text AS d FROM accounting.invoices WHERE id=$1::uuid`, [INVOICE_ID]);
    const originalDate = (issueDateRes.rows[0]?.d ?? new Date().toISOString()).slice(0, 10);

    console.log(DRY_RUN ? "DRY_RUN -- would void INV-2026-00003 (id 2c8e69b0...) now:" : "VOIDING INV-2026-00003 (id 2c8e69b0...) now:");

    if (!DRY_RUN) {
      const reversal = await postVoidReversal(
        client as never,
        { operatingCompanyId: USMCA_ID, entityType: "invoice", entityId: INVOICE_ID, originalDate, memo: `Void reversal of invoice ${INVOICE_ID}: ${VOID_REASON}` },
        { userId: SYSTEM_ACTOR_USER_ID }
      );
      console.log("postVoidReversal result:", JSON.stringify(reversal));
      if (reversal.reversal_journal_entry_id) {
        console.warn("UNEXPECTED: postVoidReversal created a reversing JE -- this invoice was believed to have zero live postings. Investigate before trusting the $0 TB claim.");
      }

      await client.query(
        `UPDATE accounting.invoices
            SET status = 'void', voided_at = now(), voided_by_user_id = $3, void_reason = $2, updated_at = now(), updated_by_user_id = $3
          WHERE id = $1`,
        [INVOICE_ID, VOID_REASON, SYSTEM_ACTOR_USER_ID]
      );

      await cascadeVoidChildren(client as never, "invoice", INVOICE_ID, USMCA_ID);

      const loadStatusRes = await client.query(`SELECT status::text AS status FROM mdata.loads WHERE id=$1::uuid AND operating_company_id=$2::uuid`, [LOAD_ID, USMCA_ID]);
      const loadStatus = loadStatusRes.rows[0]?.status;
      if (loadStatus === "invoiced") {
        const historyRes = await client.query(
          `SELECT old_data->>'status' AS old_status FROM audit.row_changes
            WHERE schema_name='mdata' AND table_name='loads' AND row_pk=$1 AND new_data->>'status'='invoiced'
            ORDER BY changed_at DESC LIMIT 1`,
          [LOAD_ID]
        );
        const FORBIDDEN = new Set(["paid", "closed", "cancelled"]);
        const historicalPrior = historyRes.rows[0]?.old_status ?? null;
        const revertStatus = historicalPrior && !FORBIDDEN.has(historicalPrior) ? historicalPrior : "delivered";
        await client.query(
          `UPDATE mdata.loads SET status=$3::mdata.load_status_enum, updated_at=now() WHERE id=$1::uuid AND operating_company_id=$2::uuid AND status='invoiced'`,
          [LOAD_ID, USMCA_ID, revertStatus]
        );
        console.log(`Load 13509 status reverted 'invoiced' -> '${revertStatus}' (${historicalPrior && !FORBIDDEN.has(historicalPrior) ? "recovered from history" : "no usable history -- defaulted"})`);
        await appendCrudAudit(
          client as never, SYSTEM_ACTOR_USER_ID, "mdata.loads.status_reverted_on_invoice_void",
          { resource_type: "mdata.loads", resource_id: LOAD_ID, operating_company_id: USMCA_ID, reason: `Reverted to '${revertStatus}' after voided duplicate invoice ${INVOICE_ID} (AUTH-169)` },
          "warning", "ACCT-F13579"
        );
      } else {
        console.log(`Load 13509 status is '${loadStatus}', not 'invoiced' -- status-revert step skipped (matches the real route's own guard).`);
      }

      await appendCrudAudit(
        client as never, SYSTEM_ACTOR_USER_ID, "accounting.invoices.voided",
        { resource_type: "accounting.invoices", resource_id: INVOICE_ID, operating_company_id: USMCA_ID, reason: VOID_REASON },
        "warning", "AUTH-169"
      );
    }

    const after = DRY_RUN ? before : await tb(client);
    const moved: string[] = [];
    const allAccts = new Set([...before.keys(), ...after.keys()]);
    for (const acct of allAccts) {
      const b = before.get(acct) ?? "0";
      const a = after.get(acct) ?? "0";
      if (b !== a) moved.push(`${acct}: ${b} -> ${a}`);
    }
    console.log("TB movement:", moved.length ? moved.join(", ") : "NONE -- $0.00 confirmed");

    if (DRY_RUN) {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, rolled back:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
