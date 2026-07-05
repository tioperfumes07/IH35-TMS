// RECON-01 — cron tick orchestration. Two scheduled passes (AM bank-count 06:00 CT, PM categorization-diff
// 19:00 CT) iterate the entities whose TMS_QBO_RECON_ENABLED flag is ON and run the corresponding read-only
// pass. Default OFF → a no-op in prod until the owner flips it per entity. The live QBO source (Reports
// client) is wired only when Martin's 2024 close is stable; until then createQboReconSource returns null and
// the tick records NOTHING for that entity (it never fabricates a QBO side — an empty QBO side would false-flag
// every TMS row). Runs under lucia bypass (system identity) so the engine's FORCED-RLS inserts are permitted.
import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { qboCompanyContext, qboQuery } from "../../integrations/qbo/qbo-client.js";
import type { ReconEntry } from "./recon-engine.service.js";
import { runBankCountPass, runCategorizationDiffPass, type QboReconSource } from "./recon-engine.service.js";

export const RECON_FLAG_KEY = "TMS_QBO_RECON_ENABLED";

/**
 * Canonical `_system.background_jobs` job names for the two recon passes. Used both by the standalone
 * Render cron entrypoint (run-recon.ts) to record each run and by the /healthz staleness rule so a
 * silently-dead recon pass surfaces on the deep health check (G4-HEALTH).
 */
export function reconJobName(pass: "am" | "pm"): string {
  return pass === "am" ? "accounting.recon_am_bank_count" : "accounting.recon_pm_categorization_diff";
}

type QboRegisterTxn = {
  Id: string;
  TxnDate: string;
  TotalAmt?: number | string;
  DocNumber?: string;
  PrivateNote?: string;
  AccountRef?: { value?: string; name?: string };
  DepositToAccountRef?: { value?: string; name?: string };
};

/** The live QBO register source (WIRED 2026-07-04). Pulls the entity's QBO bank register (Deposits = money
 *  IN, Purchases = money OUT) for the window and maps to ReconEntry using the SAME signed convention as the
 *  TMS side (credit/deposit positive). Auth comes from the live integrations.qbo_connections tokens via
 *  qboCompanyContext; any QBO API/auth error THROWS (the caller records the run as failed) so we NEVER
 *  fabricate an empty QBO side — an empty side would false-flag every TMS row. Only entities whose
 *  TMS_QBO_RECON_ENABLED flag is ON reach here, and by policy that flag is flipped only for QBO-connected
 *  entities. NOTE (verify before trusting flags): covers Deposit + Purchase; Transfer / BillPayment / Payment
 *  / JournalEntry that also hit bank accounts are a follow-up. QBO Purchase/Deposit field shapes should be
 *  confirmed against real data on first live run. */
function createQboReconSource(operatingCompanyId: string): QboReconSource | null {
  void operatingCompanyId;
  return {
    async bankEntries(opco: string, windowStart: string, windowEnd: string): Promise<ReconEntry[]> {
      const ctx = await qboCompanyContext(opco); // throws if the entity has no live QBO connection
      const ws = windowStart.slice(0, 10);
      const we = windowEnd.slice(0, 10);
      const entries: ReconEntry[] = [];

      const deposits = await qboQuery<QboRegisterTxn>(
        ctx,
        `SELECT * FROM Deposit WHERE TxnDate >= '${ws}' AND TxnDate <= '${we}' MAXRESULTS 1000`,
      );
      for (const d of (deposits.QueryResponse?.Deposit as QboRegisterTxn[] | undefined) ?? []) {
        entries.push({
          txn_date: d.TxnDate,
          amount_cents: Math.round(Number(d.TotalAmt ?? 0) * 100), // deposit = credit/money-in = positive
          reference: d.PrivateNote ?? d.DocNumber ?? null,
          account_ref: d.DepositToAccountRef?.value ?? "unmapped",
          source_ref: { kind: "bank_txn", id: `qbo:deposit:${d.Id}`, display: d.DocNumber ?? undefined },
        });
      }

      const purchases = await qboQuery<QboRegisterTxn>(
        ctx,
        `SELECT * FROM Purchase WHERE TxnDate >= '${ws}' AND TxnDate <= '${we}' MAXRESULTS 1000`,
      );
      for (const p of (purchases.QueryResponse?.Purchase as QboRegisterTxn[] | undefined) ?? []) {
        entries.push({
          txn_date: p.TxnDate,
          amount_cents: -Math.round(Number(p.TotalAmt ?? 0) * 100), // purchase = money-out = negative
          reference: p.PrivateNote ?? p.DocNumber ?? null,
          account_ref: p.AccountRef?.value ?? "unmapped",
          source_ref: { kind: "bank_txn", id: `qbo:purchase:${p.Id}`, display: p.DocNumber ?? undefined },
        });
      }

      return entries;
    },
  };
}

export type ReconTickResult = {
  pass: "am" | "pm";
  window_start: string;
  window_end: string;
  entities_checked: number;
  entities_run: number;
  skipped_flag_off: number;
  skipped_source_pending: number;
  runs: Array<{ operating_company_id: string; run_id: string; exceptions: number }>;
};

/** Run one reconciliation tick. `now` is injectable for tests (backend runtime passes a real Date). */
export async function runReconTick(pass: "am" | "pm", now: Date = new Date(), windowDays = 1): Promise<ReconTickResult> {
  const windowEnd = now.toISOString();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  return withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(`SELECT id::text FROM org.companies`);
    const result: ReconTickResult = {
      pass, window_start: windowStart, window_end: windowEnd,
      entities_checked: 0, entities_run: 0, skipped_flag_off: 0, skipped_source_pending: 0, runs: [],
    };

    for (const c of companies.rows) {
      result.entities_checked++;
      const on = await isEnabled(client, RECON_FLAG_KEY, { operating_company_id: c.id });
      if (!on) { result.skipped_flag_off++; continue; }

      const source = createQboReconSource(c.id);
      if (!source) {
        result.skipped_source_pending++;
        console.warn(`[recon-cron] ${pass}: TMS_QBO_RECON_ENABLED ON for ${c.id} but the live QBO source is not wired yet — skipping (no data fabricated).`);
        continue;
      }

      try {
        const run =
          pass === "am"
            ? await runBankCountPass(client, c.id, windowStart, windowEnd, source, null)
            : await runCategorizationDiffPass(client, c.id, windowStart, windowEnd, source, null);
        result.entities_run++;
        result.runs.push({ operating_company_id: c.id, run_id: run.run_id, exceptions: run.exceptions });
      } catch (err) {
        // A QBO auth/API failure for one entity must NOT kill the whole tick or fabricate an empty QBO side.
        // Record as source-pending (nothing trusted this pass for this entity) and continue to the next.
        result.skipped_source_pending++;
        console.error(
          `[recon-cron] ${pass}: QBO source failed for ${c.id} — skipping this entity (no data fabricated):`,
          (err as Error)?.message ?? err,
        );
      }
    }
    return result;
  });
}
