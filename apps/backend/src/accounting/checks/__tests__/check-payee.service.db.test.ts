// Real Postgres proof for check-payee.service.ts — isolated company, no hardcoded USMCA UUIDs.
// CheckPayeeError fixture fix (443.92 #1): seeds vendor/driver/customer in beforeAll so the test
// runs on any migrated DB (CI ephemeral or Neon rehearsal branch).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany, ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { resolveCheckPayee, CheckPayeeError } from "../check-payee.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("check-payee.service (real Postgres, isolated company)", () => {
  let db: pg.Client;
  let companyId: string;
  const vendorId = randomUUID();
  const driverId = randomUUID();
  const customerId = randomUUID();
  const suffix = randomUUID().slice(0, 6);

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const isolated = await createIsolatedOperatingCompany({ label: "chkpayee" });
    companyId = isolated.companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      // Vendor
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
         VALUES ($1::uuid, $2::uuid, 'Test Vendor ${suffix}', 'Other')`,
        [vendorId, companyId]
      );
      // Driver
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
         VALUES ($1::uuid, $2::uuid, 'Test', 'Driver${suffix}', '555-0000')`,
        [driverId, companyId]
      );
      // Customer
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name)
         VALUES ($1::uuid, $2::uuid, 'Test Customer ${suffix}')`,
        [customerId, companyId]
      );
    });
  }, 60_000);

  afterAll(async () => { await db?.end().catch(() => {}); });

  it("resolves a seeded vendor payee", async () => {
    const payee = await resolveCheckPayee(companyId, "vendor", vendorId);
    expect(payee.payee_kind).toBe("vendor");
    expect(payee.print_on_check_name).toContain("Test Vendor");
  }, 30_000);

  it("resolves a seeded driver payee", async () => {
    const payee = await resolveCheckPayee(companyId, "driver", driverId);
    expect(payee.payee_kind).toBe("driver");
    expect(payee.print_on_check_name.length).toBeGreaterThan(0);
    expect(payee.remit_to_address).toBeNull();
  }, 30_000);

  it("resolves a seeded customer payee", async () => {
    const payee = await resolveCheckPayee(companyId, "customer", customerId);
    expect(payee.payee_kind).toBe("customer");
    expect(payee.print_on_check_name.length).toBeGreaterThan(0);
  }, 30_000);

  it("refuses a uuid that matches no vendor row", async () => {
    await expect(
      resolveCheckPayee(companyId, "vendor", "00000000-0000-4000-8000-000000000000")
    ).rejects.toMatchObject({ code: "PAYEE_NOT_FOUND" });
  }, 30_000);

  it("refuses an invalid payee_kind without touching the database", async () => {
    await expect(resolveCheckPayee(companyId, "shipper", vendorId)).rejects.toBeInstanceOf(CheckPayeeError);
    await expect(resolveCheckPayee(companyId, "shipper", vendorId)).rejects.toMatchObject({
      code: "PAYEE_KIND_INVALID",
    });
  });
});
