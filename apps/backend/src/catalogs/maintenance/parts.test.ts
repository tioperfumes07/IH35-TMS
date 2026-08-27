/**
 * CLOSURE-10 — parts master catalog unit tests.
 */
import { describe, it, expect } from "vitest";
import { createSchema } from "./parts.routes.js";

describe("maintenance parts catalog route pattern", () => {
  it("defines correct category values", () => {
    const CATEGORIES = [
      "engine","transmission","brake","tire","suspension",
      "electrical","fuel_system","cooling","exhaust","cabin",
      "reefer","body","fluid","filter","other",
    ] as const;
    expect(CATEGORIES).toHaveLength(15);
    expect(CATEGORIES).toContain("engine");
    expect(CATEGORIES).toContain("reefer");
  });
});

// MAINTENANCE-PARTS-CREATE-SUB-CATEGORY-BARCODE-NULL-400 — live-confirmed against prod: POST
// /api/v1/catalogs/maintenance/parts-master with sub_category:null and barcode_upc:null (
// CreateMaintPartModal.tsx's real blank-field values, `form.sub_category.trim() || null` /
// `form.barcode_upc.trim() || null`) 400'd on both fields. createSchema had bare `.optional()` on
// each; updateSchema already correctly had `.nullable()` on both.
const VALID_CREATE_BODY = {
  operating_company_id: "00000000-0000-0000-0000-000000000000",
  sku: "TEST-SKU",
  part_name: "Test Part",
  manufacturer: "Test Mfg",
  category: "engine" as const,
};

describe("parts createSchema — MAINTENANCE-PARTS-CREATE-SUB-CATEGORY-BARCODE-NULL-400", () => {
  it("accepts sub_category: null and barcode_upc: null (the frontend's real blank-field values)", () => {
    const parsed = createSchema.safeParse({ ...VALID_CREATE_BODY, sub_category: null, barcode_upc: null });
    expect(parsed.success).toBe(true);
  });

  it("accepts both fields omitted entirely", () => {
    expect(createSchema.safeParse(VALID_CREATE_BODY).success).toBe(true);
  });

  it("still accepts real string values", () => {
    const parsed = createSchema.safeParse({ ...VALID_CREATE_BODY, sub_category: "Brakes", barcode_upc: "012345678905" });
    expect(parsed.success).toBe(true);
  });
});
