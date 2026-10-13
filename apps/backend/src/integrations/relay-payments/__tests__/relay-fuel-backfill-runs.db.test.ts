/**
 * LEAD 443.126 2b — real Postgres: a Relay backfill run whose worker is gone (a deploy replaced the instance) no longer
 * reads "running" forever. It reads "interrupted" with its last committed window, the next start closes it durably,
 * and a resume continues from that window + 1 day. A run with a fresh heartbeat stays "running" (one run per company).
 * Old code: the status read had no heartbeat and no "interrupted" — run 193d5ce1 (2026-10-12) read "running" for good.
 *
 * Audit rows are written with backdated created_at inside ONE rolled-back transaction.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../../test-helpers/refuse-production.js";
import { closeInterruptedBackfillRun, nextIsoDay, readLatestBackfillRun, RELAY_BACKFILL_AUDIT_SOURCE } from "../relay-fuel-backfill-runs.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Relay backfill run state (443.126 2b, real Postgres)", () => {
  it("stale run -> interrupted with last window; closed durably; fresh heartbeat -> running; completed stays completed", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const company = (await db.query<{ id: string }>(`SELECT gen_random_uuid()::text AS id`)).rows[0]!.id;
      const event = (eventClass: string, payload: Record<string, unknown>, minutesAgo: number) =>
        db.query(
          `INSERT INTO audit.audit_events (event_class, severity, payload, source, created_at)
           VALUES ($1, 'info', $2::jsonb, $3, now() - make_interval(mins => $4::int))`,
          [eventClass, JSON.stringify({ operating_company_id: company, ...payload }), RELAY_BACKFILL_AUDIT_SOURCE, minutesAgo]);

      // A killed run: started 25 min ago, last committed window 09-22..09-28 at 22 min ago, nothing since.
      await event("integrations.relay_fuel_ingest_backfill_started", { run_id: "run-killed", months: 1 }, 25);
      await event("integrations.relay_fuel_ingest_backfill_window", { run_id: "run-killed", window_start: "2026-09-15", window_end: "2026-09-21" }, 23);
      await event("integrations.relay_fuel_ingest_backfill_window", { run_id: "run-killed", window_start: "2026-09-22", window_end: "2026-09-28" }, 22);
      const killed = await readLatestBackfillRun(db as never, company);
      expect(killed).toMatchObject({ run_id: "run-killed", status: "interrupted", last_window_end: "2026-09-28", months: 1, completed_at: null });

      // The next start closes it durably; afterwards it reads interrupted from its terminal row, with the same window.
      expect(await closeInterruptedBackfillRun(db as never, killed!, company)).toBe(true);
      const closed = await readLatestBackfillRun(db as never, company);
      expect(closed).toMatchObject({ status: "interrupted", last_window_end: "2026-09-28" });
      expect(closed!.completed_at).not.toBeNull();
      expect(await closeInterruptedBackfillRun(db as never, closed!, company)).toBe(false); // idempotent
      expect(nextIsoDay(closed!.last_window_end!)).toBe("2026-09-29"); // the resume starts here

      // A live run (heartbeat 1 minute ago) is running — a second start is refused by the route on this state.
      await event("integrations.relay_fuel_ingest_backfill_started", { run_id: "run-live", months: 1, resumed_from_run_id: "run-killed" }, 3);
      await event("integrations.relay_fuel_ingest_backfill_window", { run_id: "run-live", window_start: "2026-09-29", window_end: "2026-10-05" }, 1);
      expect(await readLatestBackfillRun(db as never, company)).toMatchObject({ run_id: "run-live", status: "running", resumed_from_run_id: "run-killed", last_window_end: "2026-10-05" });

      // Completed is terminal, whatever its age.
      await event("integrations.relay_fuel_ingest_backfill_completed", { run_id: "run-live", months: 1, pulled: 10, upserted: 2, skipped: 8 }, 0);
      expect(await readLatestBackfillRun(db as never, company)).toMatchObject({ run_id: "run-live", status: "completed", upserted: 2 });
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  }, 60_000);
});
