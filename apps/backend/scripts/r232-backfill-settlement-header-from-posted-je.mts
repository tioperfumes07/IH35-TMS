#!/usr/bin/env node
/**
 * ROUND 23.2 / ACCT-F26307 — ONE-TIME BACKFILL, USMCA ONLY.
 *
 * Both settlement GL posters (settlement-payrun-close.service.ts's closeSettlementPayRun AND
 * settlement-posting/settlement-bill-payment-posting.service.ts's postSettlementBillPayment) compute
 * gross/deductions/reimbursements/net correctly and post a fully-balanced JE reflecting them, but
 * neither ever wrote those numbers back onto driver_finance.driver_settlements.{gross_pay,
 * deductions_total, reimbursements_total, net_pay} — the header fields every report, the driver
 * statement, and the owner's own live reads actually show. Fixed going forward in THIS PR (both
 * posters now write the header in the same transaction they post in). This script is the one-time
 * correction for every settlement that ALREADY posted before the fix landed.
 *
 * SAFE BY CONSTRUCTION: this writes NO new financial fact. It reads the settlement's own
 * already-posted, already-balanced journal entry (via driver_finance.payrun_gl_runs ->
 * accounting.journal_entries -> accounting.journal_entry_postings) and copies what that JE already
 * says onto the header display fields. No JE is created, voided, or modified. No bill, bill_payment,
 * deduction, or settlement_line is touched. Idempotent (re-running recomputes the same numbers from
 * the same JE and writes them again -- no-op on a second run).
 *
 * DERIVATION (role-keyed, not hardcoded account ids):
 *   gross_pay           = JE debit to the driver_pay_expense role account
 *   net_pay             = JE credit to the driver_payroll_clearing role account ("Driver Net-Pay
 *                          Clearing") -- this IS the settlement's net pay by definition of what that
 *                          account means; reading it directly is more authoritative than
 *                          re-deriving it from a formula.
 *   deductions_total    = every OTHER credit line on the JE (admin fee / escrow / advance recovery /
 *                          chargeback -- whatever role each credits)
 *   reimbursements_total= every OTHER debit line on the JE (reimbursement expense, detention pay --
 *                          folds detention in since there is no separate header column for it and it
 *                          is a debit-side addition to net exactly like a reimbursement)
 * Assert gross - deductions + reimbursements = net for every settlement this backfills (the JE is
 * already balanced, so this must hold structurally; a mismatch means the role-account resolution
 * above picked the wrong account for that JE and the settlement is SKIPPED, not guessed).
 *
 * Scope: only settlements where a payrun_gl_runs OR driver_settlement_gl_runs row is 'posted' AND
 * the header's current net_pay does not already match what the JE says (so a second run touches
 * nothing). USMCA only.
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r232-backfill-settlement-header-from-posted-je.mts            # PREVIEW (default)
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r232-backfill-settlement-header-from-posted-je.mts --commit   # write
 */
import pg from "pg";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA

// S-2026-0011 is the known duplicate mega-row for tour 5782 (9-misgrouped-mega-rows family, CC-2's
// B5 1:1 re-cut). Its own posted JE (net 2,881.45) does NOT match document 5782's signed TOTAL DUE
// (1,456.86, matched instead by the sibling row S-2026-5782) -- live-verified cross-check against
// data/alwaystrack/settlements-truth-2026-09-13.json, the only anomaly among 36 posted settlements.
// Writing "correctly" onto this header would still leave a duplicate transaction looking authoritative;
// this is CC-2's re-cut to resolve, not a header-sync fix. Excluded, not silently "fixed."
const KNOWN_DUPLICATE_SKIP = new Set<string>(["S-2026-0011"]);

