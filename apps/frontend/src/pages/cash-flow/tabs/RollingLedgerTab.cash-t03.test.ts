import { describe, expect, it } from "vitest";
import { isFuelForecastRow, ledgerEntityKind } from "./RollingLedgerTab";

describe("CASH-T03 fuel forecast provenance", () => {
  it("treats fuel_forecast as non-EntityLink (no expense drill)", () => {
    expect(ledgerEntityKind("fuel_forecast")).toBeNull();
    expect(ledgerEntityKind("expense")).toBe("expense");
    expect(ledgerEntityKind("bill")).toBe("bill");
  });

  it("detects forecast rows by kind or synthetic fuel-avg id", () => {
    expect(isFuelForecastRow({ document_kind: "fuel_forecast", document_id: "anything" })).toBe(true);
    expect(isFuelForecastRow({ document_kind: "expense", document_id: "fuel-avg-partial-2026-11-03" })).toBe(true);
    expect(isFuelForecastRow({ document_kind: "expense", document_id: "fuel-avg-2026-11-10" })).toBe(true);
    expect(isFuelForecastRow({ document_kind: "expense", document_id: "a0e1b2c3-d4e5-6789-abcd-ef0123456789" })).toBe(false);
  });
});
