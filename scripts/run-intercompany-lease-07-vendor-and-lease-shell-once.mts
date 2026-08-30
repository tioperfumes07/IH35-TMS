/**
 * TASK 7 — INTERCOMPANY-LEASE-07. Owner ruling: USMCA leases DIRECTLY from IH 35 Trucking (TRK),
 * no sublease through Transportation. mdata.units already agrees (46 units currently_leased_to
 * USMCA, 38 active+real). Two blockers to the owner booking the real $8,890 equipment-lease bill:
 *
 *   1. USMCA has no vendor record for IH 35 Trucking (only test-artifact matches). Create it,
 *      ACTIVE, is_sample_data FALSE, qbo_vendor_id NULL (that id would belong to a different
 *      entity's QBO file -- TRK's own QBO vendor id has no meaning as USMCA's AP vendor).
 *   2. accounting.lease_contract is empty, zero rows, all entities. Create the head-lease shell:
 *      lessor=TRK, lessee=USMCA, status='draft'.
 *
 * DOES NOT invent payment_amount_cents, election, or term -- the owner supplies those. But
 * lease_contract's real schema has NOT NULL, no-default columns for commencement_date, end_date,
 * number_of_periods, payment_amount_cents, and total_lease_payments_cents (createLeaseContract
 * itself requires all of them; there is no "pending" state in this table). The DB CHECK
 * constraints DO allow payment_amount_cents/total_lease_payments_cents = 0 explicitly (>= 0, not
 * > 0) -- an unmistakable "not priced yet" placeholder, never a guessed real number. There is no
 * such zero option for number_of_periods (> 0) or the dates (end_date >= commencement_date, both
 * NOT NULL) -- number_of_periods=1 and commencement_date=end_date=today are the minimum
 * schema-legal placeholders, self-evidently not a real term (a same-day, zero-dollar, one-period
 * "lease" cannot be mistaken for a negotiated deal). election is left at the SERVICE's own
 * pre-existing default ('operating', "per the owner lock" per createLeaseContract's own comment)
 * -- not a new invention, the standing decision already encoded in the code before this task.
 * display_id is stamped LEASE-DRAFT-PENDING-OWNER-TERMS so the row is unmistakable in any list
 * until the owner corrects it (this table has no free-text notes column to say so any other way).
 *
 * DOES NOT post a bill or a payment -- the owner books that leg personally, per the task.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-intercompany-lease-07-vendor-and-lease-shell-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-intercompany-lease-07-vendor-and-lease-shell-once.mts --commit  # apply
 */
import pg from "pg";
import { createLeaseContract } from "../apps/backend/src/accounting/lease-asc842/lease.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80"; // lessee
const TRK = "b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e"; // IH 35 Trucking LLC, lessor
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const VENDOR_NAME = "IH 35 Trucking LLC";

const COMMIT = process.argv.includes("--commit");

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

    const existingVendor = await client.query(
      `SELECT id, vendor_name, deactivated_at FROM mdata.vendors WHERE operating_company_id = $1::uuid AND lower(vendor_name) = lower($2) LIMIT 1`,
      [USMCA, VENDOR_NAME]
    );
    console.log("Existing vendor with this exact name under USMCA:", existingVendor.rows[0] ?? "none");

    const existingLeases = await client.query(
      `SELECT count(*)::int AS n FROM accounting.lease_contract WHERE lessor_operating_company_id = $1::uuid AND lessee_operating_company_id = $2::uuid`,
      [TRK, USMCA]
    );
    console.log("Existing TRK->USMCA lease_contract rows:", existingLeases.rows[0]?.n);

    if (!COMMIT) {
      console.log("DRY RUN -- pass --commit to apply. No writes made.");
      return;
    }
    if (existingVendor.rows[0]) {
      throw new Error(`vendor already exists (${existingVendor.rows[0].id}) -- refusing to create a duplicate`);
    }
    if (Number(existingLeases.rows[0]?.n ?? 0) > 0) {
      throw new Error("a TRK->USMCA lease_contract row already exists -- refusing to create a duplicate");
    }

    // 1. Vendor -- mirrors POST /api/v1/mdata/vendors' own INSERT column set exactly.
    await client.query("BEGIN");
    let vendorId: string;
    try {
      const vendorRes = await client.query<{ id: string }>(
        `
          INSERT INTO mdata.vendors (
            vendor_name, vendor_type, vendor_category, operating_company_id,
            qbo_vendor_id, is_sample_data, created_by_user_id, updated_by_user_id
          )
          VALUES ($1, $2, $3, $4::uuid, NULL, false, $5::uuid, $5::uuid)
          RETURNING id::text
        `,
        [VENDOR_NAME, "Other", "rent", USMCA, ACTOR_USER_UUID]
      );
      vendorId = vendorRes.rows[0]!.id;
      await client.query(
        `SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`,
        [
          "mdata.vendors.created",
          "info",
          JSON.stringify({
            resource_type: "mdata.vendors",
            resource_id: vendorId,
            operating_company_id: USMCA,
            name: VENDOR_NAME,
            vendor_type: "Other",
          }),
          ACTOR_USER_UUID,
          "ACCT-INTERCOMPANY-LEASE-07",
        ]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
    console.log("VENDOR CREATED:", vendorId);

    // 2. Lease shell -- reuses the REAL createLeaseContract service (lease_classification insert +
    // audit logging come for free). Placeholder fields are exactly the ones documented above.
    const today = new Date().toISOString().slice(0, 10);
    const { id: leaseId } = await createLeaseContract(
      {
        operatingCompanyId: USMCA,
        lessorOperatingCompanyId: TRK,
        lesseeName: "USMCA Freight Solutions Inc",
        lesseeOperatingCompanyId: USMCA,
        displayId: "LEASE-DRAFT-PENDING-OWNER-TERMS",
        commencementDate: today,
        endDate: today,
        paymentAmountCents: 0,
        paymentFrequency: "monthly",
        numberOfPeriods: 1,
        totalLeasePaymentsCents: 0,
      },
      { userId: ACTOR_USER_UUID }
    );
    console.log("LEASE SHELL CREATED:", leaseId);

    const after = await client.query(
      `SELECT id, status, election, display_id, payment_amount_cents, number_of_periods, commencement_date::text, end_date::text FROM accounting.lease_contract WHERE id = $1::uuid`,
      [leaseId]
    );
    console.log("LEASE SHELL ROW:", after.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
