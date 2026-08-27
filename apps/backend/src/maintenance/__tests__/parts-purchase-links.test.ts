import { describe, expect, it, vi } from "vitest";
import { validatePartsPurchaseLinks } from "../parts-inventory.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const VENDOR = "22222222-2222-4222-8222-222222222222";
const WORK_ORDER = "33333333-3333-4333-8333-333333333333";

describe("parts purchase linked-entity validation", () => {
  it("accepts an active vendor and work order owned by the company", async () => {
    const query = vi.fn(async () => ({ rows: [{ vendor_ok: true, work_order_ok: true }] }));

    await expect(validatePartsPurchaseLinks({ query }, COMPANY, VENDOR, WORK_ORDER)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("v.operating_company_id = $1::uuid"),
      [COMPANY, VENDOR, WORK_ORDER]
    );
    expect(query.mock.calls[0]?.[0]).toContain("wo.operating_company_id = $1::uuid");
  });

  it("rejects a cross-company or inactive linked entity", async () => {
    const query = vi.fn(async () => ({ rows: [{ vendor_ok: false, work_order_ok: true }] }));

    await expect(validatePartsPurchaseLinks({ query }, COMPANY, VENDOR, WORK_ORDER)).resolves.toBe(false);
  });

  it("accepts a purchase with both optional links omitted", async () => {
    const query = vi.fn(async () => ({ rows: [{ vendor_ok: true, work_order_ok: true }] }));

    await expect(validatePartsPurchaseLinks({ query }, COMPANY, undefined, undefined)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.any(String), [COMPANY, null, null]);
  });
});
