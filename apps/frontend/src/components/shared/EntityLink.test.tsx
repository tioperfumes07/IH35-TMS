import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EntityLink, resolveEntityRoute } from "./EntityLink";

describe("resolveEntityRoute", () => {
  it("resolves each kind with a real per-id detail route", () => {
    expect(resolveEntityRoute("load", "id1")).toBe("/dispatch/loads/id1");
    expect(resolveEntityRoute("invoice", "id1")).toBe("/accounting/invoices/id1");
    expect(resolveEntityRoute("journal_entry", "id1")).toBe("/accounting/journal-entries/id1");
    expect(resolveEntityRoute("vendor", "id1")).toBe("/vendors/id1");
    expect(resolveEntityRoute("customer", "id1")).toBe("/customers/id1");
    expect(resolveEntityRoute("unit", "id1")).toBe("/fleet/units/id1");
    expect(resolveEntityRoute("driver", "id1")).toBe("/drivers/id1");
    expect(resolveEntityRoute("trailer", "id1")).toBe("/fleet/trailers/id1");
    expect(resolveEntityRoute("bank_account", "id1")).toBe("/banking/accounts/id1");
    expect(resolveEntityRoute("factoring_advance", "id1")).toBe("/accounting/factoring/id1");
  });

  it("resolves settlement to the query-param drill-through (no path-param route exists)", () => {
    expect(resolveEntityRoute("settlement", "id1")).toBe(
      "/driver-finance/settlements?settlement_id=id1",
    );
  });

  it("resolves liability and expense to list query-param drill-through (real consumers)", () => {
    expect(resolveEntityRoute("liability", "id1")).toBe("/liabilities?liability_id=id1");
    expect(resolveEntityRoute("expense", "id1")).toBe("/accounting/expenses/list?expense_id=id1");
    expect(resolveEntityRoute("bill", "id1")).toBe("/accounting/bills/id1");
  });
});

describe("EntityLink", () => {
  it("renders a real <Link> for a kind with a resolvable route", () => {
    render(
      <MemoryRouter>
        <EntityLink kind="driver" id="drv-1" label="John Doe" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "John Doe" });
    expect(link).toHaveAttribute("href", "/drivers/drv-1");
    expect(link.className).toContain("text-slate-700");
  });

  it("renders a real <Link> for bill and expense drill-through", () => {
    render(
      <MemoryRouter>
        <EntityLink kind="bill" id="bill-1" label="BILL-0001" />
        <EntityLink kind="expense" id="exp-1" label="EXP-0001" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "BILL-0001" })).toHaveAttribute("href", "/accounting/bills/bill-1");
    expect(screen.getByRole("link", { name: "EXP-0001" })).toHaveAttribute(
      "href",
      "/accounting/expenses/list?expense_id=exp-1",
    );
  });

  it("renders plain text (no link, no crash) when id is missing", () => {
    render(
      <MemoryRouter>
        <EntityLink kind="load" id={null} label="—" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("defaults label to the raw id when no label is provided", () => {
    render(
      <MemoryRouter>
        <EntityLink kind="vendor" id="vnd-42" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "vnd-42" })).toHaveAttribute(
      "href",
      "/vendors/vnd-42",
    );
  });

  it("resolves the settlement query-param route as a real link", () => {
    render(
      <MemoryRouter>
        <EntityLink kind="settlement" id="stl-9" label="Settlement 9" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Settlement 9" })).toHaveAttribute(
      "href",
      "/driver-finance/settlements?settlement_id=stl-9",
    );
  });
});
