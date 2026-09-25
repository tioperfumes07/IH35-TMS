/**
 * WITHDRAWN 2026-09-25 — DO NOT RUN. See AUTH-033's WITHDRAWN note in docs/bus/OWNER-AUTHORIZATIONS.md.
 *
 * This script's entire premise was WRONG: advance 35269c66 (CA-2026-TIE-5801, $200.00) already has
 * BOTH its issuance (Dr 1245, JE c8e25275, "CA issuance backfill CA-2026-TIE-5801") and its recovery
 * (Cr 1245, JE ad91e791, "Settlement S-5801 — cash-advance recovery") posted — net $0 for this
 * advance already. This script's own "existing JE" check below (and the investigation that led to
 * writing this script) filtered `source_transaction_type = 'driver_advance'`, but the real value
 * used on these backfilled rows is `'driver_cash_advance'` — a naming mismatch, not a real gap.
 * Running this script would have posted a THIRD $200.00 debit and put GL 1245 at +$200.00. Caught
 * live by Claude-Lead before any production run of this corrected version ever executed (an earlier
 * attempt failed atomically on the resolveAccountForCategory/withLuciaBypass SET-ROLE wall — see
 * ACCT-F2026092584 — and rolled back with nothing committed).
 *
 * Left in place (not deleted) as a record of the mistake and the fix in ACCT-F2026092584 it
 * produced along the way. Hard-refuses immediately below — do not remove this guard and re-run
 * without a fresh, independent live re-verification of the ACTUAL current gap (if any).
 */
throw new Error(
  "WITHDRAWN — do not run. Advance 35269c66 already nets $0 on GL 1245 (issuance JE c8e25275 + " +
    "recovery JE ad91e791, source_transaction_type='driver_cash_advance'). See AUTH-033's WITHDRAWN " +
    "note in docs/bus/OWNER-AUTHORIZATIONS.md before touching this file again."
);

