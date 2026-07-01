import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParityTable, type ParityColumn } from "./ParityTable";

type Row = { id: string; name: string; amount: string };

const columns: Array<ParityColumn<Row>> = [
  { key: "name", label: "Name", sortable: true },
  { key: "amount", label: "Amount" },
];

const rows: Row[] = [
  { id: "1", name: "Alpha", amount: "$10" },
  { id: "2", name: "Bravo", amount: "$20" },
];

describe("ParityTable (A1 grammar)", () => {
  it("renders rows and the 'N–M of TOTAL' pager", () => {
    render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<ParityTable<Row> columns={columns} rows={[]} rowKey={(r) => r.id} emptyText="No records found." />);
    expect(screen.getByText("No records found.")).toBeInTheDocument();
  });

  it("gear popover exposes density options and column toggles; hiding a column removes it", () => {
    render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    fireEvent.click(screen.getByLabelText("Table settings"));
    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.getByText("Compact")).toBeInTheDocument();
    expect(screen.getByText("Ultra compact")).toBeInTheDocument();

    // "Amount" column header visible before toggle.
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent).join(" ")).toContain("Amount");

    // Uncheck the "Amount" column in the gear column list (column toggles are the only checkboxes here).
    const amountCheckbox = screen
      .getAllByRole("checkbox")
      .find((cb) => cb.closest("label")?.textContent?.includes("Amount"));
    expect(amountCheckbox).toBeTruthy();
    fireEvent.click(amountCheckbox as HTMLElement);

    expect(
      screen.getAllByRole("columnheader").map((th) => th.textContent).join(" "),
    ).not.toContain("Amount");
  });

  it("supports selection → batch bar", () => {
    render(
      <ParityTable<Row>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selectable
        batchActions={() => <button type="button">Batch edit</button>}
      />,
    );
    const checkboxes = screen.getAllByLabelText("Select row");
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByText("Batch edit")).toBeInTheDocument();
  });

  // Universal-list contract (spec 01) additions.
  it("renders the filter-bar slot", () => {
    render(
      <ParityTable<Row>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        filterBar={<input placeholder="Search WOs" />}
      />,
    );
    expect(screen.getByPlaceholderText("Search WOs")).toBeInTheDocument();
  });

  it("shows the Export button only when exportFilename is set", () => {
    const { rerender } = render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.queryByLabelText("Export CSV")).toBeNull();
    rerender(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} exportFilename="work-orders" />);
    expect(screen.getByLabelText("Export CSV")).toBeInTheDocument();
  });

  it("renders resize handles by default and omits them when disabled", () => {
    const { rerender } = render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByLabelText("Resize Name")).toBeInTheDocument();
    rerender(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} enableColumnResize={false} />);
    expect(screen.queryByLabelText("Resize Name")).toBeNull();
  });

  it("resize handle is keyboard-accessible and ArrowRight widens the column (persists)", () => {
    window.localStorage.clear();
    render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} storageKey="test-cols" />);
    const handle = screen.getByLabelText("Resize Name");
    // Focusable a11y separator, not mouse-only.
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(handle).toHaveAttribute("role", "separator");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    const persisted = JSON.parse(window.localStorage.getItem("paritytable:test-cols") ?? "{}");
    expect(persisted.colWidths?.name).toBeGreaterThan(48);
    window.localStorage.clear();
  });

  it("renderExpanded: no expander column by default; toggle reveals/hides the detail row", () => {
    const { rerender } = render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    // Additive: existing consumers (no renderExpanded) get no expander toggle.
    expect(screen.queryByLabelText("Expand row")).toBeNull();

    rerender(
      <ParityTable<Row>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        renderExpanded={(r) => <div>detail for {r.name}</div>}
      />,
    );
    // Detail hidden until expanded.
    expect(screen.queryByText("detail for Alpha")).toBeNull();
    const toggles = screen.getAllByLabelText("Expand row");
    fireEvent.click(toggles[0]);
    expect(screen.getByText("detail for Alpha")).toBeInTheDocument();
    // Collapse hides it again.
    fireEvent.click(screen.getByLabelText("Collapse row"));
    expect(screen.queryByText("detail for Alpha")).toBeNull();
  });
});
