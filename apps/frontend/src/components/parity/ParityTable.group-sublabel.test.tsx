import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParityTable, type ParityColumn } from "./ParityTable";

// Owner 2026-11-26 15:38 CT (perfume desk): "i want to have the list date on a row on bottom of the vendor name".
type Row = { id: string; price: string; net: string };
const columns: Array<ParityColumn<Row>> = [
  { key: "price", label: "List price", testId: "price" },
  { key: "net", label: "Cushion", testId: "net" },
];

describe("ParityTable column group second line", () => {
  it("shows the group's sublabel under its name; a group without one shows only the name", () => {
    render(<ParityTable<Row> columns={columns} rows={[{ id: "1", price: "$10", net: "$9" }]} rowKey={(r) => r.id}
      columnGroups={[{ label: "PCA", keys: ["price", "net"], sublabel: "List 11/25/2026" }]} />);
    expect(screen.getByText("PCA")).toBeTruthy();
    expect(screen.getByTestId("parity-group-sublabel").textContent).toBe("List 11/25/2026");
  });
  it("no sublabel, no second line", () => {
    render(<ParityTable<Row> columns={columns} rows={[]} rowKey={(r) => r.id} columnGroups={[{ label: "MTZ", keys: ["price", "net"] }]} />);
    expect(screen.queryByTestId("parity-group-sublabel")).toBeNull();
  });
});
