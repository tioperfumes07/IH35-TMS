/**
 * CC-3 ENG-29 — backfill miles_driven_actual on all delivered USMCA loads outside the cron's 14-day window.
 * WHAT: the hourly cron picks up never-computed loads (miles_driven_actual_computed_at IS NULL) but only for
 *   loads delivered/updated in the last 14 days. Older delivered loads with real fence data are never computed.
 *   This script runs computeLoadRealDrivenMiles + persistLoadRealDrivenMiles on ALL delivered USMCA loads,
 *   regardless of age, so the backfill completes the set.
 * DRY RUN by default (prints counts, no writes). --apply commits.
 * AUTH: AUTH-ENG29-BACKFILL-MILES (owner must issue before --apply).
 */
import pg from "pg";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  computeLoadRealDrivenMiles,
  persistLoadRealDrivenMiles,
  storageReady,
} from "../../apps/backend/src/telematics/load-real-driven-miles.service.js";

const USMCA_CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-ENG29-BACKFILL-MILES";

if (APPLY) {
  const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

try {
  await c.query("BEGIN");
  await c.query(`SET app.operating_company_id = '${USMCA_CO}'`);

  const ready = await storageReady(c as unknown as Parameters<typeof storageReady>[0]);
  if (!ready) {
    console.error("ERROR: migration 202615160000 not applied — miles_driven_actual columns missing. Aborting.");
    await c.query("ROLLBACK");
    process.exit(1);
  }

  // All delivered loads (last stop arrived), not voided, not canceled, has assigned unit.
  // No 14-day window — we want the full historical set.
  const { rows: allLoads } = await c.query<{ id: string; computed_at: string | null }>(
    `SELECT l.id::text, l.miles_driven_actual_computed_at::text AS computed_at
       FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.voided_at IS NULL AND l.canceled_at IS NULL
        AND l.assigned_unit_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM mdata.load_stops s
           WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.actual_arrival_at IS NOT NULL
        )
      ORDER BY l.id`,
    [USMCA_CO],
  );

  const neverComputed = allLoads.filter((r) => r.computed_at == null);
  const alreadyComputed = allLoads.filter((r) => r.computed_at != null);

  console.log(`Total delivered USMCA loads: ${allLoads.length}`);
  console.log(`  already computed (miles_driven_actual_computed_at set): ${alreadyComputed.length}`);
  console.log(`  never computed: ${neverComputed.length}`);

  if (neverComputed.length === 0) {
    console.log("Nothing to backfill.");
    await c.query("ROLLBACK");
    process.exit(0);
  }

  const db = c as unknown as Parameters<typeof computeLoadRealDrivenMiles>[0];
  let changed = 0;
  let computed = 0;
  let nulled = 0;

  for (let i = 0; i < neverComputed.length; i += 50) {
    const batch = neverComputed.slice(i, i + 50);
    const rows = await computeLoadRealDrivenMiles(db, USMCA_CO, batch.map((r) => r.id));
    computed += rows.length;
    nulled += rows.filter((r) => r.miles_driven_actual == null).length;
    if (APPLY) {
      const n = await persistLoadRealDrivenMiles(db, USMCA_CO, rows);
      changed += n ?? 0;
    } else {
      // Dry-run: show sample
      for (const row of rows.slice(0, 3)) {
        console.log(
          `  [dry] load ${row.load_id}: miles=${row.miles_driven_actual ?? "NULL"} reason=${row.reason ?? ""}`,
        );
      }
    }
  }

  console.log(`Computed: ${computed} loads (${nulled} NULL with reason, ${computed - nulled} have miles)`);
  if (APPLY) {
    console.log(`Persisted: ${changed} loads changed`);
    await c.query("COMMIT");
    console.log("COMMIT OK");
  } else {
    await c.query("ROLLBACK");
    console.log("DRY RUN (no writes) — re-run with --apply to persist");
  }
} catch (err) {
  await c.query("ROLLBACK");
  console.error("ERROR:", err);
  process.exit(1);
} finally {
  await c.end();
}
