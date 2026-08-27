import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  it("inherits canonical cross-row search before pagination", () => {
    render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search rows…" }), { target: { value: "bravo" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 rows")).toBeInTheDocument();
  });

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

  it("gear popover drafts changes and applies them only after Apply", () => {
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

    // Draft state must not silently alter the table.
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent).join(" ")).toContain("Amount");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      screen.getAllByRole("columnheader").map((th) => th.textContent).join(" "),
    ).not.toContain("Amount");
  });

  it("gear drafts QBO rows-per-page 25/50/100/300 and applies when the gear rows-per-page select changes", () => {
    const many: Row[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i + 1),
      name: `Row ${i + 1}`,
      amount: "$1",
    }));
    render(<ParityTable<Row> columns={columns} rows={many} rowKey={(r) => r.id} />);
    expect(screen.getByText("1–25 of 30")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Table settings"));
    const select = screen.getByLabelText("Rows per page") as HTMLSelectElement;
    expect([...select.querySelectorAll("option")].map((opt) => opt.value)).toEqual(["25", "50", "100", "300"]);
    fireEvent.change(select, { target: { value: "50" } });
    expect(screen.getByText("1–30 of 30")).toBeInTheDocument();
  });

  it("gear Cancel discards drafted column changes", () => {
    render(<ParityTable<Row> columns={columns} rows={rows} rowKey={(r) => r.id} />);
    fireEvent.click(screen.getByLabelText("Table settings"));
    const amountCheckbox = screen
      .getAllByRole("checkbox")
      .find((cb) => cb.closest("label")?.textContent?.includes("Amount"));
    fireEvent.click(amountCheckbox as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent).join(" ")).toContain("Amount");
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

  // Controlled selection (Phase A5) — mirrors A1 controlled-expansion / A3 controlled-pagination.
  describe("controlled selection (A5)", () => {
    it("uncontrolled default is unchanged: omitting selectedKeys/onSelectionChange keeps internal Set selection", () => {
      render(
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          selectable
          batchActions={(selected) => (
            <span data-testid="batch-ids">{selected.map((r) => r.id).join(",")}</span>
          )}
        />,
      );
      const checkboxes = screen.getAllByLabelText("Select row");
      fireEvent.click(checkboxes[0]);
      expect(screen.getByText("1 selected")).toBeInTheDocument();
      expect(screen.getByTestId("batch-ids")).toHaveTextContent("1");
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
      fireEvent.click(checkboxes[1]);
      expect(screen.getByText("2 selected")).toBeInTheDocument();
      expect(screen.getByTestId("batch-ids")).toHaveTextContent("1,2");
    });

    it("controlled mode: toggle row fires onSelectionChange with next keys; does not change checkboxes without prop update", () => {
      const onSelectionChange = vi.fn();
      const { rerender } = render(
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          selectable
          selectedKeys={[]}
          onSelectionChange={onSelectionChange}
          batchActions={(selected) => (
            <span data-testid="batch-ids">{selected.map((r) => r.id).join(",")}</span>
          )}
        />,
      );
      const checkboxes = screen.getAllByLabelText("Select row");
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
      expect(screen.queryByText("selected")).toBeNull();

      fireEvent.click(checkboxes[0]);
      expect(onSelectionChange).toHaveBeenCalledWith(["1"]);
      // Controlled: checkbox stays unchecked until the owner updates selectedKeys.
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
      expect(screen.queryByText("1 selected")).toBeNull();

      rerender(
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          selectable
          selectedKeys={["1"]}
          onSelectionChange={onSelectionChange}
          batchActions={(selected) => (
            <span data-testid="batch-ids">{selected.map((r) => r.id).join(",")}</span>
          )}
        />,
      );
      expect((screen.getAllByLabelText("Select row")[0] as HTMLInputElement).checked).toBe(true);
      expect(screen.getByText("1 selected")).toBeInTheDocument();
      expect(screen.getByTestId("batch-ids")).toHaveTextContent("1");

      // Clearing via selectedKeys={[]} must work (caller clears after bulk action).
      rerender(
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          selectable
          selectedKeys={[]}
          onSelectionChange={onSelectionChange}
        />,
      );
      expect((screen.getAllByLabelText("Select row")[0] as HTMLInputElement).checked).toBe(false);
      expect(screen.queryByText("1 selected")).toBeNull();
    });

    it("controlled select-all on page respects maxSelectable and fires onSelectionCapExceeded", () => {
      const onSelectionChange = vi.fn();
      const onSelectionCapExceeded = vi.fn();
      render(
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          selectable
          selectedKeys={[]}
          onSelectionChange={onSelectionChange}
          maxSelectable={1}
          onSelectionCapExceeded={onSelectionCapExceeded}
        />,
      );
      fireEvent.click(screen.getByLabelText("Select all on page"));
      expect(onSelectionCapExceeded).toHaveBeenCalledWith(2);
      expect(onSelectionChange).not.toHaveBeenCalled();
      // Cap exceeded is a no-op — checkboxes stay unchecked without a prop update.
      for (const cb of screen.getAllByLabelText("Select row")) {
        expect((cb as HTMLInputElement).checked).toBe(false);
      }
    });
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

  // PARITY-EXPORT-COMPUTED-COLUMN-BLANK — exportCsv used to read row[key] directly, never
  // calling render, so a column whose value only exists through render (a computed field with
  // no matching row property, or a raw integer formatted for display) exported blank or a raw
  // unit-less value while the on-screen table looked complete. `exportValue` fixes it.
  it("exportValue overrides the raw row lookup in the exported CSV; columns without it still export row[key]", () => {
    type ComputedRow = { id: string; label: string; totalCents: number };
    const computedColumns: Array<ParityColumn<ComputedRow>> = [
      { key: "label", label: "Label" }, // no exportValue — falls back to raw row[key]
      {
        key: "totalCents",
        label: "Total",
        render: (r) => `$${(r.totalCents / 100).toFixed(2)}`,
        exportValue: (r) => `$${(r.totalCents / 100).toFixed(2)}`,
      },
      {
        key: "duration", // no matching row property at all — the exact HosHistorySection shape
        label: "Duration",
        render: () => "8:00",
        exportValue: () => "8:00",
      },
    ];
    const computedRows: ComputedRow[] = [{ id: "1", label: "Alpha", totalCents: 123456 }];

    const clicks: string[] = [];
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      void blob.text().then((text) => clicks.push(text));
      return "blob:mock";
    });
    URL.revokeObjectURL = vi.fn();

    render(
      <ParityTable<ComputedRow>
        columns={computedColumns}
        rows={computedRows}
        rowKey={(r) => r.id}
        exportFilename="computed-export-test"
      />,
    );
    fireEvent.click(screen.getByLabelText("Export CSV"));

    return Promise.resolve().then(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      expect(clicks).toHaveLength(1);
      const [header, row] = clicks[0].split("\n");
      expect(header).toBe("Label,Total,Duration");
      // "Alpha" from raw row[key]; "$1234.56" from exportValue (not the raw 123456 integer);
      // "8:00" from exportValue (row.duration doesn't exist at all — would be blank without it).
      expect(row).toBe("Alpha,$1234.56,8:00");
    });
  });

  // PARITY-SORT-COMPUTED-COLUMN-NO-OP — sort had the same bug class as export: falling back to
  // raw row[key] when a computed column has no sortValue. If key doesn't match a real property,
  // every row's extracted value is undefined, so every pairwise comparison hits the nulls-equal
  // branch and returns 0 — clicking the header toggles the arrow but the row order never changes.
  it("sortValue overrides the raw row lookup for a column whose key has no matching row property (a complete sort no-op without it)", () => {
    type ComputedRow = { id: string; computed: string };
    const noSortValueColumns: Array<ParityColumn<ComputedRow>> = [
      // key "label" doesn't exist on ComputedRow at all — the real text comes from `computed`,
      // exactly the ItemsListPage.tsx "type"/"category"/"income"/"expense"/"status" shape.
      { key: "label", label: "Label", sortable: true, render: (r) => r.computed },
    ];
    const withSortValueColumns: Array<ParityColumn<ComputedRow>> = [
      { key: "label", label: "Label", sortable: true, render: (r) => r.computed, sortValue: (r) => r.computed },
    ];
    const unordered: ComputedRow[] = [
      { id: "1", computed: "Bravo" },
      { id: "2", computed: "Alpha" },
    ];
    const renderedOrder = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((tr) => tr.textContent ?? "");

    const { unmount } = render(<ParityTable<ComputedRow> columns={noSortValueColumns} rows={unordered} rowKey={(r) => r.id} />);
    expect(renderedOrder()).toEqual(["Bravo", "Alpha"]); // input order
    fireEvent.click(screen.getByText("Label"));
    // THE BUG: without sortValue, row["label"] is undefined for every row → no-op.
    expect(renderedOrder()).toEqual(["Bravo", "Alpha"]);
    unmount();

    render(<ParityTable<ComputedRow> columns={withSortValueColumns} rows={unordered} rowKey={(r) => r.id} />);
    expect(renderedOrder()).toEqual(["Bravo", "Alpha"]); // input order
    fireEvent.click(screen.getByText("Label"));
    // THE FIX: with sortValue reading `computed`, the click genuinely reorders the rows.
    expect(renderedOrder()).toEqual(["Alpha", "Bravo"]);
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

  it("tableTestId + rowTestId: migrated pages keep their container and per-row test hooks", () => {
    render(
      <ParityTable<Row>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        tableTestId="my-table"
        rowTestId={(r) => `my-row-${r.id}`}
      />,
    );
    expect(screen.getByTestId("my-table")).toBeInTheDocument();
    expect(screen.getByTestId("my-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("my-row-2")).toBeInTheDocument();
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

  // Controlled row-expansion (Phase A1) — mirrors the controlled-sort precedent.
  describe("controlled row-expansion (A1)", () => {
    const renderExpanded = (r: Row) => <div>detail for {r.name}</div>;

    it("uncontrolled default is unchanged: multi-expand keeps every expanded row open", () => {
      render(
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          renderExpanded={renderExpanded}
        />,
      );
      const toggles = screen.getAllByLabelText("Expand row");
      fireEvent.click(toggles[0]);
      fireEvent.click(screen.getAllByLabelText("Expand row")[0]); // Bravo (Alpha's toggle now reads Collapse)
      // Multi mode: both details stay open at once (pre-A1 behavior).
      expect(screen.getByText("detail for Alpha")).toBeInTheDocument();
      expect(screen.getByText("detail for Bravo")).toBeInTheDocument();
    });

    it("controlled mode: expandedKeys drives the open rows; toggles fire onExpandedChange without mutating internally", () => {
      const onExpandedChange = vi.fn();
      const { rerender } = render(
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          renderExpanded={renderExpanded}
          expandedKeys={["1"]}
          onExpandedChange={onExpandedChange}
        />,
      );
      // Prop-driven: row 1 open, row 2 closed.
      expect(screen.getByText("detail for Alpha")).toBeInTheDocument();
      expect(screen.queryByText("detail for Bravo")).toBeNull();

      // Expanding row 2 notifies the owner but does NOT open it until the prop changes.
      fireEvent.click(screen.getByLabelText("Expand row"));
      expect(onExpandedChange).toHaveBeenCalledWith(["1", "2"]);
      expect(screen.queryByText("detail for Bravo")).toBeNull();

      // Collapsing row 1 notifies with it removed from the CURRENT prop (still ["1"]) → [].
      fireEvent.click(screen.getByLabelText("Collapse row"));
      expect(onExpandedChange).toHaveBeenCalledWith([]);
      expect(screen.getByText("detail for Alpha")).toBeInTheDocument();

      // Owner applies the new keys → the table follows the prop.
      rerender(
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          renderExpanded={renderExpanded}
          expandedKeys={["2"]}
          onExpandedChange={onExpandedChange}
        />,
      );
      expect(screen.queryByText("detail for Alpha")).toBeNull();
      expect(screen.getByText("detail for Bravo")).toBeInTheDocument();
    });

    it('expandMode="single" (uncontrolled): expanding one row collapses the other', () => {
      render(
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          renderExpanded={renderExpanded}
          expandMode="single"
        />,
      );
      fireEvent.click(screen.getAllByLabelText("Expand row")[0]); // open Alpha
      expect(screen.getByText("detail for Alpha")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Expand row")); // open Bravo → Alpha collapses
      expect(screen.queryByText("detail for Alpha")).toBeNull();
      expect(screen.getByText("detail for Bravo")).toBeInTheDocument();
      // Toggling the open row closed still works in single mode.
      fireEvent.click(screen.getByLabelText("Collapse row"));
      expect(screen.queryByText("detail for Bravo")).toBeNull();
    });

    it('expandMode="single" (controlled): onExpandedChange reports only the newly expanded key', () => {
      const onExpandedChange = vi.fn();
      render(
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          renderExpanded={renderExpanded}
          expandMode="single"
          expandedKeys={["1"]}
          onExpandedChange={onExpandedChange}
        />,
      );
      fireEvent.click(screen.getByLabelText("Expand row")); // expand Bravo
      expect(onExpandedChange).toHaveBeenCalledWith(["2"]);
    });
  });

  // Group bands (Phase A2) — mirrors the controlled-sort / A1 controlled-expansion precedents.
  describe("group bands (A2)", () => {
    type GRow = { id: string; name: string; grp: string };
    const gColumns: Array<ParityColumn<GRow>> = [
      { key: "name", label: "Name" },
      { key: "grp", label: "Group" },
    ];
    // Deliberately interleaved keys: stable grouping must keep row order WITHIN each group
    // and order groups by first appearance (A before B) — never re-sort.
    const gRows: GRow[] = [
      { id: "1", name: "Alpha", grp: "A" },
      { id: "2", name: "Bravo", grp: "B" },
      { id: "3", name: "Charlie", grp: "A" },
    ];
    const groupByBase = {
      getKey: (r: GRow) => r.grp,
      renderHeader: (key: string, rowsInGroup: GRow[]) => (
        <span>{`Band ${key} (${rowsInGroup.length})`}</span>
      ),
    };

    it("omitted groupBy = unchanged: no band rows, plain row list", () => {
      render(<ParityTable<GRow> columns={gColumns} rows={gRows} rowKey={(r) => r.id} />);
      // header + 3 data rows, no bands.
      expect(screen.getAllByRole("row")).toHaveLength(4);
      expect(screen.queryByText(/^Band /)).toBeNull();
      expect(document.querySelector("[data-parity-group]")).toBeNull();
    });

    it("renders one full-width band per group with the group's rows beneath it, order preserved", () => {
      render(
        <ParityTable<GRow>
          columns={gColumns}
          rows={gRows}
          rowKey={(r) => r.id}
          groupBy={groupByBase}
        />,
      );
      // Bands rendered with the correct group rows.
      expect(screen.getByText("Band A (2)")).toBeInTheDocument();
      expect(screen.getByText("Band B (1)")).toBeInTheDocument();
      // Band <td> spans every rendered column.
      const bandCell = screen.getByText("Band A (2)").closest("td");
      expect(bandCell).toHaveAttribute("colspan", "2");
      // Sequence: band A → Alpha, Charlie (stable within group) → band B → Bravo.
      const sequence = screen
        .getAllByRole("row")
        .slice(1) // drop header row
        .map((tr) => tr.textContent ?? "");
      expect(sequence[0]).toContain("Band A (2)");
      expect(sequence[1]).toContain("Alpha");
      expect(sequence[2]).toContain("Charlie");
      expect(sequence[3]).toContain("Band B (1)");
      expect(sequence[4]).toContain("Bravo");
      // Not collapsible by default: no chevron toggles.
      expect(screen.queryByLabelText("Collapse group A")).toBeNull();
    });

    it("collapsible: chevron toggle hides the group's rows (uncontrolled), band stays visible", () => {
      render(
        <ParityTable<GRow>
          columns={gColumns}
          rows={gRows}
          rowKey={(r) => r.id}
          groupBy={{ ...groupByBase, collapsible: true }}
        />,
      );
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Collapse group A"));
      // Group A rows hidden; band and other groups untouched.
      expect(screen.queryByText("Alpha")).toBeNull();
      expect(screen.queryByText("Charlie")).toBeNull();
      expect(screen.getByText("Band A (2)")).toBeInTheDocument();
      expect(screen.getByText("Bravo")).toBeInTheDocument();
      // Re-expand restores the rows.
      fireEvent.click(screen.getByLabelText("Expand group A"));
      expect(screen.getByText("Alpha")).toBeInTheDocument();
    });

    it("controlled collapse: collapsedKeys drives hidden groups; toggles fire onCollapsedChange without mutating internally", () => {
      const onCollapsedChange = vi.fn();
      const { rerender } = render(
        <ParityTable<GRow>
          columns={gColumns}
          rows={gRows}
          rowKey={(r) => r.id}
          groupBy={{
            ...groupByBase,
            collapsible: true,
            collapsedKeys: ["A"],
            onCollapsedChange,
          }}
        />,
      );
      // Prop-driven: group A collapsed, group B open.
      expect(screen.queryByText("Alpha")).toBeNull();
      expect(screen.getByText("Bravo")).toBeInTheDocument();

      // Collapsing B notifies the owner but does NOT hide it until the prop changes.
      fireEvent.click(screen.getByLabelText("Collapse group B"));
      expect(onCollapsedChange).toHaveBeenCalledWith(["A", "B"]);
      expect(screen.getByText("Bravo")).toBeInTheDocument();

      // Expanding A notifies with it removed from the CURRENT prop (still ["A"]) → [].
      fireEvent.click(screen.getByLabelText("Expand group A"));
      expect(onCollapsedChange).toHaveBeenCalledWith([]);
      expect(screen.queryByText("Alpha")).toBeNull();

      // Owner applies the new keys → the table follows the prop.
      rerender(
        <ParityTable<GRow>
          columns={gColumns}
          rows={gRows}
          rowKey={(r) => r.id}
          groupBy={{
            ...groupByBase,
            collapsible: true,
            collapsedKeys: ["B"],
            onCollapsedChange,
          }}
        />,
      );
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.queryByText("Bravo")).toBeNull();
    });

    it("grouping composes with selection and row expansion (A1) on grouped rows", () => {
      render(
        <ParityTable<GRow>
          columns={gColumns}
          rows={gRows}
          rowKey={(r) => r.id}
          selectable
          renderExpanded={(r) => <div>detail for {r.name}</div>}
          groupBy={groupByBase}
        />,
      );
      // Selection still works on rows under a band.
      fireEvent.click(screen.getAllByLabelText("Select row")[0]);
      expect(screen.getByText("1 selected")).toBeInTheDocument();
      // Row expansion still works on rows under a band.
      fireEvent.click(screen.getAllByLabelText("Expand row")[0]);
      expect(screen.getByText("detail for Alpha")).toBeInTheDocument();
    });
  });

  // Controlled pagination (Phase A3) — mirrors the controlled-sort / A1 / A2 precedents.
  describe("controlled pagination (A3)", () => {
    const manyRows: Row[] = [
      { id: "1", name: "Alpha", amount: "$10" },
      { id: "2", name: "Bravo", amount: "$20" },
      { id: "3", name: "Charlie", amount: "$30" },
    ];

    it("uncontrolled default is unchanged: built-in pager renders and Next advances internally", () => {
      render(
        <ParityTable<Row>
          columns={columns}
          rows={manyRows}
          rowKey={(r) => r.id}
          pageSizeOptions={[2]}
        />,
      );
      // Pager chrome present with pre-A3 markup.
      expect(screen.getByText("1–2 of 3")).toBeInTheDocument();
      expect(screen.getByText("Per page")).toBeInTheDocument();
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.queryByText("Charlie")).toBeNull();
      // Next (›) advances via internal state — no props needed.
      fireEvent.click(screen.getByText("›"));
      expect(screen.getByText("Charlie")).toBeInTheDocument();
      expect(screen.queryByText("Alpha")).toBeNull();
      expect(screen.getByText("3–3 of 3")).toBeInTheDocument();
    });

    it("controlled mode: Next fires onPageChange(2) and does not advance until the page prop updates", () => {
      const onPageChange = vi.fn();
      const { rerender } = render(
        <ParityTable<Row>
          columns={columns}
          rows={manyRows}
          rowKey={(r) => r.id}
          pageSizeOptions={[2]}
          page={1}
          onPageChange={onPageChange}
        />,
      );
      fireEvent.click(screen.getByText("›"));
      expect(onPageChange).toHaveBeenCalledWith(2);
      // No internal mutation: still page 1 until the owner applies the prop.
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.queryByText("Charlie")).toBeNull();

      // Owner applies the new page → the table follows the prop.
      rerender(
        <ParityTable<Row>
          columns={columns}
          rows={manyRows}
          rowKey={(r) => r.id}
          pageSizeOptions={[2]}
          page={2}
          onPageChange={onPageChange}
        />,
      );
      expect(screen.getByText("Charlie")).toBeInTheDocument();
      expect(screen.queryByText("Alpha")).toBeNull();
      // Numbered page button also notifies instead of mutating.
      fireEvent.click(screen.getByText("1"));
      expect(onPageChange).toHaveBeenCalledWith(1);
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    it("controlled mode defaults to page 1 when the page prop is undefined", () => {
      render(
        <ParityTable<Row>
          columns={columns}
          rows={manyRows}
          rowKey={(r) => r.id}
          pageSizeOptions={[2]}
          onPageChange={vi.fn()}
        />,
      );
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.queryByText("Charlie")).toBeNull();
    });

    it("hidePager: no pager chrome in the DOM (rows still slice internally)", () => {
      render(
        <ParityTable<Row>
          columns={columns}
          rows={manyRows}
          rowKey={(r) => r.id}
          pageSizeOptions={[2]}
          hidePager
        />,
      );
      // No range label, per-page selector, or nav buttons.
      expect(screen.queryByText("1–2 of 3")).toBeNull();
      expect(screen.queryByText("Per page")).toBeNull();
      expect(screen.queryByText("›")).toBeNull();
      expect(screen.queryByText("«")).toBeNull();
      // Internal slicing still applies (page 1 of size 2).
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Bravo")).toBeInTheDocument();
      expect(screen.queryByText("Charlie")).toBeNull();
    });

    it("controlled pageSize: the prop drives slicing; the selector fires onPageSizeChange without internal mutation", () => {
      const onPageSizeChange = vi.fn();
      const { rerender } = render(
        <ParityTable<Row>
          columns={columns}
          rows={manyRows}
          rowKey={(r) => r.id}
          pageSizeOptions={[2, 3]}
          pageSize={2}
          onPageSizeChange={onPageSizeChange}
        />,
      );
      expect(screen.getByText("1–2 of 3")).toBeInTheDocument();
      expect(screen.queryByText("Charlie")).toBeNull();

      // Selector notifies the owner but does NOT change the slice until the prop updates.
      fireEvent.change(screen.getByDisplayValue("2"), { target: { value: "3" } });
      expect(onPageSizeChange).toHaveBeenCalledWith(3);
      expect(screen.queryByText("Charlie")).toBeNull();
      expect(screen.getByText("1–2 of 3")).toBeInTheDocument();

      // Owner applies the new size → the table follows the prop.
      rerender(
        <ParityTable<Row>
          columns={columns}
          rows={manyRows}
          rowKey={(r) => r.id}
          pageSizeOptions={[2, 3]}
          pageSize={3}
          onPageSizeChange={onPageSizeChange}
        />,
      );
      expect(screen.getByText("Charlie")).toBeInTheDocument();
      expect(screen.getByText("1–3 of 3")).toBeInTheDocument();
    });

    it("pre-paged combination: pageSize = rows.length + hidePager renders every provided row with no pager", () => {
      // Caller owns paging (e.g. server-paged): pass the CURRENT page's rows only.
      const serverPage: Row[] = [
        { id: "4", name: "Delta", amount: "$40" },
        { id: "5", name: "Echo", amount: "$50" },
      ];
      render(
        <ParityTable<Row>
          columns={columns}
          rows={serverPage}
          rowKey={(r) => r.id}
          pageSize={serverPage.length}
          hidePager
        />,
      );
      expect(screen.getByText("Delta")).toBeInTheDocument();
      expect(screen.getByText("Echo")).toBeInTheDocument();
      expect(screen.queryByText("Per page")).toBeNull();
    });
  });

  // External-sort passthrough (Phase A4) — identity path for caller-owned order
  // (server-side sort or a pre-sorted pipeline like bankTxnSortGroup).
  describe("external-sort passthrough (A4)", () => {
    // Deliberately NOT in "name" order: internal sort on sortKey="name" asc would flip these.
    const unorderedRows: Row[] = [
      { id: "2", name: "Bravo", amount: "$20" },
      { id: "1", name: "Alpha", amount: "$10" },
    ];

    /** First data-cell text of every rendered data row (skips the header row). */
    const renderedNameOrder = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((tr) => tr.textContent ?? "")
        .map((text) => (text.includes("Alpha") ? "Alpha" : text.includes("Bravo") ? "Bravo" : text));

    it('external + controlled: rows stay in INPUT order even when sortKey would reorder them internally', () => {
      render(
        <ParityTable<Row>
          columns={columns}
          rows={unorderedRows}
          rowKey={(r) => r.id}
          sortMode="external"
          sortKey="name"
          sortDirection="asc"
          onSortChange={() => {}}
        />,
      );
      // Identity passthrough: Bravo first, exactly as provided (internal mode would put Alpha first).
      expect(renderedNameOrder()).toEqual(["Bravo", "Alpha"]);
      // The sort indicator still paints from sortKey/sortDirection.
      const nameHeader = screen.getAllByRole("columnheader").find((th) => th.textContent?.includes("Name"));
      expect(nameHeader?.textContent).toContain("▲");
    });

    it("external + controlled: header click fires onSortChange but row order does not change without a parent update", () => {
      const onSortChange = vi.fn();
      const { rerender } = render(
        <ParityTable<Row>
          columns={columns}
          rows={unorderedRows}
          rowKey={(r) => r.id}
          sortMode="external"
          sortKey="name"
          sortDirection="asc"
          onSortChange={onSortChange}
        />,
      );
      // The header button's text is "Name▲" while the chevron paints, so match by prefix.
      fireEvent.click(screen.getByRole("button", { name: /^Name/ }));
      // asc → desc toggle is reported to the owner…
      expect(onSortChange).toHaveBeenCalledWith("name", "desc");
      // …but the table itself never reorders — still the caller's input order.
      expect(renderedNameOrder()).toEqual(["Bravo", "Alpha"]);

      // Owner applies the new order + direction → the table follows the props verbatim.
      rerender(
        <ParityTable<Row>
          columns={columns}
          rows={[unorderedRows[1], unorderedRows[0]]}
          rowKey={(r) => r.id}
          sortMode="external"
          sortKey="name"
          sortDirection="desc"
          onSortChange={onSortChange}
        />,
      );
      expect(renderedNameOrder()).toEqual(["Alpha", "Bravo"]);
      const nameHeader = screen.getAllByRole("columnheader").find((th) => th.textContent?.includes("Name"));
      expect(nameHeader?.textContent).toContain("▼");
    });

    it("omitted sortMode keeps today's internal sort (regression pin for ~130 call sites)", () => {
      render(
        <ParityTable<Row>
          columns={columns}
          rows={unorderedRows}
          rowKey={(r) => r.id}
          sortKey="name"
          sortDirection="asc"
          onSortChange={() => {}}
        />,
      );
      // Internal (default) mode sorts by name asc: Alpha before Bravo.
      expect(renderedNameOrder()).toEqual(["Alpha", "Bravo"]);
    });

    it('explicit sortMode="internal" sorts exactly like the omitted default', () => {
      render(
        <ParityTable<Row>
          columns={columns}
          rows={unorderedRows}
          rowKey={(r) => r.id}
          sortMode="internal"
          sortKey="name"
          sortDirection="asc"
          onSortChange={() => {}}
        />,
      );
      expect(renderedNameOrder()).toEqual(["Alpha", "Bravo"]);
    });

    it('sortMode="external" WITHOUT onSortChange falls back to internal (external requires controlled sort)', () => {
      render(
        <ParityTable<Row>
          columns={columns}
          rows={unorderedRows}
          rowKey={(r) => r.id}
          sortMode="external"
        />,
      );
      // Uncontrolled: no sortKey yet → input order; a header click must still sort INTERNALLY
      // (the fallback), because without onSortChange nobody could ever apply an order.
      expect(renderedNameOrder()).toEqual(["Bravo", "Alpha"]);
      fireEvent.click(screen.getByText("Name"));
      expect(renderedNameOrder()).toEqual(["Alpha", "Bravo"]);
    });
  });
});
