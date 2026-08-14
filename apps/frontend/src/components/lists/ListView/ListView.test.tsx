import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListView } from "./ListView";

type Row = { id: string; name: string; total: number };

describe("ListView canonical toolbar", () => {
  it("applies shared search to the rows consumed by the list", () => {
    render(
      <ListView<Row>
        columns={[{ id: "name", label: "Name" }, { id: "total", label: "Total" }]}
        rows={[{ id: "1", name: "Alpha", total: 10 }, { id: "2", name: "Bravo", total: 20 }]}
        rowKey={(row) => row.id}
        pagination={{ page: 1, pageSize: 25, total: 2, onPageChange: vi.fn(), onPageSizeChange: vi.fn() }}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Search rows…" }), { target: { value: "bravo" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 rows")).toBeInTheDocument();
  });
});
