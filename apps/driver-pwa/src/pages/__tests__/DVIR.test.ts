import { describe, expect, it } from "vitest";
import { createEmptyInspectionItems, FMCSA_DVIR_ITEMS } from "../../api/dvir";
import { MAX_DVIR_DEFECT_PHOTOS } from "../../components/DvirItemRow";

describe("DVIR foundation (A23-4)", () => {
  it("seeds the FMCSA checklist with every canonical item", () => {
    const items = createEmptyInspectionItems();
    expect(items).toHaveLength(FMCSA_DVIR_ITEMS.length);
    expect(items.every((item) => item.status === "pass")).toBe(true);
  });

  it("includes core brake and steering inspection keys", () => {
    expect(FMCSA_DVIR_ITEMS).toContain("service_brakes");
    expect(FMCSA_DVIR_ITEMS).toContain("steering");
  });

  it("caps defect photos at five per item", () => {
    expect(MAX_DVIR_DEFECT_PHOTOS).toBe(5);
  });
});