/**
 * ROUND 174 item B, load 13570 — CORRECTED PLAN. AUTH-031's original plan (createDriverCashAdvanceCore
 * for a brand-new row) was superseded live: the DRY_RUN under AUTH-031 refused with "driver_bill
 * ...already has a live driver_advances row (35269c66-a8df-4443-a7b5-4f78537d28b3)" — between my
 * investigation and running the dry run, that pre-existing row (originally unlinked, $200.00,
 * driver 61727a46) was linked to load 13570's driver bill and its disbursement_status flipped to
 * 'disbursed' by someone else. Its `disbursed_at` and `posting_date` are both still NULL and no
 * accounting.journal_entry_postings row exists for it (source_transaction_type='driver_advance',
 * source_transaction_id=this id) — confirmed live: the status flip happened, the GL never posted.
 *
 * This script completes exactly that: sets disbursed_at/posting_date (to the PDF's own date,
 * 2026-09-01 — "Cash Advance-Efectivo," Driver_Settlement_5801.txt) on the EXISTING row, then posts
 * the GL via postSourceTransactionInClientTx — the same two DB phases disburseDriverAdvanceCore's
 * own real implementation runs, replicated in-client for the same SET ROLE ih35_app reason AUTH-031
 * itself already documents (the ~/.ih35-gate.env credential cannot assume that role). No new
 * driver_advances/driver_liabilities row is created here — AUTH-033 supersedes AUTH-031's "one new
 * row" scope with the corrected, narrower action (AUTH-032 was taken concurrently by Lead's fuel-date
 * fix, so this one is 033).
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
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_1245 = "e4d191a2-621f-4d95-bcda-c4822ed1176e";
const ADVANCE_ID = "35269c66-a8df-4443-a7b5-4f78537d28b3";
const EXPECTED_DRIVER_BILL_ID = "4a34ee6d-8877-48ec-bd59-460e645b820d"; // load 13570
const POSTING_DATE = "2026-09-01";

async function main() {
  const { postSourceTransactionInClientTx } = await import("../../apps/backend/src/accounting/posting-engine.service.js");
  const { isEnabled } = await import("../../apps/backend/src/lib/feature-flags/service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const DRIVER_ADVANCE_GL_POSTING_FLAG_KEY = "DRIVER_ADVANCE_GL_POSTING_ENABLED";

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dryRun = process.env.DRY_RUN === "1";

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

      const cur = await client.query<{
        disbursement_status: string; posting_date: string | null; disbursed_at: string | null; linked_driver_bill_id: string | null; amount: string;
      }>(
        `SELECT disbursement_status::text, posting_date::text, disbursed_at::text, linked_driver_bill_id::text, amount::text
           FROM driver_finance.driver_advances
          WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1 FOR UPDATE`,
        [USMCA_ID, ADVANCE_ID]
      );
      const row = cur.rows[0];
      if (!row) throw new Error(`advance ${ADVANCE_ID} not found -- STOP`);
      if (row.linked_driver_bill_id !== EXPECTED_DRIVER_BILL_ID) {
        throw new Error(`advance ${ADVANCE_ID} linked_driver_bill_id=${row.linked_driver_bill_id}, expected ${EXPECTED_DRIVER_BILL_ID} -- STOP, do not proceed on a stale assumption`);
      }
      console.log(`advance ${ADVANCE_ID}: amount=$${row.amount} status=${row.disbursement_status} disbursed_at=${row.disbursed_at} posting_date=${row.posting_date}`);

      const existingJe = await client.query<{ id: string }>(
        `SELECT p.id::text FROM accounting.journal_entry_postings p
           JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
          WHERE p.source_transaction_type = 'driver_advance' AND p.source_transaction_id = $1
            AND je.status = 'posted' AND je.voided_at IS NULL LIMIT 1`,
        [ADVANCE_ID]
      );
      if (existingJe.rows[0]) {
        console.log(`advance ${ADVANCE_ID} already has a live posted JE (${existingJe.rows[0].id}) -- nothing to do.`);
        await client.query("ROLLBACK");
        return;
      }

      if (dryRun) {
        console.log("DRY_RUN=1 -- would set disbursed_at/posting_date and post the GL. No existing JE found, so posting IS still needed.");
        await client.query("ROLLBACK");
        return;
      }

      if (row.disbursement_status !== "disbursed") {
        throw new Error(`advance ${ADVANCE_ID} disbursement_status=${row.disbursement_status}, expected 'disbursed' (already flipped by someone else) -- STOP, re-investigate before running`);
      }

      const postingDateOld = row.posting_date;
      const upd = await client.query<{ posting_date: string }>(
        `UPDATE driver_finance.driver_advances
            SET disbursed_at = COALESCE(disbursed_at, now()), posting_date = COALESCE(posting_date, $2::date), updated_at = now()
          WHERE operating_company_id = $1::uuid AND id = $3::uuid
         RETURNING posting_date::text AS posting_date`,
        [USMCA_ID, POSTING_DATE, ADVANCE_ID]
      );
      const postingDate = upd.rows[0].posting_date;

      await appendCrudAudit(
        client as never,
        SYSTEM_ACTOR_USER_ID,
        "driver_advance.posting_date_set",
        { resource_type: "driver_finance.driver_advances", resource_id: ADVANCE_ID, operating_company_id: USMCA_ID, posting_date_old: postingDateOld, posting_date_new: postingDate },
        "info",
        "ROUND-174-ITEM-B-13570-GL-COMPLETE"
      );

      const glPostingEnabled = await isEnabled(client as never, DRIVER_ADVANCE_GL_POSTING_FLAG_KEY, {
        operating_company_id: USMCA_ID,
        user_uuid: SYSTEM_ACTOR_USER_ID,
      });
      console.log(`posting_date=${postingDate}, DRIVER_ADVANCE_GL_POSTING_ENABLED=${glPostingEnabled}`);
      if (!glPostingEnabled) {
        throw new Error("DRIVER_ADVANCE_GL_POSTING_ENABLED is OFF -- refusing to leave this half-done again; investigate the flag before proceeding.");
      }

      const posting = await postSourceTransactionInClientTx(
        client as never,
        { operating_company_id: USMCA_ID, source_transaction_type: "driver_advance", source_transaction_id: ADVANCE_ID, credit_account_id: null },
        { userId: SYSTEM_ACTOR_USER_ID }
      );
      console.log("GL posting result:", JSON.stringify(posting));
      if (!posting.posted) throw new Error(`postSourceTransactionInClientTx did not post: ${JSON.stringify(posting)} -- STOP`);

      const proof = await client.query<{ net_cents: string | null; n: string }>(
        `SELECT sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)::text AS net_cents, count(*)::text AS n
           FROM accounting.journal_entry_postings p
           JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
          WHERE p.account_id = $1::uuid AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL AND p.reversed_by_line_id IS NULL`,
        [ACCOUNT_1245]
      );
      const netCents = Number(proof.rows[0].net_cents ?? 0);
      console.log(`PROOF: GL 1245 net = ${(netCents / 100).toFixed(2)} (${proof.rows[0].n} live postings).`);

      await client.query("COMMIT");
      console.log("COMMITTED.");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
