/**
 * ENG-45 ops script: backfill vendor records for the 2 USMCA drivers who are
 * settlement-active but have no matching mdata.vendors row.
 *
 * Drivers:
 *   Carlos Mauricio Carvallo     5363ee51-35f2-430f-9516-5be13e50e253
 *   Leonel Antonio Morales Noguez df9fd576-69dd-4ec0-b1ec-4b382175c3bd
 *
 * Dry-run by default. Pass --apply to commit.
 *
 * Usage:
 *   npx tsx scripts/ops/2026-10-25-cc1-eng45-backfill-driver-vendors-carvallo-noguez.mts
 *   npx tsx scripts/ops/2026-10-25-cc1-eng45-backfill-driver-vendors-carvallo-noguez.mts --apply
 */

import { withLuciaBypass } from "../../apps/backend/src/auth/db.js";
import {
  ensureDriverVendor,
  type EnsureDriverVendorInput,
} from "../../apps/backend/src/mdata/ensure-driver-vendor.shared.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const DRIVERS: Array<{ id: string; displayName: string }> = [
  { id: "5363ee51-35f2-430f-9516-5be13e50e253", displayName: "Carlos Mauricio Carvallo" },
  { id: "df9fd576-69dd-4ec0-b1ec-4b382175c3bd", displayName: "Leonel Antonio Morales Noguez" },
];

const apply = process.argv.includes("--apply");

if (!apply) {
  console.log("[DRY-RUN] Pass --apply to commit changes.");
}

await withLuciaBypass(
  async (client) => {
    if (!apply) {
      await client.query("SAVEPOINT ops_dry_run");
    }

    for (const driver of DRIVERS) {
      const row = await client.query<{
        display_name: string;
        phone: string | null;
        email: string | null;
      }>(
        `SELECT display_name, phone, email
         FROM mdata.drivers
         WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [driver.id, USMCA_COMPANY_ID]
      );

      if (row.rows.length === 0) {
        console.error(`[ERROR] driver ${driver.id} not found in USMCA mdata.drivers — skipping`);
        continue;
      }

      const input: EnsureDriverVendorInput = {
        operatingCompanyId: USMCA_COMPANY_ID,
        driverId: driver.id,
        displayName: row.rows[0].display_name ?? driver.displayName,
        phone: row.rows[0].phone,
        email: row.rows[0].email,
        actorUserId: ACTOR_USER_ID,
      };

      const outcome = await ensureDriverVendor(client, input);
      console.log(`[${apply ? "APPLY" : "DRY-RUN"}] driver=${driver.id} name="${input.displayName}" outcome=${outcome}`);
    }

    if (!apply) {
      await client.query("ROLLBACK TO SAVEPOINT ops_dry_run");
      console.log("[DRY-RUN] rolled back — no changes committed.");
    } else {
      console.log("[APPLY] changes committed.");
    }
  },
  { actorUserId: ACTOR_USER_ID }
);
