// RECON-01 — cron tick orchestration. Two scheduled passes (AM bank-count 06:00 CT, PM categorization-diff
// 19:00 CT) iterate the entities whose TMS_QBO_RECON_ENABLED flag is ON and run the corresponding read-only
// pass. Default OFF → a no-op in prod until the owner flips it per entity. The live QBO source (Reports
// client) is wired only when Martin's 2024 close is stable; until then createQboReconSource returns null and
// the tick records NOTHING for that entity (it never fabricates a QBO side — an empty QBO side would false-flag
// every TMS row). Runs under lucia bypass (system identity) so the engine's FORCED-RLS inserts are permitted.
import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { runBankCountPass, runCategorizationDiffPass, type QboReconSource } from "./recon-engine.service.js";

export const RECON_FLAG_KEY = "TMS_QBO_RECON_ENABLED";

/** The live QBO register source. Returns null until wired (post-Martin-stable-close). Kept as a seam so the
 *  engine + cron are complete and testable now, and only this one function changes when QBO is connected. */
function createQboReconSource(_operatingCompanyId: string): QboReconSource | null {
  return null;
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

      const run =
        pass === "am"
          ? await runBankCountPass(client, c.id, windowStart, windowEnd, source, null)
          : await runCategorizationDiffPass(client, c.id, windowStart, windowEnd, source, null);
      result.entities_run++;
      result.runs.push({ operating_company_id: c.id, run_id: run.run_id, exceptions: run.exceptions });
    }
    return result;
  });
}
