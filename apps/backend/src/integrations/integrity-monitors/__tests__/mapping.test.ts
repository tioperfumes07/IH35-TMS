import { describe, expect, it } from "vitest";
import { levenshtein, checkAllMappings } from "../driver-vendor-mapping.js";

describe("levenshtein fuzzy match", () => {
  it("allows distance <= 3", () => {
    expect(levenshtein("john smith", "john smyth")).toBeLessThanOrEqual(3);
  });
  it("flags larger drift", () => {
    expect(levenshtein("john smith", "jane doe")).toBeGreaterThan(3);
  });
});

describe("checkAllMappings", () => {
  it("detects missing QBO vendor", async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes("FROM mdata.drivers")) {
          return { rows: [{ id: "d1", display_name: "John Smith", qbo_vendor_id: "v-missing", samsara_driver_id: null }] };
        }
        if (sql.includes("accounting.qbo_vendors")) return { rows: [] };
        return { rows: [] };
      },
    };
    const findings = await checkAllMappings(client as never, "00000000-0000-0000-0000-000000000000");
    expect(findings[0].drift_reason).toBe("qbo_vendor_missing");
    expect(findings[0].severity).toBe("critical");
  });
});
