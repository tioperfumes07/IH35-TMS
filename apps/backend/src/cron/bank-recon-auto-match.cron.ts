import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { findCandidates, PERSISTABLE_MATCH_KINDS } from "../accounting/bank-recon/match.service.js";

let initialized = false;

/**
 * Nightly bank-recon auto-match: for each active company, find unmatched bank
 * transactions in the rolling 90-day window and run findCandidates(), which
 * internally stores an auto_matched record when score + amount + date criteria
 * are all satisfied (Q11 tolerance rule).
 */
export type BankReconAutoMatchSummary = {
  companies: number;
  scanned: number;
  /** Transactions for which findCandidates actually WROTE a reconciliation_matches row. */
  autoMatched: number;
  /** Transactions with a confident candidate that is NOT persistable (kind 'bill'). Nothing was
   *  written for these; they were previously counted inside autoMatched, inflating it. */
  autoMatchUnpersistable: number;
};

export async function runBankReconAutoMatchTick(
  log?: { info?: (obj: unknown, msg?: string) => void }
): Promise<BankReconAutoMatchSummary> {
  let totalScanned = 0;
  let totalAutoMatched = 0;
  let totalUnpersistable = 0;
  let companyCount = 0;
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );
    companyCount = companies.rows.length;

    for (const company of companies.rows) {
      assertTenantContext(String(company.id ?? ""), "accounting.bank_recon_auto_match_cron");
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);

      // Fetch unmatched transactions for this company in the last 90 days
      const txns = await client.query<{ id: string }>(
        `
          SELECT bt.id::text AS id
          FROM banking.bank_transactions bt
          WHERE bt.operating_company_id = $1::uuid
            AND bt.transaction_date >= (now() - interval '90 days')::date
            AND NOT EXISTS (
              SELECT 1
              FROM banking.reconciliation_matches rm
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
      let unpersistableCount = 0;
      for (const txn of txns.rows) {
        const candidates = await findCandidates({
          operating_company_id: company.id,
          bank_transaction_id: txn.id,
        });
        // LV-TXN-012 — COUNT WHAT WAS STORED, NOT WHAT WAS CONSIDERED.
        //
        // This used to be `candidates.some((c) => c.auto_match)`, which counts a transaction as
        // auto-matched whenever ANY candidate is confident enough — including kinds findCandidates
        // deliberately refuses to persist. Of the six LedgerEntryKind members, 'bill' is not in
        // PERSISTABLE_MATCH_KINDS (the banking.reconciliation_matches CHECK constraint rejects it),
        // so a transaction whose only confident candidate is a bill was reported as auto-matched
        // while NOTHING was written for it.
        //
        // findCandidates persists at most ONE row — the highest-scoring candidate that is both
        // auto_match and persistable — so that exact predicate is what the metric must mirror.
        // Candidates that were confident but unpersistable are still worth surfacing; they are the
        // measure of what a 'bill' persistence tier would unlock. They are now reported separately
        // instead of being silently folded into a number that reads as work completed.
        if (candidates.some((c) => c.auto_match && PERSISTABLE_MATCH_KINDS.has(c.ledger_entry_kind))) {
          autoMatchedCount += 1;
        } else if (candidates.some((c) => c.auto_match)) {
          unpersistableCount += 1;
        }
      }

      // P2-BANK-AUTOMATCH: do NOT discard the metric. Surface per-company scanned/auto-matched counts so
      // an enabled run is observable (was `void {...}` → silently dropped).
      totalScanned += txns.rows.length;
      totalAutoMatched += autoMatchedCount;
      totalUnpersistable += unpersistableCount;
      if (txns.rows.length > 0) {
        log?.info?.(
          {
            operating_company_id: company.id,
            scanned: txns.rows.length,
            auto_matched: autoMatchedCount,
            auto_match_unpersistable: unpersistableCount,
          },
          "[bank-recon-auto-match] company tick"
        );
      }
    }
  });
  const summary: BankReconAutoMatchSummary = {
    companies: companyCount,
    scanned: totalScanned,
    autoMatched: totalAutoMatched,
    autoMatchUnpersistable: totalUnpersistable,
  };
  log?.info?.(summary, "[bank-recon-auto-match] tick summary");
  return summary;
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
          await runBankReconAutoMatchTick(app.log);
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Bank recon auto-match cron scheduled (nightly 02:15 America/Chicago)");
}
