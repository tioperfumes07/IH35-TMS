/**
 * CC-3 ENG-29 / ENG-53 — backfill miles_driven_actual on delivered USMCA loads the hourly cron missed.
 * WHAT:
 *   1) never-computed loads (miles_driven_actual_computed_at IS NULL), any age
 *   2) stale NULL loads whose stop actual arrival/departure is newer than computed_at
 *      (ENG-53 13690 class — fences/times arrived after a NULL reason was frozen)
 * DRY RUN by default (prints counts, no writes). --apply commits.
 * AUTH: OWNER must issue a valid OPEN AUTH id in OWNER-AUTHORIZATIONS.md before --apply
 *   (do not invent; prior AUTH-ENG29-BACKFILL-MILES was refused as invalid id format).
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
const AUTH_ID = process.env.OWNER_AUTH_ID;
if (APPLY) {
  if (!AUTH_ID) {
    console.error("REFUSED: --apply requires OWNER_AUTH_ID (OPEN AUTH in OWNER-AUTHORIZATIONS.md). Do not invent.");
    process.exit(1);
  }
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
  const { rows: allLoads } = await c.query<{ id: string; computed_at: string | null; miles: string | null }>(
    `SELECT l.id::text, l.miles_driven_actual_computed_at::text AS computed_at, l.miles_driven_actual::text AS miles
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

  const { rows: staleNullRows } = await c.query<{ id: string }>(
    `SELECT l.id::text
       FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.voided_at IS NULL AND l.canceled_at IS NULL
        AND l.assigned_unit_id IS NOT NULL
        AND l.miles_driven_actual IS NULL
        AND l.miles_driven_actual_computed_at IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM mdata.load_stops s
           WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL
             AND (
               (s.actual_arrival_at IS NOT NULL AND s.actual_arrival_at > l.miles_driven_actual_computed_at)
               OR (s.actual_departure_at IS NOT NULL AND s.actual_departure_at > l.miles_driven_actual_computed_at)
             )
        )
      ORDER BY l.id`,
    [USMCA_CO],
  );

  const neverComputed = allLoads.filter((r) => r.computed_at == null);
  const alreadyComputed = allLoads.filter((r) => r.computed_at != null);
  const staleNullIds = new Set(staleNullRows.map((r) => r.id));
  const targets = [
    ...neverComputed.map((r) => r.id),
    ...[...staleNullIds].filter((id) => !neverComputed.some((r) => r.id === id)),
  ];

  console.log(`Total delivered USMCA loads: ${allLoads.length}`);
  console.log(`  already computed (miles_driven_actual_computed_at set): ${alreadyComputed.length}`);
  console.log(`  never computed: ${neverComputed.length}`);
  console.log(`  stale NULL (stop times after computed_at): ${staleNullIds.size}`);
  console.log(`  backfill targets: ${targets.length}`);

  if (targets.length === 0) {
    console.log("Nothing to backfill.");
    await c.query("ROLLBACK");
    process.exit(0);
  }

  const db = c as unknown as Parameters<typeof computeLoadRealDrivenMiles>[0];
  let changed = 0;
  let computed = 0;
  let nulled = 0;

  for (let i = 0; i < targets.length; i += 50) {
    const batch = targets.slice(i, i + 50);
    const rows = await computeLoadRealDrivenMiles(db, USMCA_CO, batch);
    computed += rows.length;
    nulled += rows.filter((r) => r.miles_driven_actual == null).length;
    if (APPLY) {
      const n = await persistLoadRealDrivenMiles(db, USMCA_CO, rows);
      changed += n ?? 0;
    } else {
      // Dry-run: show sample (prefer newly fillable)
      const fillable = rows.filter((r) => r.miles_driven_actual != null);
      for (const row of (fillable.length ? fillable : rows).slice(0, 5)) {
        console.log(
          `  [dry] load ${row.load_id}: miles=${row.miles_driven_actual ?? "NULL"} source=${row.source ?? ""} reason=${row.reason ?? ""}`,
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
