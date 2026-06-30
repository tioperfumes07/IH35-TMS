import { describe, it, expect } from "vitest";
import {
  samsaraCreatedAtDate,
  deltaDays,
  classifyHireDate,
  classifyDriverHireDates,
  summarizeHireDates,
} from "./samsara-hire-date.service.js";

describe("samsara hire-date cross-validation", () => {
  it("extracts createdAtTime as YYYY-MM-DD", () => {
    expect(samsaraCreatedAtDate("2022-03-03T10:00:00Z")).toBe("2022-03-03");
    expect(samsaraCreatedAtDate(null)).toBeNull();
    expect(samsaraCreatedAtDate("garbage")).toBeNull();
  });

  it("computes signed whole-day delta (samsara − file)", () => {
    expect(deltaDays("2025-04-28", "2025-04-24")).toBe(-4); // ADRIAN row from the xval CSV
    expect(deltaDays("2025-04-24", "2025-04-28")).toBe(4);
    expect(deltaDays(null, "2025-01-01")).toBeNull();
  });

  it("classifies per GUARD's model (confirmed/estimate/needs_review/file_only/no_date)", () => {
    expect(classifyHireDate("2025-04-28", "2025-04-24")).toEqual({ delta_days: -4, category: "confirmed" }); // within 30d
    expect(classifyHireDate(null, "2024-08-04")).toEqual({ delta_days: null, category: "samsara_estimate" }); // gap-fill
    expect(classifyHireDate("2024-08-14", "2022-08-05")).toMatchObject({ category: "needs_review" }); // 740d → rehire
    expect(classifyHireDate("2023-01-01", null)).toEqual({ delta_days: null, category: "file_only" });
    expect(classifyHireDate(null, null)).toEqual({ delta_days: null, category: "no_date" });
    // 30–180d window is informational
    expect(classifyHireDate("2025-01-01", "2025-04-01")).toMatchObject({ category: "minor_divergence" });
  });

  it("classifies a driver set + summarizes", () => {
    const rows = classifyDriverHireDates([
      { id: "d1", first_name: "Adrian", last_name: "Trujillo", hire_date: "2025-04-28", samsara_created_at: "2025-04-24T00:00:00Z" },
      { id: "d2", first_name: "Gap", last_name: "Filler", hire_date: null, samsara_created_at: "2024-08-04T00:00:00Z" },
      { id: "d3", first_name: "Luis", last_name: "Zavaleta", hire_date: "2024-08-14", samsara_created_at: "2022-08-05T00:00:00Z" },
      { id: "d4", first_name: "File", last_name: "Only", hire_date: "2023-01-01", samsara_created_at: null },
    ]);
    const s = summarizeHireDates(rows);
    expect(s).toMatchObject({ total: 4, confirmed: 1, samsara_estimate: 1, needs_review: 1, file_only: 1 });
    expect(rows.find((r) => r.driver_id === "d2")!.samsara_created).toBe("2024-08-04");
  });
});
