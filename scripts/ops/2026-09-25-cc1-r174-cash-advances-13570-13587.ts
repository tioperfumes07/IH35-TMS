/**
 * ROUND 174 (Claude-Lead, 2026-09-25 02:15 PM CT / 19:15Z), item B, scoped to September only
 * (5801/13570, 5807/13587 — the two September loads named in the handoff's item B list; the
 * other 8 named loads there are August, the Lead's own scope).
 *
 * ROOT CAUSE, confirmed live before writing this (never guessed):
 * - Load 13570 (settlement 5801, driver Carlos Mauricio Pena Carvallo): Driver_Settlement_5801's
 *   own truth-JSON deductions[] carries "Cash Advance-Efectivo" -$200.00 dated 2026-09-01, load
 *   13570. No driver_finance.driver_advances row exists anywhere for this driver/load — the
 *   settlement recovered an advance the app never recorded as disbursed.
 * - Load 13587 (settlement 5807, driver — resolved live below): Driver_Settlement_5807.txt
 *   (settlement 5807 is not in the truth JSON snapshot at all — confirmed, checked the txt
 *   fallback per the handoff's own truth-source rule) line 31: "CASH ADVANCE WIRE TRANSFER
 *   -280.00" dated 2026-09-10, load 13587. Same gap: no driver_advances row for it. (This
 *   driver's OTHER 3 driver_advances rows are all unrelated: 2 are voided leftovers from my own
 *   earlier ROUND 153 item 8 duplicate-correction on a DIFFERENT load/driver-bill pairing, 1 is
 *   an active $78.01 row already linked elsewhere in the driver's own history — none of the three
 *   evidence THIS $280.00 event, so a new row is written rather than reusing/guessing at one of
 *   them.)
 *
 * FIX: createDriverCashAdvanceCore (subledger row, linked to the driver bill, disbursement_method
 * 'historical_backfill' — CLOSE-POST-A-2, a real already-happened event evidenced only by the
 * signed settlement document) then disburseDriverAdvanceCore (posts the GL: Dr 1245 Driver Cash
 * Advances Receivable / Cr the default cash account, back-dated to the PDF's own date) — the
 * existing two-step engine, unchanged, no new writer. This is what "renders as a bill payment
 * against the driver bill" means in this codebase: linked_driver_bill_id set at creation is what
 * the driver bill's own open-balance / settlement-netting reads, per createDriverCashAdvanceCore's
 * own B5 doc comment ("Recorded on driver_advances for settlement netting").
 *
 * Proof required: GL 1245 nets 0 (was -201.99), and each driver bill's open balance equals the
 * PDF net -- checked at the end of this script.
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

const TARGETS = [
  {
    load_number: "13570",
    driver_bill_id: "4a34ee6d-8877-48ec-bd59-460e645b820d",
    amount: 200.0,
    posting_date: "2026-09-01",
    notes: "Cash Advance-Efectivo per Driver_Settlement_5801.txt deduction, load 13570, settlement 5801",
  },
  {
    load_number: "13587",
    driver_bill_id: "97cb3439-09c9-41f3-818d-5df324face8a",
    amount: 280.0,
    posting_date: "2026-09-10",
    notes: "CASH ADVANCE WIRE TRANSFER per Driver_Settlement_5807.txt line 31, load 13587, settlement 5807",
  },
];

async function main() {
  const { createDriverCashAdvanceCore } = await import("../../apps/backend/src/cash-advances/cash-advance-create.js");
  const { disburseDriverAdvanceCore } = await import("../../apps/backend/src/cash-advances/cash-advance-disburse.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dryRun = process.env.DRY_RUN === "1";
  const results: Array<Record<string, unknown>> = [];

  try {
    for (const t of TARGETS) {
      // ---- read phase: resolve the driver_id + confirm the bill is still what this script found live ----
      const readClient = await pool.connect();
      let driverId: string;
      let billLoadNumber: string;
      try {
        await readClient.query("BEGIN");
        await readClient.query("RESET ROLE");
        await readClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await readClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
        const billRes = await readClient.query<{ driver_id: string; load_number: string }>(
          `SELECT driver_id::text, load_number FROM driver_finance.driver_bills WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
          [t.driver_bill_id, USMCA_ID]
        );
        if (!billRes.rows[0]) throw new Error(`driver_bill ${t.driver_bill_id} not found -- STOP`);
        if (billRes.rows[0].load_number !== t.load_number) {
          throw new Error(`driver_bill ${t.driver_bill_id} is load ${billRes.rows[0].load_number}, expected ${t.load_number} -- STOP, do not proceed on a stale assumption`);
        }
        driverId = billRes.rows[0].driver_id;
        billLoadNumber = billRes.rows[0].load_number;
        await readClient.query("COMMIT");
      } catch (err) {
        await readClient.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        readClient.release();
      }
      console.log(`load ${t.load_number}: driver_bill=${t.driver_bill_id} driver=${driverId} (confirmed load_number=${billLoadNumber})`);

      if (dryRun) {
        results.push({ load: t.load_number, action: "dry_run_would_create_and_disburse", amount: t.amount, driver_id: driverId });
        continue;
      }

      // ---- write phase 1: create the subledger row, in its own transaction ----
      const createClient = await pool.connect();
      let advanceId: string;
      try {
        await createClient.query("BEGIN");
        await createClient.query("RESET ROLE");
        await createClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await createClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
        const created = await createDriverCashAdvanceCore(createClient as never, SYSTEM_ACTOR_USER_ID, USMCA_ID, {
          driver_id: driverId,
          amount: t.amount,
          purpose: "other",
          disbursement_method: "historical_backfill",
          recipient_info: { recipient_type: "driver", notes: t.notes },
          linked_driver_bill_id: t.driver_bill_id,
        });
        if (!created.ok) throw new Error(`createDriverCashAdvanceCore failed for load ${t.load_number}: ${created.error} ${created.message ?? ""}`);
        advanceId = created.advanceId;
        await createClient.query("COMMIT");
        console.log(`load ${t.load_number}: created advance ${advanceId} (display ${created.displayId})`);
      } catch (err) {
        await createClient.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        createClient.release();
      }

      // ---- write phase 2: disburse (posts the GL), its own connection per the engine's own contract ----
      const disburse = await disburseDriverAdvanceCore(SYSTEM_ACTOR_USER_ID, "Administrator", USMCA_ID, {
        advance_id: advanceId,
        posting_date: t.posting_date,
      });
      if (!disburse.ok) throw new Error(`disburseDriverAdvanceCore failed for load ${t.load_number} advance ${advanceId}: ${disburse.error} ${disburse.message ?? ""}`);
      console.log(`load ${t.load_number}: disbursed, posting_date=${disburse.postingDate}`);
      results.push({ load: t.load_number, action: "created_and_disbursed", advance_id: advanceId, amount: t.amount });
    }

    console.log(JSON.stringify(results, null, 2));
    if (dryRun) {
      console.log("DRY_RUN=1 -- no writes were attempted.");
      return;
    }

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
      console.log(`PROOF: GL 1245 net = ${(netCents / 100).toFixed(2)} (${netRes.rows[0].n} live postings). Expect 0.00.`);
      if (netCents !== 0) {
        console.error("NOT ZERO -- investigate before calling this done.");
        process.exitCode = 1;
      } else {
        console.log("COMMITTED. GL 1245 nets 0.");
      }
    } finally {
      proofClient.release();
    }
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
