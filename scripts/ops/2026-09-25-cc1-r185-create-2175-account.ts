/**
 * R-185 step 1, live creation: the "2175 Driver Reimbursements Payable" parent account (owner-
 * approved number) + one per-driver child for each of the 11 distinct driver_uuids on the 27
 * driver-paid/company-flagged expenses in ~/ih35-worktrees/.cr1000.json (kind="drv" 25 + the 2 that
 * joined per Lead's later R-187 G5 ruling: 13516-8, 13568-13 are the PDF "Drv" rows despite their
 * "comp" tag in that file).
 *
 * Uses the provisionDriverReimbursementSubAccount function added in ACCT-F2026092593 -- no new
 * writer, reuses the exact same provisioning pattern the escrow/advance sub-accounts already use.
 *
 * FLAG (not fixed here, reported): driver_uuid 40823a77-d8d4-481c-88cb-1387556aa98e and
 * dcd683f5-b8a1-46a8-aa6b-093732e70b92 are BOTH named "ALFONSO HIDALGO CHAVEZ" (both status
 * Inactive, created 2 days apart, mdata.drivers) -- the same duplicate-driver-record class already
 * found and reported to the owner for "ANGEL ALFONSO SOSA" (fba21d80/52037e93) earlier this session,
 * not merged there either. provisionDriverReimbursementSubAccount resolves by NAME, so both
 * driver_uuids correctly route to the SAME "ALFONSO HIDALGO CHAVEZ" 2175 child (the economically
 * correct outcome if they are the same real person, which the evidence strongly suggests) -- flagged
 * here rather than silently assumed; the owner decides whether to merge the underlying driver rows.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

// The 11 distinct driver_uuids from ~/ih35-worktrees/.cr1000.json's 27 rows (measured live 2026-09-25).
const DRIVER_IDS = [
  "a785bea7-6dde-4bf9-81b9-b9135c2df4b5", // PEDRO ABRAHAM LOPEZ COLLADO
  "5dd518ff-db91-429f-b651-a71b5f0db672", // Leonel Antonio Morales
  "40823a77-d8d4-481c-88cb-1387556aa98e", // ALFONSO HIDALGO CHAVEZ (see FLAG above)
  "45fac397-860e-4fe8-ae18-67e12e1959c1", // JOSE ANTONIO VICENTE MARTINEZ
  "3445cf68-4a7f-4d73-89f7-04bf1fd207b4", // HUGO GAYTAN
  "6edcb351-e81b-4bf2-adf7-5eca9eff9137", // GENARO GUERRERO CHAVEZ
  "dcd683f5-b8a1-46a8-aa6b-093732e70b92", // ALFONSO HIDALGO CHAVEZ (see FLAG above -- same name as 40823a77)
  "a32a35c8-7cd5-4368-83f0-35e185092433", // Neftali Coronado Urbano
  "93be328f-ba1b-4175-adaf-bb619c1c51f2", // Fernando Mecor Hernandez
  "3e138476-06db-4b08-9ebe-527a5d8c591d", // Jorge Luis Infante Corona
  "61727a46-af2e-4d33-8236-e2d99b737708", // Carlos Mauricio Pena Carvallo
];

async function main() {
  const { ensureDriverReimbursementParent, provisionDriverReimbursementSubAccount } = await import(
    "../../apps/backend/src/accounting/driver-subaccount-provision.service.js"
  );

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dryRun = process.env.DRY_RUN === "1";
  const results: Array<Record<string, unknown>> = [];

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

      const drivers = await client.query<{ id: string; first_name: string; last_name: string }>(
        `SELECT id::text, first_name, last_name FROM mdata.drivers WHERE id = ANY($1::uuid[])`,
        [DRIVER_IDS]
      );
      if (drivers.rows.length !== DRIVER_IDS.length) {
        throw new Error(`Expected ${DRIVER_IDS.length} drivers, found ${drivers.rows.length} -- STOP`);
      }

      if (dryRun) {
        const parentExisting = await client.query<{ id: string }>(
          `SELECT id::text FROM catalogs.accounts WHERE account_name = 'Driver Reimbursements Payable' AND account_type = 'Liability' AND parent_account_id IS NULL AND operating_company_id = $1::uuid`,
          [USMCA_ID]
        );
        console.log(`Parent '2175 Driver Reimbursements Payable' exists: ${parentExisting.rows[0]?.id ?? "NO -- will create"}`);
        for (const d of drivers.rows) {
          const name = `${d.first_name} ${d.last_name}`.trim();
          console.log(`  would provision: ${d.id} -> "${name}"`);
          results.push({ driver_id: d.id, driver_name: name, status: "dry_run_would_provision" });
        }
        await client.query("ROLLBACK");
        console.log(JSON.stringify(results, null, 2));
        console.log("DRY_RUN=1 -- no writes were attempted.");
        return;
      }

      const parentId = await ensureDriverReimbursementParent(client as never, {
        operatingCompanyId: USMCA_ID,
        actorUserId: SYSTEM_ACTOR_USER_ID,
      });
      console.log(`Parent '2175 Driver Reimbursements Payable' = ${parentId}`);

      for (const d of drivers.rows) {
        const driverName = `${d.first_name} ${d.last_name}`.trim();
        const r = await provisionDriverReimbursementSubAccount(client as never, {
          operatingCompanyId: USMCA_ID,
          driverId: d.id,
          driverName,
          actorUserId: SYSTEM_ACTOR_USER_ID,
        });
        console.log(`  ${d.id} ("${driverName}"): ${JSON.stringify(r)}`);
        results.push({ driver_id: d.id, driver_name: driverName, ...r });
      }

      await client.query("COMMIT");
      console.log(JSON.stringify(results, null, 2));
      console.log("COMMITTED.");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
