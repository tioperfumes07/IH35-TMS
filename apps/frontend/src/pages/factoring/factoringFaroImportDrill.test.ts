import { describe, expect, it } from "vitest";
import {
  buildFaroImportDrillHref,
  buildFaroImportRangeDrillHref,
  statementDayBounds,
} from "./factoringFaroImportDrill";

describe("factoringFaroImportDrill", () => {
  it("statementDayBounds returns same-day from/to", () => {
    expect(statementDayBounds("2026-10-15")).toEqual({ from: "2026-10-15", to: "2026-10-15" });
    expect(statementDayBounds("2026-10-15T12:00:00Z")).toEqual({ from: "2026-10-15", to: "2026-10-15" });
    expect(statementDayBounds("bad")).toBeNull();
    expect(statementDayBounds(null)).toBeNull();
  });

  it("buildFaroImportDrillHref targets purchase-report for gross with ret", () => {
    const href = buildFaroImportDrillHref("gross", "2026-10-15", "/factoring/faro-imports");
    expect(href).toContain("/factoring/purchase-report?");
    expect(href).toContain("date_from=2026-10-15");
    expect(href).toContain("date_to=2026-10-15");
    expect(href).toContain("ret=");
    expect(decodeURIComponent(href!.split("ret=")[1]!)).toContain("/factoring/faro-imports");
  });

  it("fee/chargeback → chargebacks-fees; advance → payments-to-you; reserve → escrow", () => {
    expect(buildFaroImportDrillHref("fee", "2026-01-02", "/f")).toContain("/factoring/chargebacks-fees?");
    expect(buildFaroImportDrillHref("chargeback", "2026-01-02", "/f")).toContain("/factoring/chargebacks-fees?");
    expect(buildFaroImportDrillHref("advance", "2026-01-02", "/f")).toContain("/factoring/payments-to-you?");
    expect(buildFaroImportDrillHref("reserve", "2026-01-02", "/f")).toContain("/factoring/escrow-account?");
  });

  it("range drill without dates still attaches ret", () => {
    const href = buildFaroImportRangeDrillHref("gross", null, null, "/factoring/faro-imports");
    expect(href).toContain("/factoring/purchase-report");
    expect(href).toContain("ret=");
  });
});
