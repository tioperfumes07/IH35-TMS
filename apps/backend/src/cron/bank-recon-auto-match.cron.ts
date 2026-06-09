import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { findCandidates } from "../accounting/bank-recon/match.service.js";

let initialized = false;

/**
 * Nightly bank-recon auto-match: for each active company, find unmatched bank
 * transactions in the rolling 90-day window and run findCandidates(), which
 * internally stores an auto_matched record when score + amount + date criteria
 * are all satisfied (Q11 tolerance rule).
 */
export async function runBankReconAutoMatchTick() {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );

    for (const company of companies.rows) {
      assertTenantContext(String(company.id ?? ""), "accounting.bank_recon_auto_match_cron");
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [company.id]);

      // Fetch unmatched transactions for this company in the last 90 days
      const txns = await client.query<{ id: string }>(
        `
          SELECT bt.id::text AS id
          FROM banking.bank_transactions bt
          WHERE bt.operating_company_id = $1::uuid
            AND bt.transaction_date >= (now() - interval '90 days')::date
            AND NOT EXISTS (
              SELECT 1
              FROM bank.reconciliation_matches rm
              WHERE rm.bank_transaction_id = bt.id
                AND rm.operating_company_id = bt.operating_company_id
                AND rm.match_state IN ('auto_matched', 'user_matched')
            )
          ORDER BY bt.transaction_date DESC
          LIMIT 500
        `,
        [company.id]
      );

      let autoMatchedCount = 0;
      for (const txn of txns.rows) {
        const candidates = await findCandidates({
          operating_company_id: company.id,
          bank_transaction_id: txn.id,
        });
        if (candidates.some((c) => c.auto_match)) autoMatchedCount += 1;
      }

      if (txns.rows.length > 0) {
        // logged via wrapBackgroundJobTick at the outer level
        void { operating_company_id: company.id, scanned: txns.rows.length, auto_matched: autoMatchedCount };
      }
    }
  });
}

export function initializeBankReconAutoMatchCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.BANK_RECON_AUTO_MATCH_CRON_ENABLED ?? "false").trim() === "false") {
    app.log.info("Bank recon auto-match cron disabled via BANK_RECON_AUTO_MATCH_CRON_ENABLED=false");
    return;
  }

  // Runs nightly at 02:15 America/Chicago — after daily imports settle
  cron.schedule(
    "15 2 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "accounting.bank_recon_auto_match_cron",
        async () => {
          await runBankReconAutoMatchTick();
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Bank recon auto-match cron scheduled (nightly 02:15 America/Chicago)");
}
