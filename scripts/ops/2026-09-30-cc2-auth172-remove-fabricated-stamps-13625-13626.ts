#!/usr/bin/env -S npx tsx
/**
 * AUTH-172 -- Lead order (owner-verified, written correction): remove the fabricated delivery
 * stamps on loads 13625/13626's delivery stops. Step 3 of the standing order (AUTH-170 voided the
 * factoring advances, AUTH-171 voided the invoices).
 *
 * ROOT CAUSE: both loads' delivery stops carry actual_arrival_at = actual_departure_at =
 * 2026-09-25T16:00:00.000Z (to the millisecond) with actual_arrival_source IS NULL, and no pickup
 * stamps at all -- confirmed live before writing this script, matching Lead's own measurement
 * exactly. Per CC-1's independent corroboration (before the Aug/Sep investigation freeze landed):
 * this exact signature (equal arrival/departure, NULL source) appears on 27 load_stops rows total
 * across 9 loads including these 2; no committed script under scripts/ops/ or scripts/feed/
 * produces this shape; 13625/13626 specifically were stamped within 26 seconds of each other,
 * 2026-09-28 ~12:57-12:58Z, attributed to changed_by_role='Owner' under the shared session
 * account, consistent with an automated script run as the Owner actor rather than a literal UI
 * click. The specific writer was not identified (step 5, separate, reported not fixed).
 *
 * Lead's order: "They are not evidence and every engine that reads them inherits the lie. Record
 * the removal in the audit trail with this ruling referenced — do not silently null them."
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth172-remove-fabricated-stamps-13625-13626.ts [--apply]
 * (run from repo root; DRY RUN first with no --apply flag)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-172";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const STOPS = [
  { stopId: "8b6132da-be36-45f5-b43f-be06df03a82c", loadDisplay: "13625" },
  { stopId: "737a0781-5241-4264-b973-6bc3fcbc823f", loadDisplay: "13626" },
];

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

  const { appendCrudAudit } = await import(path.join(ROOT, "apps/backend/src/audit/crud-audit.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    for (const s of STOPS) {
      const pre = await client.query<{
        actual_arrival_at: string | null;
        actual_departure_at: string | null;
        actual_arrival_source: string | null;
        stop_type: string;
        load_id: string;
      }>(
        `SELECT actual_arrival_at::text, actual_departure_at::text, actual_arrival_source, stop_type, load_id::text
           FROM mdata.load_stops WHERE id = $1::uuid`,
        [s.stopId]
      );
      const row = pre.rows[0];
      if (!row) throw new Error(`${s.loadDisplay}: stop ${s.stopId} not found -- refusing`);
      if (row.stop_type !== "delivery") throw new Error(`${s.loadDisplay}: stop ${s.stopId} is not a delivery stop -- refusing`);
      if (row.actual_arrival_at !== "2026-09-25 16:00:00+00" || row.actual_departure_at !== "2026-09-25 16:00:00+00" || row.actual_arrival_source !== null) {
        throw new Error(`${s.loadDisplay}: stop state changed since this script was written (${JSON.stringify(row)}) -- refusing, re-verify before removing`);
      }

      await appendCrudAudit(
        client,
        ACTOR_USER_ID,
        "mdata.load_stops.fabricated_delivery_evidence_removed",
        {
          stop_id: s.stopId,
          load_id: row.load_id,
          load_display_id: s.loadDisplay,
          operating_company_id: USMCA,
          removed_actual_arrival_at: row.actual_arrival_at,
          removed_actual_departure_at: row.actual_departure_at,
          reason:
            "AUTH-172: Lead order, owner-verified written correction -- delivery stamp is fabricated (actual_arrival_at == actual_departure_at to the millisecond, actual_arrival_source NULL, no pickup stamps on either stop). 'They are not evidence and every engine that reads them inherits the lie.' Removed, not silently nulled -- this audit row records the removal and what was removed.",
        },
        "warning",
        "AUTH-172"
      );

      const upd = await client.query<{ id: string }>(
        `UPDATE mdata.load_stops
            SET actual_arrival_at = NULL, actual_departure_at = NULL,
                actual_arrival_source = NULL, actual_departure_source = NULL,
                updated_at = now()
          WHERE id = $1::uuid
          RETURNING id::text`,
        [s.stopId]
      );
      console.log(`${s.loadDisplay} (stop ${s.stopId}): removed fabricated stamps, updated ${upd.rows.length} row(s)`);
    }

    // Confirm both loads remain 'dispatched' (Lead's step 4: "The loads stay 'dispatched'. Do not advance them.")
    const loadStatus = await client.query<{ load_number: string; status: string }>(
      `SELECT load_number, status::text FROM mdata.loads WHERE operating_company_id=$1::uuid AND load_number IN ('13625','13626') ORDER BY load_number`,
      [USMCA]
    );
    console.log("Load status (must remain 'dispatched', untouched by this script):", JSON.stringify(loadStatus.rows));
    for (const r of loadStatus.rows) {
      if (r.status !== "dispatched") throw new Error(`${r.load_number}: expected status 'dispatched', found '${r.status}' -- this script does not touch load status, but something else did -- refusing to proceed blind`);
    }

    if (APPLY) {
      await client.query("COMMIT");
      console.log("COMMITTED");
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
