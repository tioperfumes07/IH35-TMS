import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";

type Row = { id: string; code: string };

describe("DataTable", () => {
  it("renders list error state instead of empty rows when errorState is set", () => {
    render(
      <DataTable<Row>
        columns={[{ key: "code", label: "Code" }]}
        rows={[]}
        rowKey={(r) => r.id}
        errorState={{ status: 503, message: "unavailable", onRetry: vi.fn() }}
      />
    );
    expect(screen.getByText("Couldn't load list")).toBeInTheDocument();
    expect(screen.queryByText("No records found.")).toBeNull();
  });

  it("shows standard empty state when there is no error", () => {
    render(<DataTable<Row> columns={[{ key: "code", label: "Code" }]} rows={[]} rowKey={(r) => r.id} />);
    expect(screen.getByText("No records found.")).toBeInTheDocument();
  });

  it("applies cellClass to tbody cells", () => {
    const { container } = render(
      <DataTable<Row>
        columns={[{ key: "code", label: "Code", cellClass: "code-cell" }]}
        rows={[{ id: "1", code: "L-13518" }]}
        rowKey={(r) => r.id}
      />
    );
    const td = container.querySelector("tbody td.code-cell");
    expect(td).toBeTruthy();
    expect(td?.textContent).toContain("L-13518");
  });
});
