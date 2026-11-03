import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PartyBoard } from "../PartyBoard";
import * as clientApi from "../../../api/client";

vi.mock("../../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const aging = (current: number, d1_30: number, d31_60: number) => ({ current, d1_30, d31_60, d61_90: 0, d90_plus: 0 });
const board = {
  range_from: "2026-01-01",
  kpis: { with_transactions: 2, in_the_book: 3, open_invoices: 4, billed_cents: 300_000, ar_open_cents: 300_000, collected_cents: 0, invoices: 5, invoices_with_payment: 0 },
  chips: { with_transactions: 2, open_balance: 2, factored: 1, all: 3 },
  rows: [
    {
      id: "c1", name: "REFRIGERX TRANSPORTATION LLC", status: "active", factored: "Faro Factoring", factor_vendor_id: "fv1", invoices: 3,
      billed_cents: 200_000, collected_cents: 0, open_cents: 200_000, paid_invoices: 0, last_invoice: "2026-10-15", aging: aging(100_000, 80_000, 20_000),
    },
    {
      id: "c2", name: "Ace Doran", status: "active", factored: null, factor_vendor_id: null, invoices: 2,
      billed_cents: 100_000, collected_cents: 0, open_cents: 100_000, paid_invoices: 0, last_invoice: null, aging: aging(100_000, 0, 0),
    },
    {
      id: "c3", name: "Idle Customer", status: "inactive", factored: null, factor_vendor_id: null, invoices: 0,
      billed_cents: 0, collected_cents: 0, open_cents: 0, paid_invoices: 0, last_invoice: null, aging: aging(0, 0, 0),
    },
  ],
};

function renderBoard() {
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => (String(path).includes("/boards/customers") ? board : { pairs: [] }) as never);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PartyBoard kind="customers" operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80" onMasterDetail={() => undefined} onCreate={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe("Customers home (rows 55 — V3 board)", () => {
  it("renders the board's header, six tiles, chips, the customer panel with aging bars + legend and a live Measured bar", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Customers · 2")).toBeTruthy());
    expect(vi.mocked(clientApi.apiRequest).mock.calls.some(([p]) => String(p).startsWith("/api/v1/mdata/boards/customers?") && String(p).includes("range=ytd"))).toBe(true);
    expect(screen.getByText("+ Create Customer")).toBeTruthy();
    expect(screen.getByText("← Back")).toBeTruthy();
    for (const label of ["With transactions", "In the book", "Open invoices", "Billed", "A/R open", "Collected"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    // A/R open sub = past-due share computed from the rows' aging (100,000 of 300,000)
    expect(screen.getByText("33.3% past due")).toBeTruthy();
    expect(screen.getByText("no payments applied")).toBeTruthy();
    for (const chip of ["With transactions 2", "Open balance 2", "Factored 1", "All 3"]) expect(screen.getByText(chip)).toBeTruthy();
    expect(screen.getByTestId("customers-board-export").textContent).toBe("Export");
    expect(screen.getByTestId("customers-board-print").textContent).toBe("Print");
    // names link to the record, proper-cased
    expect(screen.getByRole("link", { name: "Refrigerx Transportation LLC" }).getAttribute("href")).toBe("/customers/c1");
    expect(screen.getByRole("link", { name: "Faro Factoring" }).getAttribute("href")).toBe("/vendors/fv1");
    expect(screen.getByText("10/15/2026")).toBeTruthy();
    expect(screen.getAllByTestId("customers-aging-bar").length).toBe(2);
    const legend = screen.getByTestId("customers-aging-legend").textContent ?? "";
    expect(legend).toContain("not due");
    expect(legend).toContain("1–30 late");
    expect(legend).toContain("31–60 late");
    expect(legend).not.toContain("90+");
    const note = screen.getByTestId("party-board-note").textContent ?? "";
    expect(note).toContain("Measured");
    expect(note).toContain("invoices issued (open and paid)");
    expect(note).toContain("$3,000.00");
    // the inactive customer without transactions is not on the default chip
    expect(screen.queryByText("Idle Customer")).toBeNull();
    // the old controls are not on the board
    expect(screen.queryByLabelText("Choose columns")).toBeNull();
    expect(screen.queryByLabelText("Aging")).toBeNull();
  });
});
