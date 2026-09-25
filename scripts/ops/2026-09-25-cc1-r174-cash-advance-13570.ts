/**
 * ROUND 174 (Claude-Lead, 2026-09-25 02:15 PM CT / 19:15Z), item B, September scope, load 13570
 * ONLY. Originally drafted for both 13570 and 13587 — 13587 was DROPPED after Lead's own AUTH-030
 * (main, PR #22709, "R-176 cash advances to document truth") found my earlier ROUND 153 item 8
 * correction was itself wrong: CA-2026-0008 ($167.87) + CA-2026-0009 ($34.12) + CA-2026-TIE-5807
 * ($78.01) sum to exactly $280.00 -- document 5807's real single advance for load 13587 -- not a
 * duplicate of CA-2026-0007 as I'd concluded. Lead's fix restores/repoints the existing 12-row
 * historical batch, which ALREADY correctly covers load 13587. Creating a fresh $280.00 row for it
 * here (the original draft of this script) would have double-booked it. Caught before running;
 * nothing was ever written under the withdrawn AUTH-030 draft this superseded.
 *
 * Load 13570 is NOT part of Lead's 12-row historical batch (confirmed: none of the 12 link to this
 * load or its driver) and is NOT touched by Lead's AUTH-030 scope, so it is a genuinely separate,
 * still-open gap, not a duplicate of anything Lead's fix addresses.
 *
 * ROOT CAUSE, confirmed live (never guessed): load 13570 (settlement 5801, driver Carlos Mauricio
 * Pena Carvallo). The truth JSON's own driver-doc deductions[] for 5801 carries "Cash
 * Advance-Efectivo" -$200.00, dated 2026-09-01, load 13570. No driver_finance.driver_advances row
 * exists anywhere for this driver/load -- the settlement recovered an advance the app never
 * recorded as disbursed.
 *
 * FIX: createDriverCashAdvanceCore (subledger row, linked to the driver bill, disbursement_method
 * 'historical_backfill' -- CLOSE-POST-A-2, a real already-happened event evidenced only by the
 * signed settlement document) then disburseDriverAdvanceCore (posts the GL: Dr 1245 Driver Cash
 * Advances Receivable / Cr the default cash account, back-dated to the PDF's own date). The
 * existing two-step engine, unchanged, no new writer. linked_driver_bill_id set at creation is
 * what makes it render against the driver bill's own open balance / settlement netting.
 *
 * RUN THIS AFTER Lead's AUTH-030 (R-176) is CONSUMED, not concurrently with it -- both writers
 * touch account 1245 and this script's own "GL 1245 nets 0" proof is only meaningful once Lead's
 * fix to the OTHER 12 rows has already landed; running both at once risks reading a misleading
 * intermediate net.
 *
 * ANOTHER FINDING while wiring this up (docs/bus/OWNER-AUTHORIZATIONS.md AUTH-029's own consumed
 * note, Lead): disburseDriverAdvanceCore calls withCurrentUser, which does `SET ROLE ih35_app` --
 * the ~/.ih35-gate.env credential (ih35_ci_readonly) cannot assume that role and the call fails
 * closed. Same class of failure Lead hit and worked around for 5812. createDriverCashAdvanceCore
 * is unaffected (it takes an externally-supplied client, no SET ROLE of its own) -- only the
 * disburse step is replicated in-client below: phase 1 (flip disbursement_status, audit) + phase 2
 * (postSourceTransactionInClientTx, the same GL call disburseDriverAdvanceCore itself makes) run
 * directly on this script's own bypassed client. Phase 3 (a best-effort cash-advance-request
 * timeline emit) is skipped -- this advance did not originate from a request, so it would have been
 * a no-op there too (disburseDriverAdvanceCore's own phase 3 only fires when a matching
 * cash_advance_requests row exists).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001"; // role=Administrator, live-verified (R-153 item 8 precedent)
const ACCOUNT_1245 = "e4d191a2-621f-4d95-bcda-c4822ed1176e"; // Driver Cash Advances Receivable

const TARGET = {
  load_number: "13570",
  driver_bill_id: "4a34ee6d-8877-48ec-bd59-460e645b820d",
  amount: 200.0,
  posting_date: "2026-09-01",
  notes: "Cash Advance-Efectivo per Driver_Settlement_5801.txt deduction, load 13570, settlement 5801",
};

async function main() {
  const { createDriverCashAdvanceCore } = await import("../../apps/backend/src/cash-advances/cash-advance-create.js");
  const { postSourceTransactionInClientTx } = await import("../../apps/backend/src/accounting/posting-engine.service.js");
  const { isEnabled } = await import("../../apps/backend/src/lib/feature-flags/service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const DRIVER_ADVANCE_GL_POSTING_FLAG_KEY = "DRIVER_ADVANCE_GL_POSTING_ENABLED";

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dryRun = process.env.DRY_RUN === "1";

  try {
    // ---- read phase: resolve the driver_id + confirm the bill is still what this script found live ----
    const readClient = await pool.connect();
    let driverId: string;
    try {
      await readClient.query("BEGIN");
      await readClient.query("RESET ROLE");
      await readClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await readClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
      const billRes = await readClient.query<{ driver_id: string; load_number: string }>(
        `SELECT driver_id::text, load_number FROM driver_finance.driver_bills WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [TARGET.driver_bill_id, USMCA_ID]
      );
      if (!billRes.rows[0]) throw new Error(`driver_bill ${TARGET.driver_bill_id} not found -- STOP`);
      if (billRes.rows[0].load_number !== TARGET.load_number) {
        throw new Error(`driver_bill ${TARGET.driver_bill_id} is load ${billRes.rows[0].load_number}, expected ${TARGET.load_number} -- STOP, do not proceed on a stale assumption`);
      }
      const existingRes = await readClient.query<{ id: string }>(
        `SELECT id::text FROM driver_finance.driver_advances WHERE operating_company_id = $1::uuid AND linked_driver_bill_id = $2::uuid AND voided_at IS NULL`,
        [USMCA_ID, TARGET.driver_bill_id]
      );
      if (existingRes.rows[0]) {
        throw new Error(`driver_bill ${TARGET.driver_bill_id} already has a live driver_advances row (${existingRes.rows[0].id}) -- STOP, do not double-book`);
      }
      driverId = billRes.rows[0].driver_id;
      await readClient.query("COMMIT");
    } catch (err) {
      await readClient.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      readClient.release();
    }
    console.log(`load ${TARGET.load_number}: driver_bill=${TARGET.driver_bill_id} driver=${driverId} -- no existing live advance, clear to proceed`);

    if (dryRun) {
      console.log(`DRY_RUN=1 -- would create+disburse $${TARGET.amount.toFixed(2)} for load ${TARGET.load_number}, driver ${driverId}.`);
      return;
    }

    // ---- write phase 1: create the subledger row ----
    const createClient = await pool.connect();
    let advanceId: string;
    try {
      await createClient.query("BEGIN");
      await createClient.query("RESET ROLE");
      await createClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await createClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
      const created = await createDriverCashAdvanceCore(createClient as never, SYSTEM_ACTOR_USER_ID, USMCA_ID, {
        driver_id: driverId,
        amount: TARGET.amount,
        purpose: "other",
        disbursement_method: "historical_backfill",
        recipient_info: { recipient_type: "driver", notes: TARGET.notes },
        linked_driver_bill_id: TARGET.driver_bill_id,
      });
      if (!created.ok) throw new Error(`createDriverCashAdvanceCore failed: ${created.error} ${created.message ?? ""}`);
      advanceId = created.advanceId;
      await createClient.query("COMMIT");
      console.log(`created advance ${advanceId} (display ${created.displayId})`);
    } catch (err) {
      await createClient.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      createClient.release();
    }

    // ---- write phase 2: disburse, replicated in-client (see the header note: disburseDriverAdvanceCore
    // itself calls withCurrentUser, which does SET ROLE ih35_app -- the ops credential here cannot
    // assume that role. Same two DB phases disburseDriverAdvanceCore's own real implementation runs,
    // in order, on this script's own already-bypassed client. Phase 3 (best-effort cash-advance-
    // request timeline emit) is skipped -- this advance did not originate from a request. ----
    const disburseClient = await pool.connect();
    let postingDate: string;
    try {
      await disburseClient.query("BEGIN");
      await disburseClient.query("RESET ROLE");
      await disburseClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await disburseClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

      const cur = await disburseClient.query<{ disbursement_status: string; posting_date: string | null }>(
        `SELECT disbursement_status::text, posting_date::text FROM driver_finance.driver_advances
          WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1 FOR UPDATE`,
        [USMCA_ID, advanceId]
      );
      const row = cur.rows[0];
      if (!row) throw new Error(`advance ${advanceId} not found on the disburse read -- STOP`);
      if (row.disbursement_status !== "approved") throw new Error(`advance ${advanceId} disbursement_status=${row.disbursement_status}, expected approved -- STOP`);
      const postingDateOld = row.posting_date;

      const upd = await disburseClient.query<{ posting_date: string }>(
        `UPDATE driver_finance.driver_advances
            SET disbursement_status = 'disbursed', disbursed_at = now(), posting_date = COALESCE($3::date, CURRENT_DATE), updated_at = now()
          WHERE operating_company_id = $1::uuid AND id = $2::uuid
         RETURNING posting_date::text AS posting_date`,
        [USMCA_ID, advanceId, TARGET.posting_date]
      );
      postingDate = upd.rows[0].posting_date;

      await appendCrudAudit(
        disburseClient as never,
        SYSTEM_ACTOR_USER_ID,
        "driver_advance.posting_date_set",
        { resource_type: "driver_finance.driver_advances", resource_id: advanceId, operating_company_id: USMCA_ID, posting_date_old: postingDateOld, posting_date_new: postingDate },
        "info",
        "B3-EMPLOYEE-LOAN-LEDGER"
      );

      const glPostingEnabled = await isEnabled(disburseClient as never, DRIVER_ADVANCE_GL_POSTING_FLAG_KEY, {
        operating_company_id: USMCA_ID,
        user_uuid: SYSTEM_ACTOR_USER_ID,
      });
      console.log(`disburse phase 1 done: posting_date=${postingDate}, DRIVER_ADVANCE_GL_POSTING_ENABLED=${glPostingEnabled}`);

      if (glPostingEnabled) {
        const posting = await postSourceTransactionInClientTx(
          disburseClient as never,
          { operating_company_id: USMCA_ID, source_transaction_type: "driver_advance", source_transaction_id: advanceId, credit_account_id: null },
          { userId: SYSTEM_ACTOR_USER_ID }
        );
        console.log("disburse phase 2 (GL) result:", JSON.stringify(posting));
      } else {
        console.log("DRIVER_ADVANCE_GL_POSTING_ENABLED is OFF -- disbursement committed, GL post skipped (matches disburseDriverAdvanceCore's own flag-off behavior).");
      }

      await disburseClient.query("COMMIT");
    } catch (err) {
      await disburseClient.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      disburseClient.release();
    }
    console.log(`disbursed, posting_date=${postingDate}`);

    // ---- proof: GL 1245 nets 0 ----
    const proofClient = await pool.connect();
    try {
      await proofClient.query("BEGIN");
      await proofClient.query("RESET ROLE");
      await proofClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      const netRes = await proofClient.query<{ net_cents: string | null; n: string }>(
        `SELECT sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)::text AS net_cents, count(*)::text AS n
           FROM accounting.journal_entry_postings p
           JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
          WHERE p.account_id = $1::uuid AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND p.reversed_by_line_id IS NULL`,
        [ACCOUNT_1245]
      );
      await proofClient.query("COMMIT");
      const netCents = Number(netRes.rows[0].net_cents ?? 0);
      console.log(`PROOF: GL 1245 net = ${(netCents / 100).toFixed(2)} (${netRes.rows[0].n} live postings). Expect 0.00 once Lead's AUTH-030 (R-176) is also consumed.`);
    } finally {
      proofClient.release();
    }
    console.log("COMMITTED.");
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
