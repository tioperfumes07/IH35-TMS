import { describe, expect, it } from "vitest";
import { buildMonthlyFeeDrillHref, statementMonthBounds } from "./factoringMonthFeeDrill";

describe("ROUND 8.20 board18 factoringMonthFeeDrill", () => {
  it("bounds a YYYY-MM-01 statement month to calendar first/last day", () => {
    expect(statementMonthBounds("2026-02-01")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(statementMonthBounds("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("returns null for junk months", () => {
    expect(statementMonthBounds(null)).toBeNull();
    expect(statementMonthBounds("nope")).toBeNull();
    expect(statementMonthBounds("2026-13-01")).toBeNull();
  });

  it("builds chargebacks-fees href with month dates + ret", () => {
    const href = buildMonthlyFeeDrillHref("2026-03-01", "/factoring/chargebacks-fees");
    expect(href).toContain("/factoring/chargebacks-fees?");
    expect(href).toContain("date_from=2026-03-01");
    expect(href).toContain("date_to=2026-03-31");
    expect(href).toContain("ret=");
  });
});
