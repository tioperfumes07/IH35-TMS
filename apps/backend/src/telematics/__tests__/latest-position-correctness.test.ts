import { describe, expect, it } from "vitest";
import { pickLatestPositions } from "../vehicle-locations.service.js";

describe("latest position correctness", () => {
  it("picks newest captured_at per unit", () => {
    const rows = pickLatestPositions([
      { operating_company_id: "oc1", unit_id: "u1", captured_at: "2026-05-24T00:00:00.000Z", id: "a" },
      { operating_company_id: "oc1", unit_id: "u1", captured_at: "2026-05-24T00:02:00.000Z", id: "b" },
      { operating_company_id: "oc1", unit_id: "u2", captured_at: "2026-05-24T00:01:00.000Z", id: "c" },
    ]);
    expect(rows).toHaveLength(2);
    const unit1 = rows.find((row) => row.unit_id === "u1");
    expect(unit1?.id).toBe("b");
  });
});
