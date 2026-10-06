import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MoneyCell, formatMoneyCellValue } from "../MoneyCell";
import { resolveAmountRoute } from "../AmountLink";

// ROUND 433.2 — the engine: every money figure declares what it opens.
describe("MoneyCell", () => {
  const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
  it("missing renders an em dash, never 0 and never -$0.00", () => {
    expect(formatMoneyCellValue(null)).toBe("—");
    expect(formatMoneyCellValue(-0, (c) => (Object.is(c, -0) ? "-$0.00" : "$0.00"))).toBe("$0.00");
  });
  it("an amount drill renders a link to the exact list", () => {
    wrap(<MoneyCell cents={1500} drill={{ amount: { target: "ledger", accountIds: ["a1", "a2"], from: "2026-10-01", to: "2026-10-31" } }} data-testid="m" />);
    const a = screen.getByTestId("m").querySelector("a");
    expect(a?.getAttribute("href")).toBe("/accounting/reclassify?account_ids=a1%2Ca2&from_date=2026-10-01&to_date=2026-10-31");
  });
  it("a none drill shows the reason and no link", () => {
    wrap(<MoneyCell cents={1500} drill={{ none: "computed ratio, no record behind it" }} data-testid="m" />);
    const el = screen.getByTestId("m");
    expect(el.querySelector("a")).toBeNull();
    expect(el.getAttribute("data-no-drill")).toBe("computed ratio, no record behind it");
  });
});

describe("AmountLink ledger target (a total over a set of accounts)", () => {
  it("routes to the ledger lines of exactly those accounts for the period", () => {
    expect(resolveAmountRoute({ target: "ledger", accountIds: ["x"], from: "2026-01-01", to: "2026-01-31" })).toBe(
      "/accounting/reclassify?account_ids=x&from_date=2026-01-01&to_date=2026-01-31"
    );
  });
  it("no accounts or a cash-basis figure gets no route (it would not tie)", () => {
    expect(resolveAmountRoute({ target: "ledger", accountIds: [], from: "2026-01-01", to: "2026-01-31" })).toBeNull();
    expect(resolveAmountRoute({ target: "ledger", accountIds: ["x"], from: "2026-01-01", to: "2026-01-31", basis: "cash" })).toBeNull();
  });
});
