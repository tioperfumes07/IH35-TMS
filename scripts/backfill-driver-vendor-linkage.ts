#!/usr/bin/env tsx
/**
 * scripts/backfill-driver-vendor-linkage.ts — SEED/DRIVERS-ARE-VENDORS historical backfill.
 * Root cause already fixed (ensure-driver-vendor.shared.ts now mints vendor_type='Driver'). This
 * completes the two live gaps measured on Neon (USMCA, bypass_rls=lucia):
 *   (a) active drivers with no mdata.vendors row at all — closed by calling the REAL
 *       POST /api/v1/mdata/vendors/ensure-drivers route (now correctly typed post-fix), never a
 *       direct INSERT.
 *   (b) existing driver-linked vendors mis-typed vendor_type='Other' — re-typed via the REAL
 *       PATCH /api/v1/mdata/vendors/:id route, one call per row (real audit trail, same as any
 *       operator edit), USMCA-scoped only (TRANSP/TRK are frozen — never touched by this script).
 *
 * NO DIRECT SQL FOR WRITES. Reads use the standard BEGIN + bypass_rls (in the SAME transaction as
 * the read) pattern — a bare set_config with no BEGIN silently discards the bypass before the real
 * query runs and produces a false-empty read (hit this exact landmine earlier this session).
 *
 * Usage:
 *   DATABASE_URL=<neon prod> npx tsx scripts/backfill-driver-vendor-linkage.ts --dry-run
 *   DATABASE_URL=<neon prod> npx tsx scripts/backfill-driver-vendor-linkage.ts --apply
 */
import pg from "pg";
import { createIntegrationApp } from "../apps/backend/test-helpers/http-app.js";
import { registerVendorRoutes } from "../apps/backend/src/mdata/vendors.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");
  if (apply && args.includes("--dry-run")) throw new Error("choose --dry-run or --apply, not both");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerVendorRoutes(a);
  });
  const authHeader = {
    "x-test-auth": Buffer.from(
      JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }),
      "utf8"
    ).toString("base64url"),
  };

  // 1. Gather: existing driver-linked 'Other' vendors, USMCA-scoped only.
  const client = await pool.connect();
  let otherVendors: Array<{ id: string; vendor_name: string }> = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const res = await client.query<{ id: string; vendor_name: string }>(
      `SELECT id::text, vendor_name FROM mdata.vendors
        WHERE operating_company_id = $1::uuid AND driver_id IS NOT NULL AND vendor_type = 'Other'`,
      [USMCA_COMPANY_ID]
    );
    otherVendors = res.rows;
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  console.log(`found ${otherVendors.length} USMCA driver-linked vendor(s) typed 'Other'`);

  if (dryRun) {
    console.log(`DRY-RUN | would call POST /api/v1/mdata/vendors/ensure-drivers for ${USMCA_COMPANY_ID}`);
    console.log(`DRY-RUN | would PATCH vendor_type='Driver' on ${otherVendors.length} vendor(s): ${otherVendors.map((v) => v.vendor_name).join(", ")}`);
    return;
  }

  // 2. Ensure every active driver has a (now correctly-typed) vendor row.
  const ensureRes = await app.inject({
    method: "POST",
    url: "/api/v1/mdata/vendors/ensure-drivers",
    headers: authHeader,
    payload: { operating_company_id: USMCA_COMPANY_ID },
  });
  if (ensureRes.statusCode >= 300) throw new Error(`ensure-drivers failed: ${ensureRes.statusCode} ${ensureRes.body}`);
  console.log(`ensure-drivers result: ${ensureRes.body}`);

  // 3. Re-type the pre-existing 'Other' rows to 'Driver', one real PATCH per row.
  let retyped = 0;
  let failed = 0;
  for (const v of otherVendors) {
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/vendors/${v.id}`,
      headers: authHeader,
      payload: { vendor_type: "Driver" },
    });
    if (patchRes.statusCode >= 300) {
      console.log(`FAILED re-type ${v.vendor_name} (${v.id}) — ${patchRes.statusCode} ${patchRes.body}`);
      failed += 1;
      continue;
    }
    retyped += 1;
  }

  console.log(`CC-3 | DRIVER-VENDOR BACKFILL DONE | re-typed ${retyped}/${otherVendors.length} (${failed} failed)`);

  await pool.end();
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
