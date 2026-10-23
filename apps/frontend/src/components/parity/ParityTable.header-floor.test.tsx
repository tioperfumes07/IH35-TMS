import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ParityTable } from "./ParityTable";

afterEach(cleanup);

describe("ParityTable proportional header floor", () => {
  it("measures the rendered header font, not the smaller panel-label font", () => {
    const label = "Customer organization name and billing reference";
    render(<ParityTable columns={[{ key: "name", label }, { key: "balance", label: "Balance", kind: "money" }]} rows={[]} rowKey={() => ""} />);
    const table = screen.getByRole("table");
    const header = screen.getByRole("columnheader", { name: new RegExp(label, "i") });
    const requiredWidth = label.length * (Number.parseFloat(header.style.fontSize) * 0.65 + 0.3) + 28;
    expect(Number.parseFloat(table.style.minWidth) * Number.parseFloat(header.style.width) / 100).toBeGreaterThanOrEqual(requiredWidth);
  });
  for (const minWidthPx of [undefined, 100]) {
    it(`preserves each header at the table floor (caller minimum ${minWidthPx})`, () => {
      render(<ParityTable columns={[
        { key: "name", label: "Customer organization name", minWidth: 180 },
        { key: "reference", label: "Reference", minWidth: 80 },
        { key: "balance", label: "Balance", kind: "money", minWidth: 120 },
      ]} rows={[]} rowKey={() => ""} minWidthPx={minWidthPx} />);
      const table = screen.getByRole("table");
      const floor = Number.parseFloat(table.style.minWidth);
      const name = screen.getByRole("columnheader", { name: /Customer organization name/i });
      const share = Number.parseFloat(name.style.width) / 100;
      expect(floor * share).toBeGreaterThanOrEqual(180);
      expect(floor).toBeGreaterThanOrEqual(380);
    });
  }
});
