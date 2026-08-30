/**
 * TASK 8 / FLEET-LEASE-08 C, C2 -- counterparties and the corrected lease shell.
 *
 * OWNER RULING (2026-08-30, ruled twice, final -- see FINAL-INSTRUCTIONS-FOR-ALL-CODERS/CC-1):
 * the intercompany lease BILL's vendor/lessor is IH 35 Transportation, NOT IH 35 Trucking. An
 * earlier pass (this same session) built the lease shell with lessor=Trucking, reasoning from
 * mdata.units.currently_leased_to_company_id -- a fact read overriding an owner decision, which
 * the owner explicitly voided. That row was voided under WORM (never updated in place); this
 * script creates the corrected replacement.
 *
 * Also creates:
 *   - "IH 35 Transportation LLC" vendor under USMCA (the lease bill's actual vendor).
 *   - "IH 35 Trucking LLC" vendor under USMCA -- ALREADY EXISTS from an earlier pass this
 *     session (id 4beca7c7-1fb1-4b57-9bff-856d566255f5), still needed per the packet (both
 *     affiliates get a USMCA vendor row), not recreated here.
 *   - "2EMS TRANSPORTATION" as a CUSTOMER under IH 35 Trucking (TRK): Trucking leased 14 units TO
 *     them, so 2EMS owes Trucking lease income -- a customer relationship, not a vendor one.
 *     External third party per the owner; not modeled as intercompany.
 *
 * Does NOT create new GL accounts: QBO-228-USMCA "Leased Trucks from IH35 TRUCKING" already
 * exists and is already role-bound to rent_expense for USMCA; the bill posts through the
 * existing ap_control role, per the owner's own correction ("a bill cannot credit anything but
 * ap_control" -- posting-engine.service.ts:1442/1720-1724). Does NOT post any bill or payment.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fleet-lease-08-counterparties-and-lease-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fleet-lease-08-counterparties-and-lease-once.mts --commit  # apply
 */
import pg from "pg";
import { createLeaseContract } from "../apps/backend/src/accounting/lease-asc842/lease.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const TRK = "b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const VOIDED_LEASE_ID = "cf677452-c50f-44ef-bfca-87c9c4446033"; // already voided this session

