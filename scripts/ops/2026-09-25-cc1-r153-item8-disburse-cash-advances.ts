/**
 * ROUND 153 item 8 — cash advances are BILL PAYMENTS (closed law).
 *
 * SELF-FOUND, CHANGES THE WHOLE PLAN: rehearsing the originally-planned action (disburse
 * CA-2026-0001..0007 via disburseDriverAdvanceCore, which POSTS A NEW JE) on a Neon rehearsal
 * branch surfaced that their GL impact ALREADY EXISTS, live on production since 2026-09-24 --
 * journal_entries.id c8e25275-aee2-4fef-8b2b-82f8ba69ccf7, memo "ACCT-F20260925i TB close: ...
 * backfill CA issuance DR 1245 ... CA issuance backfill 12 advances", 12 (Dr 1245 / Cr 1000) pairs,
 * each source_transaction_id matching one of the 12 live driver_finance.driver_advances rows
 * exactly, by amount, to the cent. Running the originally-planned disbursement would have DOUBLE-
 * POSTED $1,595.96 of real GL entries. Caught before touching production (AUTH-002, issued for
 * that original plan, is left to expire unused -- see docs/bus/OWNER-AUTHORIZATIONS.md).
 *
 * SEPARATE, REAL DEFECT FOUND IN THAT SAME ALREADY-LIVE BACKFILL JE: CA-2026-0008 ($167.87) and
 * CA-2026-0009 ($34.12) sum to $201.99 EXACTLY -- matching CA-2026-0007's own amount to the cent,
 * for the SAME driver (Angel Alfonso Sosa Perez) and the SAME load (13546). 01-ENGINES/
 * feed_input.json's signed-document line for that load carries exactly ONE cash_advance line,
 * $201.99 (matching 0007 only). 0008+0009 are a live, already-posted DUPLICATE of that single real
 * event -- $201.99 of real GL entries posted twice. Corrected here with a small, clearly-labelled
 * correcting journal entry (Cr 1245 / Dr 1000, $201.99) referencing the original JE by id, plus the
 * existing reverseDriverAdvanceInClientTx subledger-void path for the two duplicate rows -- never
 * editing the original posted JE, never deleting anything.
 *
 * THIS SCRIPT DOES TWO THINGS, BOTH IDEMPOTENT:
 *   1. Syncs disbursement_status -> 'disbursed' (+ disbursed_at = the backfill JE's own created_at)
 *      for CA-2026-0001..0007 -- pure subledger status sync, ZERO new GL entries (their GL already
 *      exists and is correct). The 3 CA-2026-TIE-* rows are already 'disbursed'; not touched.
 *   2. Posts one correcting JE for the CA-2026-0008/0009 duplicate (Cr 1245 / Dr 1000, $201.99),
 *      then reverses those two rows via the existing reverseDriverAdvanceInClientTx path
 *      (disbursement_status='reversed', voided_at stamped, driver_liabilities closed to $0).
 *
 * After this: driver_finance.driver_advances disbursement_status = 'disbursed' for all 10 real,
 * distinct cash-advance events (7 synced here + 3 already-disbursed TIE-*), 'reversed' for the 2
 * duplicate rows, and 1245's net balance reflects exactly 10 real events, not 12.
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
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001"; // role=Administrator, live-verified
const BACKFILL_JE_ID = "c8e25275-aee2-4fef-8b2b-82f8ba69ccf7";
const ACCOUNT_1245 = "e4d191a2-621f-4d95-bcda-c4822ed1176e"; // Driver Cash Advances Receivable
const ACCOUNT_1000 = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3"; // Bank of America - Operating (USMCA)

const STATUS_SYNC_DISPLAY_IDS = [
  "CA-2026-0001", "CA-2026-0002", "CA-2026-0003", "CA-2026-0004",
  "CA-2026-0005", "CA-2026-0006", "CA-2026-0007",
];
// STALE-LITERAL-OK: $201.99 is the exact, already-posted duplicate amount (167.87 + 34.12), the
// correcting entry's own fixed target, never re-derived.
const DUPLICATE_TOTAL_CENTS = 20199;

async function main() {
  const { createJournalEntryOnClient } = await import("../../apps/backend/src/accounting/journal-entries.service.js");
  const { reverseDriverAdvanceInClientTx } = await import("../../apps/backend/src/cash-advances/cash-advance-create.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const results: Array<Record<string, unknown>> = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    // Step 0: confirm the backfill JE is still what this script's own analysis found, live, right
    // now -- refuse to act on a stale assumption.
    const backfillRes = await client.query<{ id: string; created_at: string }>(
      `SELECT id::text, created_at::text FROM accounting.journal_entries
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status = 'posted'`,
      [BACKFILL_JE_ID, USMCA_ID]
    );
    const backfill = backfillRes.rows[0];
    if (!backfill) throw new Error(`backfill JE ${BACKFILL_JE_ID} not found/posted live -- STOP, do not proceed on a stale assumption`);

    // Step 1: status sync for the 7 real, already-GL-posted advances. No new JE.
    for (const displayId of STATUS_SYNC_DISPLAY_IDS) {
      const upd = await client.query<{ id: string }>(
        `UPDATE driver_finance.driver_advances
            SET disbursement_status = 'disbursed', disbursed_at = $3::timestamptz, updated_at = now()
          WHERE operating_company_id = $1::uuid AND display_id = $2 AND disbursement_status = 'approved'
          RETURNING id::text`,
        [USMCA_ID, displayId, backfill.created_at]
      );
      if (upd.rows[0]) {
        console.log(`STATUS SYNCED ${displayId} -> disbursed (id=${upd.rows[0].id})`);
        results.push({ display_id: displayId, action: "status_synced" });
      } else {
        console.log(`SKIP ${displayId}: not found or already not 'approved' (idempotent no-op)`);
        results.push({ display_id: displayId, action: "skipped_not_approved_or_missing" });
      }
    }

    // Step 2: the two duplicate rows.
    const dupRes = await client.query<{ id: string; display_id: string; disbursement_status: string; liability_id: string | null }>(
      `SELECT id::text, display_id, disbursement_status::text, liability_id::text
         FROM driver_finance.driver_advances
        WHERE operating_company_id = $1::uuid AND display_id IN ('CA-2026-0008', 'CA-2026-0009')`,
      [USMCA_ID]
    );
    const stillApproved = dupRes.rows.filter((r) => r.disbursement_status === "approved");
    if (stillApproved.length === 2) {
      const correctingJe = await createJournalEntryOnClient(
        client,
        {
          operating_company_id: USMCA_ID,
          entry_date: new Date().toISOString().slice(0, 10),
          memo:
            `ACCT-F20260925j correcting entry: CA-2026-0008 ($167.87) + CA-2026-0009 ($34.12) duplicate ` +
            `CA-2026-0007's own $201.99 cash advance for load 13546 (same driver, same load, feed_input.json ` +
            `carries only one cash_advance line for it). Reverses the duplicate GL impact posted in ` +
            `journal_entries ${BACKFILL_JE_ID} ("CA issuance backfill 12 advances"). Original JE not edited.`,
          source: "manual",
          postings: [
            { account_id: ACCOUNT_1245, debit_or_credit: "credit", amount_cents: DUPLICATE_TOTAL_CENTS, description: "Reverse duplicate CA-2026-0008/0009 (dup of CA-2026-0007)" },
            { account_id: ACCOUNT_1000, debit_or_credit: "debit", amount_cents: DUPLICATE_TOTAL_CENTS, description: "Reverse duplicate CA-2026-0008/0009 (dup of CA-2026-0007)" },
          ],
        },
        { userId: SYSTEM_ACTOR_USER_ID, role: "Administrator" }
      );
      console.log(`CORRECTING JE posted: ${correctingJe.id}`);
      results.push({ action: "correcting_je_posted", journal_entry_id: correctingJe.id });

      for (const dup of stillApproved) {
        await reverseDriverAdvanceInClientTx(client, SYSTEM_ACTOR_USER_ID, USMCA_ID, {
          advanceId: dup.id,
          liabilityId: dup.liability_id,
          reason: `Duplicate of CA-2026-0007's $201.99 cash advance (load 13546) -- corrected by JE ${correctingJe.id}, ROUND 153 item 8.`,
        });
        console.log(`REVERSED (subledger) ${dup.display_id}`);
        results.push({ display_id: dup.display_id, action: "reversed" });
      }
    } else {
      console.log(`SKIP duplicate correction: expected 2 rows still 'approved', found ${stillApproved.length} (idempotent no-op)`);
      results.push({ action: "skipped_duplicate_correction_already_done", found_approved: stillApproved.length });
    }

    if (process.env.DRY_RUN === "1") {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
    console.log(JSON.stringify(results, null, 2));
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
