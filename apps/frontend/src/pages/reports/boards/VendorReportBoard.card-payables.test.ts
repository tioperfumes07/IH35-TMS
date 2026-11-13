/**
 * BOARD 31 (LEAD ROUND 8.25) — Reports › Vendors "Card payables" is the fuel-card LIABILITY, not fuel spend.
 * Fail-old (live, BOARD-45-STATUS row 31): the tile printed kpis.fuel_cents (period fuel expense).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cardPayablesHref, cardPayablesSub } from "./VendorReportBoard";

describe("Card payables tile", () => {
  it("captions each card account's balance and the as-of date", () => {
    const s = cardPayablesSub(
      [{ account_name: "Dreamline Diesel Card Payable", balance_cents: 18_789_421 }, { account_name: "England WEX Fuel Card", balance_cents: 2_915_688 }],
      "2026-11-13",
    );
    expect(s).toContain("Dreamline Diesel Card Payable $187,894.21");
    expect(s).toContain("England WEX Fuel Card $29,156.88");
  });
  it("drills to the largest card-payable account register", () => {
    expect(cardPayablesHref([{ account_id: "wex", balance_cents: 10 }, { account_id: "dream", balance_cents: 20 }])).toBe("/accounting/chart-of-accounts/register/dream");
    expect(cardPayablesHref([])).toBeUndefined();
  });
  it("the tile value reads card_payables_cents, never fuel_cents", () => {
    const src = readFileSync(resolve(__dirname, "VendorReportBoard.tsx"), "utf8");
    const tile = src.slice(src.indexOf('testId="vr-kpi-card-payables"'), src.indexOf('testId="vr-kpi-card-payables"') + 400);
    expect(tile).toContain("board.data.kpis.card_payables_cents");
    expect(tile).not.toContain("kpis.fuel_cents");
  });
});
