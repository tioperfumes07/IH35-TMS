// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountingBoardKpiStrip } from "./AccountingBoardKpiStrip";

describe("AccountingBoardKpiStrip", () => {
  it("renders the Bills tile shape and keeps an em dash when the fetch failed", () => {
    render(
      <AccountingBoardKpiStrip
        testId="invoices-board-kpis"
        tiles={[
          { label: "Total billed", value: "—", sub: "Error loading", tone: "danger" },
          { label: "Open", value: "$1,200.00", sub: "2 of 2" },
        ]}
      />,
    );
    const strip = screen.getByTestId("invoices-board-kpis");
    expect(strip).toHaveAttribute("data-accounting-board-kpis", "1");
    expect(strip).toHaveTextContent("Total billed");
    expect(strip).toHaveTextContent("—");
    expect(strip).toHaveTextContent("$1,200.00");
    expect(strip).toHaveTextContent("2 of 2");
  });
});
