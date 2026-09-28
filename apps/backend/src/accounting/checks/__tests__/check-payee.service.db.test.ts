// Real Postgres proof for check-payee.service.ts -- CI-gated (GITHUB_ACTIONS) the same way
// accept-bill-match.db.test.ts is; run locally with GITHUB_ACTIONS=true against a Neon child branch.
//
// Uses the REAL USMCA company id (ensureIntegrationPrerequisites()'s synthetic test company has
// zero seeded mdata.vendors/drivers/customers rows -- confirmed live in the R-153 match-engine work
// this same session; insufficient here too).
import { describe, it, expect } from "vitest";
import { resolveCheckPayee, CheckPayeeError } from "../check-payee.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
// Live-verified 09-25-2026: real, active USMCA rows.
const REAL_VENDOR_ID = "a94a93d2-37b4-4179-82c3-9e155eb33af7"; // "Guzman Landscaping And Pool Maintenance"
const REAL_DRIVER_ID = "52037e93-484a-4659-ab60-cf2a78f4c647";
const REAL_CUSTOMER_ID = "654ca3b2-9dee-4dba-bb78-7d9e61fe37b0";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("check-payee.service (real Postgres)", () => {
  it(
    "resolves a real vendor payee with a remit-to address and falls back to vendor_name",
    async () => {
      const payee = await resolveCheckPayee(USMCA_COMPANY_ID, "vendor", REAL_VENDOR_ID);
      expect(payee.payee_kind).toBe("vendor");
      expect(payee.print_on_check_name).toBe("Guzman Landscaping And Pool Maintenance");
      expect(payee.remit_to_address).not.toBeNull();
    },
    30_000
  );

  it(
    "resolves a real driver payee with no remit-to address (honest schema gap, not a bug)",
    async () => {
      const payee = await resolveCheckPayee(USMCA_COMPANY_ID, "driver", REAL_DRIVER_ID);
      expect(payee.payee_kind).toBe("driver");
      expect(payee.print_on_check_name.length).toBeGreaterThan(0);
      expect(payee.remit_to_address).toBeNull();
    },
    30_000
  );

  it(
    "resolves a real customer payee (refund check)",
    async () => {
      const payee = await resolveCheckPayee(USMCA_COMPANY_ID, "customer", REAL_CUSTOMER_ID);
      expect(payee.payee_kind).toBe("customer");
      expect(payee.print_on_check_name.length).toBeGreaterThan(0);
    },
    30_000
  );

  it(
    "refuses a random uuid that matches no live vendor row",
    async () => {
      await expect(
        resolveCheckPayee(USMCA_COMPANY_ID, "vendor", "00000000-0000-4000-8000-000000000000")
      ).rejects.toMatchObject({ code: "PAYEE_NOT_FOUND" });
    },
    30_000
  );

  it("refuses an invalid payee_kind without touching the database", async () => {
    await expect(resolveCheckPayee(USMCA_COMPANY_ID, "shipper", REAL_VENDOR_ID)).rejects.toBeInstanceOf(CheckPayeeError);
    await expect(resolveCheckPayee(USMCA_COMPANY_ID, "shipper", REAL_VENDOR_ID)).rejects.toMatchObject({
      code: "PAYEE_KIND_INVALID",
    });
  });
});