const COMMIT = process.argv.includes("--commit");
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const voidCheck = await client.query<{ voided_at: string | null }>(
      `SELECT voided_at::text FROM accounting.lease_contract WHERE id = $1::uuid`,
      [VOIDED_LEASE_ID]
    );
    console.log("Old (wrong-lessor) lease_contract voided_at:", voidCheck.rows[0]?.voided_at);
    if (!voidCheck.rows[0]?.voided_at) {
      throw new Error("expected the old lease_contract to already be voided -- refusing to proceed");
    }

    const existingTransportVendor = await client.query(
      `SELECT id, vendor_name FROM mdata.vendors WHERE operating_company_id = $1::uuid AND lower(vendor_name) = lower($2)`,
      [USMCA, "IH 35 Transportation LLC"]
    );
    console.log("Existing 'IH 35 Transportation LLC' vendor under USMCA:", existingTransportVendor.rows[0] ?? "none");

    const existing2ems = await client.query(
      `SELECT id, customer_name FROM mdata.customers WHERE operating_company_id = $1::uuid AND lower(customer_name) LIKE '%2ems%'`,
      [TRK]
    );
    console.log("Existing '2EMS%' customer under TRK:", existing2ems.rows[0] ?? "none");

    const existingTranspLease = await client.query(
      `SELECT id, status FROM accounting.lease_contract WHERE lessor_operating_company_id = $1::uuid AND lessee_operating_company_id = $2::uuid AND voided_at IS NULL`,
      [TRANSP, USMCA]
    );
    console.log("Existing live TRANSP->USMCA lease_contract:", existingTranspLease.rows[0] ?? "none");

    if (!COMMIT) {
      console.log("DRY RUN -- pass --commit to apply. No writes made.");
      return;
    }
    if (existingTransportVendor.rows[0]) throw new Error("IH 35 Transportation LLC vendor already exists -- refusing to duplicate");
    if (existing2ems.rows[0]) throw new Error("a 2EMS customer already exists under TRK -- refusing to duplicate");
    if (existingTranspLease.rows[0]) throw new Error("a live TRANSP->USMCA lease_contract already exists -- refusing to duplicate");

    // 1. Vendor: IH 35 Transportation LLC (USMCA) -- the lease bill's actual vendor.
    // GUARD (self-caught bug, same class as run-mdata-copy-04): app.bypass_rls set via
    // set_config(...,true) only lives for the transaction it was set in -- re-set it fresh inside
    // EVERY BEGIN block, never rely on the one set at the top of main() still being active.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    let transportVendorId: string;
    try {
      const res = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.vendors (
            vendor_name, vendor_type, vendor_category, operating_company_id,
            qbo_vendor_id, is_sample_data, created_by_user_id, updated_by_user_id
          )
          VALUES ($1, $2, $3, $4::uuid, NULL, false, $5::uuid, $5::uuid)
          RETURNING id::text
        `,
        ["IH 35 Transportation LLC", "Other", "rent", USMCA, ACTOR_USER_UUID]
      );
      transportVendorId = res.rows[0]!.id;
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
        "mdata.vendors.created",
        "info",
        JSON.stringify({ resource_type: "mdata.vendors", resource_id: transportVendorId, operating_company_id: USMCA, name: "IH 35 Transportation LLC" }),
        ACTOR_USER_UUID,
        "TASK8-C2-FLEET-LEASE-08",
      ]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
    console.log("VENDOR CREATED (IH 35 Transportation LLC, USMCA):", transportVendorId);

    // 2. Customer: 2EMS TRANSPORTATION under TRK (external, Trucking leased 14 units to them).
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    let ems2CustomerId: string;
    try {
      const res = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.customers (
            customer_name, operating_company_id, status, is_sample_data, factoring_eligible,
            source_system, source, created_by_user_id, updated_by_user_id
          )
          VALUES ($1, $2::uuid, 'active', false, false, 'tms', $3, $4::uuid, $4::uuid)
          RETURNING id::text
        `,
        ["2EMS TRANSPORTATION", TRK, "TASK8-C2-FLEET-LEASE-08: external lessee, 14 units leased from IH 35 Trucking, executed contract on file", ACTOR_USER_UUID]
      );
      ems2CustomerId = res.rows[0]!.id;
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
        "mdata.customers.created",
        "info",
        JSON.stringify({ resource_type: "mdata.customers", resource_id: ems2CustomerId, operating_company_id: TRK, name: "2EMS TRANSPORTATION" }),
        ACTOR_USER_UUID,
        "TASK8-C2-FLEET-LEASE-08",
      ]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
    console.log("CUSTOMER CREATED (2EMS TRANSPORTATION, TRK):", ems2CustomerId);

    // 3. Corrected lease shell: lessor=TRANSP, lessee=USMCA. Same placeholder discipline as the
    // voided row (owner supplies real term/amount/election) -- election left at the service's own
    // pre-existing 'operating' default; payment_amount_cents/total_lease_payments_cents = 0 (the
    // only schema-legal "not priced" value); number_of_periods=1, commencement=end=today (minimum
    // schema-legal placeholders, self-evidently not a real term). rate_per_unit_cents/
    // unit_count_basis left NULL -- the owner supplies the real per-unit rate.
    const today = new Date().toISOString().slice(0, 10);
    const { id: newLeaseId } = await createLeaseContract(
      {
        operatingCompanyId: USMCA,
        lessorOperatingCompanyId: TRANSP,
        lesseeName: "USMCA Freight Solutions Inc",
        lesseeOperatingCompanyId: USMCA,
        displayId: "LEASE-DRAFT-PENDING-OWNER-TERMS-TRANSP",
        commencementDate: today,
        endDate: today,
        paymentAmountCents: 0,
        paymentFrequency: "monthly",
        numberOfPeriods: 1,
        totalLeasePaymentsCents: 0,
      },
      { userId: ACTOR_USER_UUID }
    );
    console.log("CORRECTED LEASE SHELL CREATED (lessor=TRANSP, lessee=USMCA):", newLeaseId);

    const finalLease = await client.query(
      `SELECT id, status, lessor_operating_company_id, lessee_operating_company_id, display_id FROM accounting.lease_contract WHERE id = $1::uuid`,
      [newLeaseId]
    );
    console.log("FINAL LEASE ROW:", finalLease.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
