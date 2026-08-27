import { describe, expect, it, vi } from "vitest";
import { laborVendorBelongsToCompany } from "../labor.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const VENDOR = "22222222-2222-4222-8222-222222222222";

describe("maintenance labor vendor ownership", () => {
  it("accepts an active same-company vendor", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: VENDOR }] }));
    await expect(laborVendorBelongsToCompany({ query }, VENDOR, COMPANY)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("operating_company_id = $2::uuid"), [VENDOR, COMPANY]);
  });

  it("rejects a missing, inactive, or cross-company vendor", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await expect(laborVendorBelongsToCompany({ query }, VENDOR, COMPANY)).resolves.toBe(false);
  });

  it("allows the optional vendor link to be omitted", async () => {
    const query = vi.fn();
    await expect(laborVendorBelongsToCompany({ query }, null, COMPANY)).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
});
