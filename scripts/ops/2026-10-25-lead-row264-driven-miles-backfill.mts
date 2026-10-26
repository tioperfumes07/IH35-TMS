/**
 * LEAD row 264 (ENG-29) — 10-25-2026. Dry run by default (rolled back); --apply commits.
 * Completed USMCA loads with no real driven miles: mint their stop fences, replay the assigned unit's STORED GPS fixes
 * around the trip through the canonical fence detector (suppressOperationalSideEffects — immutable fence events only),
 * capture the real OBD odometer at each crossing (or 'absent'), then compute + persist real driven miles with the one
 * engine (NULL with its reason where a boundary has no real read — never interpolated, never 0).
 */
import pg from "pg";
import { backfillCompletedLoadFenceEvidence } from "../../apps/backend/src/telematics/load-stop-geofence-sync.service.js";
import { captureGeofenceOdometerEvents } from "../../apps/backend/src/integrations/samsara/geofences/geofence-odometer-capture.service.js";
import { computeLoadRealDrivenMiles, persistLoadRealDrivenMiles } from "../../apps/backend/src/telematics/load-real-driven-miles.service.js";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
// --ids a,b,c re-runs only those loads (e.g. the ones that lost a lock race with the live positions tick).
const IDS_ARG = process.argv.includes("--ids") ? String(process.argv[process.argv.indexOf("--ids") + 1] ?? "").split(",").filter(Boolean) : null;
// Owner authorization (verify-no-unauthorized-production-write): an --apply refuses unless AUTH-471 is open on main.
if (APPLY) {
  const { execFileSync } = await import("node:child_process");
  try { execFileSync("node", ["scripts/verify-owner-authorization.mjs", process.env.OWNER_AUTH_ID ?? "AUTH-471"], { stdio: "inherit" }); } catch { process.exit(1); }
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const out: Record<string, unknown> = { mode: APPLY ? "APPLY" : "DRY RUN (rolled back)" };
const count = async () =>
  (await client.query(
    `SELECT count(*) FILTER (WHERE miles_driven_actual IS NOT NULL)::int AS with_miles, count(*)::int AS loads
       FROM mdata.loads WHERE operating_company_id = $1 AND status::text <> 'cancelled' AND soft_deleted_at IS NULL`,
    [CO]
  )).rows[0];
// One short transaction per load (a single 180-load transaction deadlocked with the live positions tick on the
// detector's per-fence advisory locks). Dry run: each load's work is rolled back; --apply commits each load.
const tx = async <T>(fn: () => Promise<T>, commit: boolean): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      await client.query("SET LOCAL lock_timeout = '15s'");
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [CO]);
      const r = await fn();
      await client.query(commit ? "COMMIT" : "ROLLBACK");
      return r;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (attempt < 4 && /deadlock|lock timeout|could not obtain lock/i.test(String((e as Error).message))) {
        await new Promise((res) => setTimeout(res, 1500 * attempt));
        continue;
      }
      throw e;
    }
  }
};
const sum = { loads: 0, fences_bound: 0, positions_checked: 0, events_written: 0, skipped_no_fence: 0, captures: 0, persisted: 0 };
const failed: string[] = [];
try {
  out.before = await tx(count, false);
  const ids = await tx(async () => (await client.query(
    `SELECT id::text FROM mdata.loads WHERE operating_company_id = $1 AND status::text <> 'cancelled'
        AND soft_deleted_at IS NULL AND miles_driven_actual IS NULL
        AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[])) ORDER BY 1`, [CO, IDS_ARG])).rows.map((r: { id: string }) => r.id), false);
  for (const id of ids) {
    try {
      await tx(async () => {
        const b = await backfillCompletedLoadFenceEvidence(client as never, CO, { loadIds: [id] });
        sum.loads += b.loads; sum.fences_bound += b.fences_bound; sum.positions_checked += b.positions_checked;
        sum.events_written += b.events_written; sum.skipped_no_fence += b.skipped_no_fence;
        sum.captures += (await captureGeofenceOdometerEvents(client as never, { operatingCompanyId: CO })).length;
        const rows = await computeLoadRealDrivenMiles(client as never, CO, [id]);
        sum.persisted += Number((await persistLoadRealDrivenMiles(client as never, CO, rows)) ?? 0);
      }, APPLY);
    } catch (e) {
      failed.push(`${id}: ${String((e as Error).message).slice(0, 120)}`);
    }
  }
  out.sum = sum;
  out.failed = failed.slice(0, 10);
  out.failed_count = failed.length;
  out.after = await tx(count, false);
  out.reasons_left = await tx(async () => (await client.query(
    `SELECT left(coalesce(miles_driven_actual_reason, '-'), 70) AS reason, count(*)::int AS n FROM mdata.loads
      WHERE operating_company_id = $1 AND status::text <> 'cancelled' AND soft_deleted_at IS NULL AND miles_driven_actual IS NULL
      GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [CO])).rows, false);
  out.status = APPLY ? "COMMITTED_PER_LOAD" : "DRY_RUN_ROLLED_BACK_PER_LOAD";
} catch (e) {
  out.status = "ERROR";
  out.error = String((e as Error).stack ?? e).slice(0, 600);
} finally {
  await client.end();
}
console.log(JSON.stringify(out, null, 2));
