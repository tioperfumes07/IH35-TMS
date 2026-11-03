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

  it("combined row: legacy expense+fuel-avg never EntityLinks as expense", () => {
    const legacy = { document_kind: "expense" as const, document_id: "fuel-avg-partial-2026-11-03" };
    expect(isFuelForecastRow(legacy)).toBe(true);
    expect(ledgerEntityKind(legacy.document_kind, legacy)).toBeNull();
  });

  it("combined row: new fuel_forecast never EntityLinks", () => {
    const neu = { document_kind: "fuel_forecast" as const, document_id: "fuel-avg-2026-11-10" };
    expect(ledgerEntityKind(neu.document_kind, neu)).toBeNull();
  });

  it("combined row: real expense UUID still EntityLinks as expense", () => {
    const real = { document_kind: "expense" as const, document_id: "a0e1b2c3-d4e5-6789-abcd-ef0123456789" };
    expect(isFuelForecastRow(real)).toBe(false);
    expect(ledgerEntityKind(real.document_kind, real)).toBe("expense");
  });
});
