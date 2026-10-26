import { describe, expect, it } from "vitest";
import { equipmentTypeToLoadTrailerCode, resolveLoadTrailerEquipmentIdForInsert } from "../book-load.service.js";

// ENG-22 / row 257 (LEAD 10-25-2026): booking used to fall back SILENTLY to DRY_VAN. Measured on USMCA: 191 "Dry Van"
// loads — the trailer that actually rode them was a Reefer on 100 and a Flatbed on 51. A booked fact is never a guess.

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CATALOG: Record<string, string> = {
  DRY_VAN: "id-dry",
  REFRIGERATED_VAN: "id-reefer",
  FLATBED: "id-flat",
  POWER_ONLY_NO_TRAILER: "id-po-none",
  POWER_ONLY_CUSTOMER_TRAILER: "id-po-cust",
};
const TRAILERS: Record<string, string> = { "trl-reefer": "Reefer", "trl-flat": "Flatbed", "trl-dry": "DryVan" };

function fakeClient() {
  return {
    async query<T>(sql: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      if (/FROM catalogs\.load_trailer_equipment\s+WHERE operating_company_id/.test(sql)) {
        const id = CATALOG[String(values[1])];
        return { rows: (id ? [{ id }] : []) as T[] };
      }
      if (/FROM mdata\.equipment/.test(sql)) {
        const t = TRAILERS[String(values[0])];
        return { rows: (t ? [{ equipment_type: t }] : []) as T[] };
      }
      if (/FROM dispatch\.non_owned_trailers/.test(sql)) return { rows: [{ trailer_type: null }] as T[] };
      return { rows: [] };
    },
  };
}

describe("load trailer equipment resolution — no silent Dry Van", () => {
  it("maps the fleet's equipment types to catalog codes", () => {
    expect(equipmentTypeToLoadTrailerCode("Reefer")).toBe("REFRIGERATED_VAN");
    expect(equipmentTypeToLoadTrailerCode("Flatbed")).toBe("FLATBED");
    expect(equipmentTypeToLoadTrailerCode("DryVan")).toBe("DRY_VAN");
    expect(equipmentTypeToLoadTrailerCode("refrigerated_van")).toBe("REFRIGERATED_VAN");
    expect(equipmentTypeToLoadTrailerCode(null)).toBeNull();
  });

  it("a company Reefer trailer books the load as Reefer (was Dry Van)", async () => {
    const id = await resolveLoadTrailerEquipmentIdForInsert(fakeClient(), CO, null, { choiceKind: "company", companyTrailerId: "trl-reefer" });
    expect(id).toBe("id-reefer");
  });

  it("a company Flatbed trailer books the load as Flatbed", async () => {
    expect(await resolveLoadTrailerEquipmentIdForInsert(fakeClient(), CO, null, { choiceKind: "company", companyTrailerId: "trl-flat" })).toBe("id-flat");
  });

  it("the trailer-type field wins over the trailer's type", async () => {
    expect(await resolveLoadTrailerEquipmentIdForInsert(fakeClient(), CO, null, { trailerType: "dry_van", companyTrailerId: "trl-reefer" })).toBe("id-dry");
  });

  it("no trailer / customer trailer resolve to the power-only rows", async () => {
    expect(await resolveLoadTrailerEquipmentIdForInsert(fakeClient(), CO, null, { choiceKind: "none" })).toBe("id-po-none");
    expect(await resolveLoadTrailerEquipmentIdForInsert(fakeClient(), CO, null, { choiceKind: "customer" })).toBe("id-po-cust");
  });

  it("a LIVE booking with nothing to resolve from is REFUSED, never Dry Van", async () => {
    await expect(resolveLoadTrailerEquipmentIdForInsert(fakeClient(), CO, null, {})).rejects.toThrow("load_trailer_type_required");
    await expect(
      resolveLoadTrailerEquipmentIdForInsert(fakeClient(), CO, null, { choiceKind: "interchange", nonOwnedTrailerId: "x" })
    ).rejects.toThrow("load_trailer_type_required");
  });

  it("only a draft keeps the Dry Van placeholder", async () => {
    expect(await resolveLoadTrailerEquipmentIdForInsert(fakeClient(), CO, null, { isDraft: true })).toBe("id-dry");
  });
});
