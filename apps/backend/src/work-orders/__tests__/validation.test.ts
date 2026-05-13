import { describe, expect, it } from "vitest";
import { validateCreateWorkOrder } from "../validation.service.js";

describe("work order validation", () => {
  const base = {
    wo_billing_type: "internal" as const,
    wo_service_class: "pm" as const,
    vendor_invoice_number: "INV-1",
    vendor_work_order_number: null as string | null,
    unit_id: null as string | null,
    driver_id: null as string | null,
    vendor_id: null as string | null,
    shop_name: null as string | null,
  };

  it("PM internal with vendor invoice passes", () => {
    const result = validateCreateWorkOrder(base);
    expect(result.ok).toBe(true);
  });

  it("PM missing both invoice and vendor WO fails", () => {
    const result = validateCreateWorkOrder({ ...base, vendor_invoice_number: null, vendor_work_order_number: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.vendor_invoice_number).toBeTruthy();
      expect(result.errors.vendor_work_order_number).toBeTruthy();
    }
  });

  it("Corrective missing unit fails", () => {
    const result = validateCreateWorkOrder({
      ...base,
      wo_service_class: "corrective",
      unit_id: null,
      driver_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.unit_id).toBeTruthy();
  });

  it("Corrective missing driver fails", () => {
    const result = validateCreateWorkOrder({
      ...base,
      wo_service_class: "corrective",
      unit_id: "11111111-1111-4111-8111-111111111111",
      driver_id: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.driver_id).toBeTruthy();
  });

  it("External without vendor or shop fails", () => {
    const result = validateCreateWorkOrder({
      ...base,
      wo_billing_type: "external",
      vendor_id: null,
      shop_name: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.shop_name).toBeTruthy();
  });

  it("External with vendor_id satisfies rule 3", () => {
    const result = validateCreateWorkOrder({
      ...base,
      wo_billing_type: "external",
      vendor_id: "22222222-2222-4222-8222-222222222222",
      shop_name: null,
    });
    expect(result.ok).toBe(true);
  });

  it("External rule 3 treats nonexistent UUID string as present (DB validation is separate)", () => {
    const result = validateCreateWorkOrder({
      ...base,
      wo_billing_type: "external",
      vendor_id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      shop_name: null,
    });
    expect(result.ok).toBe(true);
  });

  it("Allows legacy external vendor invoice fields to satisfy Rule 1", () => {
    const result = validateCreateWorkOrder({
      ...base,
      vendor_invoice_number: null,
      vendor_work_order_number: null,
      external_vendor_invoice_number: "INV-LEGACY",
      external_vendor_wo_number: null,
    });
    expect(result.ok).toBe(true);
  });
});
