#!/usr/bin/env tsx
/**
 * ROUND 189 STOP-THE-LINE (Lead): the 6 loads booked under AUTH-061 (13609, 13616, 13617, 13618,
 * 13620, 13621) went live with no mileage and, since a driver bill needs miles_shortest > 0
 * (book-load.service.ts: `!(Number(load.miles_shortest ?? 0) > 0)` refuses the mint), no driver bill
 * and therefore no settlement line -- redding verify-purge-era-closures-still-hold arm 39 (missing
 * mileage) and verify-no-empty-zero-settlement (their 4 brand-new pre-settlements: P-0008/P-0009/
 * P-0010/P-0011, each with exactly this one load and $0 net pay, no lines).
 *
 * Source of truth for mileage: the SAME xlsx rows AUTH-061 booked from. All 6 rows carry
 * St.Miles=0/E.Miles=0 (AlwaysTrack does not capture shortest-miles on a still-in-transit load) and a
 * real, nonzero L.Miles. miles_shortest = miles_practical here is NOT invented: it is the exact same
 * fallback already coded into book-load.service.ts's own INSERT path (line ~2590,
 * `Number(input.miles_shortest ?? 0) > 0 ? input.miles_shortest : input.miles_practical ?? null`) --
 * made explicit here because this is an UPDATE, which that INSERT-only fallback does not reach.
 * mileage_source='History' per Lead's instruction (AlwaysTrack-sourced, not operator-entered).
 *
 * Fix, in order, per load:
 *   1. updateDispatchLoad() (the real Edit Load path, never a raw UPDATE) sets miles_practical/
 *      miles_shortest/miles_deadhead. This ALSO re-enters ensureDriverBillArtifactsForLoad in the
 *      same transaction (update-load.service.ts's own DRV-BILL-SKIP-PATHS re-entry), which mints the
 *      driver bill now that miles_shortest is present.
 *   2. mileage_source: the update-load route/service has NO field for this column at all (verified
 *      live -- present on createDispatchLoadBodySchema, absent from updateDispatchLoadBodySchema and
 *      UpdateDispatchLoadFields; a real engine gap, not a shortcut taken here). A narrowly-scoped,
 *      disclosed raw UPDATE of ONLY mdata.loads.mileage_source (metadata, not a dollar-math field) --
 *      same class of disclosed exception the ROUND 27.1 reference script names in its own header.
 *   3. appendSettlementLineFromDriverBillIfMissing() (the canonical settlement-engine writer) turns
 *      the freshly-minted bill into a real driver_finance.settlement_lines row on the load's own
 *      pre-settlement -- closing verify-no-empty-zero-settlement for that settlement.
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 189: OWNER_AUTH_ID env var is required.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 189: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

// xlsx L.Miles / E.Miles for these 6 rows (load history report 09-21-26 without cancelled loads.xlsx).
const MILEAGE: Record<string, { practical: number; deadhead: number }> = {
  "13609": { practical: 994.8, deadhead: 0 },
  "13616": { practical: 1897.7, deadhead: 0 },
  "13617": { practical: 1602.5, deadhead: 0 },
  "13618": { practical: 1348.0, deadhead: 0 },
  "13620": { practical: 1543.0, deadhead: 0 },
  "13621": { practical: 1958.9, deadhead: 0 },
};

async function main() {
  const { updateDispatchLoad } = await import("../../apps/backend/src/dispatch/update-load.service.js");
  const { appendSettlementLineFromDriverBillIfMissing } = await import(
    "../../apps/backend/src/driver-finance/settlement-engine.js"
  );

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const [loadNumber, mi] of Object.entries(MILEAGE)) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("RESET ROLE");
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

        const loadRow = await client.query<{
          id: string; miles_practical: string | null; assigned_primary_driver_id: string | null; presettlement_link_id: string | null;
        }>(
          `SELECT id::text, miles_practical::text, assigned_primary_driver_id::text, presettlement_link_id::text
             FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number=$2`,
          [USMCA_ID, loadNumber]
        );
        if (!loadRow.rows[0]) throw new Error(`${loadNumber}: not found`);
        const load = loadRow.rows[0];

        let driverBillMint: unknown = "already_had_mileage";
        if (load.miles_practical == null) {
          const updateResult = await updateDispatchLoad(client as never, {
            loadId: load.id,
            operatingCompanyId: USMCA_ID,
            requestingUserUuid: OWNER_USER_ID,
            requestingUserRole: "Owner",
            fields: { miles_practical: mi.practical, miles_shortest: mi.practical, miles_deadhead: mi.deadhead },
          } as never);
          driverBillMint = (updateResult as { driver_bill_mint?: unknown }).driver_bill_mint;

          // Narrow, disclosed exception (see header): mileage_source has no field on the update path.
          await client.query(
            `UPDATE mdata.loads SET mileage_source='History', updated_at=now() WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
            [load.id, USMCA_ID]
          );
        } else {
          console.log(`${loadNumber}: mileage already set (${load.miles_practical}) -- skipping mileage write, still checking settlement line`);
        }

        let lineResult: unknown = "no_presettlement_link";
        if (load.presettlement_link_id && load.assigned_primary_driver_id) {
          lineResult = await appendSettlementLineFromDriverBillIfMissing(client as never, {
            settlementId: load.presettlement_link_id,
            operatingCompanyId: USMCA_ID,
            driverId: load.assigned_primary_driver_id,
            loadId: load.id,
            actorUserId: OWNER_USER_ID,
          });
        }

        await client.query("COMMIT");
        console.log(`${loadNumber}: driver_bill_mint=${JSON.stringify(driverBillMint)} settlement_line_append=${JSON.stringify(lineResult ?? "void_returned")}`);
        results.push({ load_number: loadNumber, status: "ok", driver_bill_mint: driverBillMint });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
    console.log(JSON.stringify(results, null, 2));
    console.log("DONE.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
