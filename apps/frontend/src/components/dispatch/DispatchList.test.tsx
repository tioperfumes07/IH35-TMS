import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DispatchLoadRow } from "../../api/loads";
import "../../design/design-tokens.css";
import { DispatchList } from "./DispatchList";

function mockLoad(overrides: Partial<DispatchLoadRow> = {}): DispatchLoadRow {
  return {
    id: "load-1",
    operating_company_id: "co-1",
    load_number: "L-100",
    customer_id: "cust-1",
    customer_name: "ACME TRANSPORTATION SERVICES LLC",
    status: "booked",
    rate_total_cents: 10000,
    currency_code: "USD",
    assigned_unit_id: null,
    assigned_unit_number: "T-1",
    assigned_primary_driver_id: "d-1",
    assigned_primary_driver_name: "ANTONIO RAMIREZ-MARTINEZ JR.",
    assigned_secondary_driver_id: null,
    dispatcher_user_id: "u-1",
    notes: null,
    first_pickup_city: "Austin",
    first_delivery_city: "Dallas",
    flag_code: "GRAY",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    soft_deleted_at: null,
    deleted_by_user_id: null,
    ...overrides,
  };
}

describe("DispatchList single-line names (invariant #23)", () => {
  it("applies single-line-name + title on customer and driver (table row)", () => {
    const { container } = render(
      <DispatchList
        loads={[mockLoad()]}
        totalCount={1}
        limit={50}
        offset={0}
        loading={false}
        sortField="created_at"
        sortDirection="desc"
        onSortChange={vi.fn()}
        onPageChange={vi.fn()}
        onRowClick={vi.fn()}
        onExportCsv={vi.fn()}
      />,
    );

    const marks = container.querySelectorAll(".single-line-name");
    expect(marks.length).toBe(2);

    const withCustomerTitle = [...marks].filter((el) => el.getAttribute("title") === "ACME TRANSPORTATION SERVICES LLC");
    expect(withCustomerTitle.length).toBe(1);

    const withDriverTitle = [...marks].filter((el) => el.getAttribute("title") === "ANTONIO RAMIREZ-MARTINEZ JR.");
    expect(withDriverTitle.length).toBe(1);
  });

  it("omits title when customer or driver name is null (placeholder text only)", () => {
    const { container } = render(
      <DispatchList
        loads={[
          mockLoad({
            customer_name: null,
            assigned_primary_driver_name: null,
          }),
        ]}
        totalCount={1}
        limit={50}
        offset={0}
        loading={false}
        sortField="created_at"
        sortDirection="desc"
        onSortChange={vi.fn()}
        onPageChange={vi.fn()}
        onRowClick={vi.fn()}
        onExportCsv={vi.fn()}
      />,
    );

    const marks = [...container.querySelectorAll(".single-line-name")];
    const dash = marks.filter((el) => el.textContent === "-");
    expect(dash.length).toBe(1);
    for (const el of dash) {
      expect(el.getAttribute("title")).toBeNull();
    }
    const unassigned = marks.filter((el) => el.textContent === "Unassigned");
    expect(unassigned.length).toBe(1);
    for (const el of unassigned) {
      expect(el.getAttribute("title")).toBeNull();
    }
  });

  it("row click still navigates", () => {
    const onRowClick = vi.fn();
    render(
      <DispatchList
        loads={[mockLoad()]}
        totalCount={1}
        limit={50}
        offset={0}
        loading={false}
        sortField="created_at"
        sortDirection="desc"
        onSortChange={vi.fn()}
        onPageChange={vi.fn()}
        onRowClick={onRowClick}
        onExportCsv={vi.fn()}
      />,
    );

    const loadCells = screen.getAllByText("L-100");
    const row = loadCells.map((el) => el.closest("tr")).find((r) => r != null);
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(onRowClick).toHaveBeenCalledWith("load-1");
  });
});
