import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VendorsHomeBoard } from "../VendorsHomeBoard";
import * as clientApi from "../../../api/client";

vi.mock("../../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/client")>();
  return { ...actual, apiRequest: vi.fn() };
});

const board = {
  kpis: {
    with_transactions: 1, in_the_book: 3, spend_cents: 100_000, fuel_share_pct: 80, open_bills_cents: 5_000,
    unposted_fuel_cents: 2_500, unposted_fuel_count: 2, unposted_fuel_since: "2026-09-21", transactions: 4, top_vendor: null,
  },
  chips: { with_transactions: 1, open_bills: 1, all: 3 },
  by_category: [
    { category: "Fuel & Diesel", spend_cents: 80_000 },
    { category: "Tires", spend_cents: 10_000 },
    { category: "Dispatch — Mexico", spend_cents: 5_000 },
    { category: "Parts", spend_cents: 3_000 },
    { category: "Misc", spend_cents: 2_000 },
  ],
  pays_through: [{ account_id: "a1", account_name: "Dreamline Diesel Card Payable", vendors: 2, spend_cents: 90_000 }],
  open_bills_check: { remainder_count: 2, remainder_cents: 7_000, status_open_count: 1, status_open_cents: 5_000 },
  rows: [
    {
      id: "v1", name: "LOVES", status: "active", category: "Fuel & Diesel", txns: 4, spend_cents: 100_000, avg_ticket_cents: 25_000,
      last_paid: "2026-10-18", pays_through: "Dreamline Diesel Card Payable", open_bills: 1, open_bills_cents: 5_000,
    },
    {
      id: "v2", name: "Idle Vendor", status: "active", category: null, txns: 0, spend_cents: 0, avg_ticket_cents: null,
      last_paid: null, pays_through: null, open_bills: 0, open_bills_cents: 0,
    },
  ],
};

function renderBoard() {
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => (String(path).includes("/boards/vendors") ? board : { pairs: [] }) as never);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VendorsHomeBoard operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80" onMasterDetail={() => undefined} onCreate={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe("VendorsHomeBoard (443.280)", () => {
  it("renders the board's tiles, both panels, the vendor table and a live Measured bar", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Vendors · 1")).toBeTruthy());
    for (const label of ["With transactions", "In the book", "Spend YTD", "Fuel share", "Open bills", "Unposted fuel"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText("Spend by category · YTD")).toBeTruthy();
    expect(screen.getAllByText("Pays through").length).toBeGreaterThan(1); // panel title + table column
    // top three categories plus one rolled-up "Other" line (Parts + Misc)
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.getByText("2 since 09/21/2026")).toBeTruthy();
    expect(screen.getByRole("link", { name: "LOVES" }).getAttribute("href")).toBe("/vendors/v1");
    expect(screen.getByRole("link", { name: "Dreamline Diesel Card Payable" }).getAttribute("href")).toContain("/accounting/chart-of-accounts/register/a1");
    expect(screen.getByTestId("party-board-note").textContent).toContain("Open bills disagree across definitions");
    // the old controls are not on the board
    expect(screen.queryByLabelText("Add category")).toBeNull();
    expect(screen.queryByLabelText("Choose columns")).toBeNull();
  });
});
