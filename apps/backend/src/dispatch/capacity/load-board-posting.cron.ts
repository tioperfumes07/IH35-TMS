/**
 * ENGINE: load-board truck posting sync (DAT / Truckstop)
 * SCHEDULE: *\/15 * * * *
 * WRITES: dispatch.load_board_postings (+ the board's own API when connected)
 * IDEMPOTENCY: UNIQUE(operating_company_id, unit_id, board) upsert; a posting is re-sent only when origin/date/equipment changed
 * OVERLAP: leaseSeconds = JOB_LEASE_SECONDS — single-fire across instances
 * WITHDRAW: a unit booked further out, offer turned off, or without a position is withdrawn on the next tick.
 * GATE: a board is synced only when its API credentials are configured; otherwise boardStatus() reports
 *   "Not connected — needs <board> API credentials" and nothing is called.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../../auth/db.js";
import { assertTenantContext } from "../../cron/_helpers/tenant-context-guard.js";
import { JOB_LEASE_SECONDS, wrapBackgroundJobTick } from "../../lib/background-jobs.js";
import { filterLiveEngineCompanyRows } from "../../lib/live-engine-companies.js";
import { boardStatus, LOAD_BOARDS, syncLoadBoardPostings } from "./load-board-posting.service.js";

export const LOAD_BOARD_POSTING_JOB = "dispatch.load_board_posting_sync";
let initialized = false;

export async function runLoadBoardPostingTick() {
  if (!LOAD_BOARDS.some((b) => boardStatus(b).connected)) return;
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE deactivated_at IS NULL ORDER BY id`
    );
    for (const company of filterLiveEngineCompanyRows(companies.rows)) {
      assertTenantContext(String(company.id ?? ""), LOAD_BOARD_POSTING_JOB);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      await syncLoadBoardPostings(client, company.id);
    }
  });
}

export function initializeLoadBoardPostingCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  cron.schedule(
    "*/15 * * * *",
    async () => {
      await wrapBackgroundJobTick(LOAD_BOARD_POSTING_JOB, () => runLoadBoardPostingTick(), app.log, { leaseSeconds: JOB_LEASE_SECONDS });
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );
  const status = LOAD_BOARDS.map((b) => boardStatus(b));
  app.log.info({ status }, "Load-board posting cron scheduled (every 15 min; boards without API credentials are not called)");
}