const fmt = (c: number) => (c / 100).toFixed(2);

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required");

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [OPCO]);

    const { rows: settlements } = await client.query<{
      settlement_id: string;
      source_document_ref: string | null;
      display_id: string;
      journal_entry_id: string;
      current_net_pay: string;
    }>(
      `
      SELECT ds.id AS settlement_id, ds.source_document_ref, ds.display_id, je.journal_entry_id, ds.net_pay::text AS current_net_pay
      FROM driver_finance.driver_settlements ds
      JOIN LATERAL (
        SELECT journal_entry_id FROM driver_finance.payrun_gl_runs
         WHERE settlement_id = ds.id AND status = 'posted' AND journal_entry_id IS NOT NULL
         UNION ALL
        SELECT deduction_journal_entry_id FROM driver_finance.driver_settlement_gl_runs
         WHERE settlement_id = ds.id AND status = 'posted' AND deduction_journal_entry_id IS NOT NULL
        LIMIT 1
      ) je ON true
      WHERE ds.operating_company_id = $1::uuid
        AND ds.status <> 'cancelled'
      ORDER BY ds.source_document_ref NULLS LAST, ds.id
      `,
      [OPCO]
    );

    console.log(`Found ${settlements.length} posted USMCA settlement(s) with a JE anchor.\n`);
    console.log("doc   display_id      je gross    net(JE)    ded        reimb      curr net   action");
    console.log("----- --------------- ---------- ---------- ---------- ---------- ---------- ------------------");

    let fixedCount = 0;
    let skippedCount = 0;
    let alreadyOkCount = 0;

    for (const s of settlements) {
      if (KNOWN_DUPLICATE_SKIP.has(s.display_id)) {
        console.log(`${(s.source_document_ref ?? "-").padEnd(5)} ${s.display_id.padEnd(15)} ${"-".padStart(10)} ${"-".padStart(10)} ${"-".padStart(10)} ${"-".padStart(10)} ${fmt(Math.round(Number(s.current_net_pay) * 100)).padStart(10)} SKIP known duplicate mega-row (CC-2 B5 re-cut)`);
        skippedCount += 1;
        continue;
      }
      const { rows: postings } = await client.query<{
        role: string | null;
        debit_or_credit: string;
        amount_cents: string;
      }>(
        `
        SELECT car.role, jep.debit_or_credit, jep.amount_cents::text
        FROM accounting.journal_entry_postings jep
        LEFT JOIN accounting.chart_of_accounts_roles car
          ON car.account_id = jep.account_id AND car.operating_company_id = $2::uuid AND car.is_active = true
        WHERE jep.journal_entry_uuid = $1::uuid
        `,
        [s.journal_entry_id, OPCO]
      );

      let grossCents = 0;
      let netCents = 0;
      let deductionsCents = 0;
      let reimbursementsCents = 0;
      let sawGross = false;
      let sawNet = false;

      for (const p of postings) {
        const amt = Math.round(Number(p.amount_cents));
        if (p.role === "driver_pay_expense" && p.debit_or_credit === "debit") {
          grossCents += amt;
          sawGross = true;
        } else if (p.role === "driver_payroll_clearing" && p.debit_or_credit === "credit") {
          netCents += amt;
          sawNet = true;
        } else if (p.debit_or_credit === "credit") {
          deductionsCents += amt;
        } else if (p.debit_or_credit === "debit") {
          reimbursementsCents += amt;
        }
      }

      const label = `${(s.source_document_ref ?? "-").padEnd(5)} ${s.display_id.padEnd(15)}`;
      if (!sawGross || !sawNet) {
        console.log(`${label} ${"-".padStart(10)} ${"-".padStart(10)} ${"-".padStart(10)} ${"-".padStart(10)} ${fmt(Math.round(Number(s.current_net_pay) * 100)).padStart(10)} SKIP no gross/net role leg found`);
        skippedCount += 1;
        continue;
      }
      const derivedNet = grossCents + reimbursementsCents - deductionsCents;
      if (derivedNet !== netCents) {
        console.log(`${label} ${fmt(grossCents).padStart(10)} ${fmt(netCents).padStart(10)} ${fmt(deductionsCents).padStart(10)} ${fmt(reimbursementsCents).padStart(10)} ${fmt(Math.round(Number(s.current_net_pay) * 100)).padStart(10)} SKIP identity mismatch (derived ${fmt(derivedNet)} != JE net ${fmt(netCents)}) -- role resolution ambiguous, not guessing`);
        skippedCount += 1;
        continue;
      }

      const currentNetCents = Math.round(Number(s.current_net_pay) * 100);
      if (currentNetCents === netCents) {
        console.log(`${label} ${fmt(grossCents).padStart(10)} ${fmt(netCents).padStart(10)} ${fmt(deductionsCents).padStart(10)} ${fmt(reimbursementsCents).padStart(10)} ${fmt(currentNetCents).padStart(10)} already correct`);
        alreadyOkCount += 1;
        continue;
      }

      console.log(`${label} ${fmt(grossCents).padStart(10)} ${fmt(netCents).padStart(10)} ${fmt(deductionsCents).padStart(10)} ${fmt(reimbursementsCents).padStart(10)} ${fmt(currentNetCents).padStart(10)} ${commit ? "FIXED" : "WOULD FIX"}`);
      fixedCount += 1;

      if (commit) {
        await client.query(
          `UPDATE driver_finance.driver_settlements
              SET gross_pay = $2::numeric, deductions_total = $3::numeric, reimbursements_total = $4::numeric,
                  net_pay = $5::numeric, updated_at = now()
            WHERE id = $1::uuid`,
          [s.settlement_id, fmt(grossCents), fmt(deductionsCents), fmt(reimbursementsCents), fmt(netCents)]
        );
      }
    }

    console.log(`\n${fixedCount} ${commit ? "fixed" : "would fix"}, ${alreadyOkCount} already correct, ${skippedCount} skipped (need manual review).`);

    if (commit) {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    } else {
      await client.query("ROLLBACK");
      console.log("PREVIEW ONLY -- rolled back. Re-run with --commit to persist.");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, rolled back:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
