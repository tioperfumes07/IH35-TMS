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
    expect(resolveEntityRoute("bill", "id1")).toBe("/accounting/bills/id1");
    expect(resolveEntityRoute("matter", "id1")).toBe("/legal/matters/id1");
    expect(resolveEntityRoute("insurance_policy", "id1")).toBe("/safety/insurance/policies/id1");
    expect(resolveEntityRoute("dvir", "id1")).toBe("/safety/idvr/id1");
    expect(resolveEntityRoute("maintenance_inspection", "id1")).toBe("/maintenance/inspections?inspection_id=id1");
    expect(resolveEntityRoute("training_record", "id1")).toBe("/safety/training/records?training_id=id1");
    expect(resolveEntityRoute("training_records_driver", "id1")).toBe("/safety/training/records?driver_id=id1");
    expect(resolveEntityRoute("loads_driver_filter", "id1")).toBe("/dispatch/loads?driver_id=id1");
    expect(resolveEntityRoute("unit_tires_tab", "id1")).toBe("/fleet/units/id1/detail?tab=tires");
    expect(resolveEntityRoute("unit_brakes_tab", "id1")).toBe("/fleet/units/id1/detail?tab=brakes");
  });

  it("resolves settlement, claim, and lawsuit to query-param drill-through", () => {
    expect(resolveEntityRoute("settlement", "id1")).toBe(
      "/driver-finance/settlements?settlement_id=id1",
    );
    expect(resolveEntityRoute("claim", "id1")).toBe("/safety/insurance/claims?claim_id=id1");
    expect(resolveEntityRoute("lawsuit", "id1")).toBe("/safety/insurance/lawsuits?lawsuit_id=id1");
  });

  it("resolves liability to list query-param and expense to per-id detail", () => {
    expect(resolveEntityRoute("liability", "id1")).toBe("/liabilities?liability_id=id1");
    expect(resolveEntityRoute("expense", "id1")).toBe("/accounting/expenses/id1");
    expect(resolveEntityRoute("bank_transaction", "txn1")).toBe("/banking/transactions?txn_id=txn1");
    expect(resolveEntityRoute("bill", "id1")).toBe("/accounting/bills/id1");
  });

  it("resolves payment, bill_payment, and transfer (Law §9 match candidates)", () => {
    expect(resolveEntityRoute("payment", "pay-1")).toBe("/accounting/payments/pay-1");
    expect(resolveEntityRoute("bill_payment", "bp-1")).toBe("/accounting/bill-payments/bp-1");
    expect(resolveEntityRoute("transfer", "tr-1")).toBe("/banking/transfers?transfer_id=tr-1");
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

  it("renders claim, lawsuit, and matter deep-links", () => {
    render(
      <MemoryRouter>
        <EntityLink kind="claim" id="clm-1" label="CLM-1" />
        <EntityLink kind="lawsuit" id="law-1" label="LAW-1" />
        <EntityLink kind="matter" id="mat-1" label="MAT-1" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "CLM-1" })).toHaveAttribute(
      "href",
      "/safety/insurance/claims?claim_id=clm-1",
    );
    expect(screen.getByRole("link", { name: "LAW-1" })).toHaveAttribute(
      "href",
      "/safety/insurance/lawsuits?lawsuit_id=law-1",
    );
    expect(screen.getByRole("link", { name: "MAT-1" })).toHaveAttribute("href", "/legal/matters/mat-1");
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
      "/accounting/expenses/exp-1",
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

  it("resolves the cash_advance query-param route as a real link (Law §9 2026-07-22)", () => {
    render(
      <MemoryRouter>
        <EntityLink kind="cash_advance" id="adv-1" label="CA-2026-0001" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "CA-2026-0001" })).toHaveAttribute(
      "href",
      "/cash-advances?advance_id=adv-1",
    );
  });
});
