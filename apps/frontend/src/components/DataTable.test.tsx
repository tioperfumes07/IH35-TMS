import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";

type Row = { id: string; code: string; rank?: number };

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

  it("inherits the canonical toolbar search and filters rendered rows", async () => {
    const user = userEvent.setup();
    render(
      <DataTable<Row>
        columns={[{ key: "code", label: "Code" }]}
        rows={[{ id: "1", code: "ALPHA" }, { id: "2", code: "BRAVO" }]}
        rowKey={(r) => r.id}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "Search rows…" }), "bravo");
    await waitFor(() => expect(screen.queryByText("ALPHA")).not.toBeInTheDocument());
    expect(screen.getByText("BRAVO")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 rows")).toBeInTheDocument();
  });

  it("sorts rendered columns by their explicit value with accessible state", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DataTable<Row>
        columns={[{
          key: "display_rank",
          label: "Rank",
          sortable: true,
          sortValue: (row) => row.rank,
          render: (row) => `Rank ${row.rank}`,
        }]}
        rows={[{ id: "b", code: "BRAVO", rank: 20 }, { id: "a", code: "ALPHA", rank: 3 }]}
        rowKey={(row) => row.id}
      />,
    );

    const header = screen.getByRole("columnheader", { name: "Rank" });
    expect(header).toHaveAttribute("aria-sort", "none");
    await user.click(screen.getByRole("button", { name: "Rank" }));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent)).toEqual([
      "Rank 3",
      "Rank 20",
    ]);
  });
});
