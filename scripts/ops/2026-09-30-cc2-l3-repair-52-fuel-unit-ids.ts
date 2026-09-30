#!/usr/bin/env -S npx tsx
/**
 * L-3 (Lead order, ROUND 299, "THE LINKAGE LAW" -- docs/bus/2026-09-30-LEAD-ROUND-299-ALL-SEATS-LINKAGE-LAW.md):
 * "The 52 fuel rows carry a load and a driver. The unit is resolvable from the load's
 * assigned_unit_id and from the driver's assignment window at the transaction timestamp -- use
 * driver-attribution.ts, the helper you already built, do not write a second resolver. Report how
 * many of 52 resolve, and name the ones that do not rather than forcing them."
 *
 * Resolution: unitAtTimeSql(driver-attribution.ts) added as the mirror of driverAtTimeSql,
 * resolving unit-from-driver-at-time (needed here, since the driver is already known and the
 * missing fact is which truck). Cross-checked against mdata.loads.assigned_unit_id, the OTHER
 * independently-recorded fact on each row. Live result (2026-09-30, rolled back): 52/52 resolve.
 * 12 of 52 corroborated by BOTH signals, agreeing exactly (0 disagreements anywhere). The other
 * 40 resolve via assigned_unit_id only -- the driver had no covering
 * telematics.vehicle_driver_assignments window at that exact transaction timestamp (a coverage
 * gap on the assignment table, not a conflict), so the load's own already-recorded unit is the
 * only signal available for those 40, not a fabricated guess.
 *
 * STANDING OWNER FREEZE (docs/bus/2026-09-30-OWNER-FREEZE-NO-SEAT-WRITES-MONEY-OR-LOAD-DATA.md):
 * "No seat creates, edits, voids, deletes, recategorises, renumbers, BACKFILLS or reclassifies
 * ANY of the following in production, for any reason, including proof... Any ops script with
 * --apply against production: FROZEN." This script's dry-run (report-only) ran first and was
 * reported to the owner directly, with the exact 52/52 resolve, 12-both-agree/40-load-only/
 * 0-disagree/0-unresolved breakdown. The owner, verbatim, in chat: "write the 52 fuel unit ids i
 * authorize it, so do it." AUTH-178 (docs/bus/OWNER-AUTHORIZATIONS.md) records that authorization
 * as a permanent, reviewable artifact before --apply is allowed to run, per the same
 * claim-before-write discipline as every other AUTH script this session.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-l3-repair-52-fuel-unit-ids.ts [--apply]
 * (dry run by default; --apply gated by verify-owner-authorization.mjs like every other AUTH script)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { unitAtTimeSql } from "../../apps/backend/src/maintenance/driver-attribution.js";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-178"; // owner order, 2026-09-30, "write the 52 fuel unit ids i authorize it, so do it"

type Row = {
  fuel_txn_id: string;
  transaction_at: string;
  load_id: string;
  driver_id: string;
  load_unit_id: string | null;
  attribution_unit_id: string | null;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    if (APPLY) {
      await assertIsIntendedProduction(client);
    }
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const res = await client.query<Row>(
      `
      SELECT
        ft.id::text AS fuel_txn_id,
        ft.transaction_at::text,
        ft.load_id::text,
        ft.driver_id::text,
        l.assigned_unit_id::text AS load_unit_id,
        dat.unit_id::text AS attribution_unit_id
      FROM fuel.fuel_transactions ft
      JOIN mdata.loads l ON l.id = ft.load_id
      ${unitAtTimeSql("ft.driver_id", "ft.transaction_at", "dat")}
      WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL
        AND ft.load_id IS NOT NULL AND ft.driver_id IS NOT NULL AND ft.unit_id IS NULL
      ORDER BY ft.transaction_at
      `,
      [USMCA]
    );

    let bothAgree = 0;
    let disagree = 0;
    let loadOnly = 0;
    let unresolved = 0;
    const toApply: { id: string; unitId: string }[] = [];
    const namedUnresolved: Row[] = [];
    const namedDisagreements: Row[] = [];

    for (const row of res.rows) {
      if (row.load_unit_id && row.attribution_unit_id) {
        if (row.load_unit_id === row.attribution_unit_id) {
          bothAgree++;
          toApply.push({ id: row.fuel_txn_id, unitId: row.load_unit_id });
        } else {
          disagree++;
          namedDisagreements.push(row);
        }
      } else if (row.load_unit_id) {
        loadOnly++;
        toApply.push({ id: row.fuel_txn_id, unitId: row.load_unit_id });
      } else {
        unresolved++;
        namedUnresolved.push(row);
      }
    }

    console.log(`Total rows (load+driver, no unit): ${res.rows.length}`);
    console.log(`Both signals present and agree: ${bothAgree}`);
    console.log(`Both signals present, DISAGREE (never written, named below): ${disagree}`);
    console.log(`load.assigned_unit_id only: ${loadOnly}`);
    console.log(`Unresolved by either method (named below): ${unresolved}`);
    console.log(`Total that WOULD be written: ${toApply.length}`);
    if (namedDisagreements.length) {
      console.log("\nDISAGREEMENTS (never forced, named per L-3's own instruction):");
      console.log(JSON.stringify(namedDisagreements, null, 2));
    }
    if (namedUnresolved.length) {
      console.log("\nUNRESOLVED (never forced, named per L-3's own instruction):");
      console.log(JSON.stringify(namedUnresolved, null, 2));
    }

    if (APPLY) {
      for (const row of toApply) {
        await client.query(`UPDATE fuel.fuel_transactions SET unit_id = $1::uuid WHERE id = $2::uuid`, [row.unitId, row.id]);
      }
      await client.query("COMMIT");
      console.log(`COMMITTED -- ${toApply.length} rows updated`);
    } else {
      await client.query("ROLLBACK");
      console.log("DRY RUN — rolled back, nothing written");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
