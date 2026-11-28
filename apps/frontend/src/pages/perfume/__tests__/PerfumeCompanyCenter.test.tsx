/** M19: the company center lists every transaction with the page it opens, filters by side and type, and saves notes. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeCompanyCenter } from "../PerfumeCompanyCenter";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

const center = { company: { id: "co1", name: "ZZ Co" }, notes: null, customer_ids: [], vendor_ids: ["v1"], open_ar_cents: 0, open_ap_cents: 12345,
  ar_aging: { current: 0, b1: 0, b2: 0, b3: 0, total: 0 }, ap_aging: { current: 12345, b1: 0, b2: 0, b3: 0, total: 12345 }, quoted_cents: 0, ordered_cents: 0, bought_cents: 0,
  operating_company_id: "sx",
  transactions: [
    { key: "q-1", type: "Quote", side: "customer", id: "q1", number: "QT-000001", date: "2026-11-27", due_date: null, status: "draft", amount_cents: 3000, open_cents: null, tab: "quotes", path: null },
    { key: "b-1", type: "Bill", side: "vendor", id: "b1", number: "BILL-7", date: "2026-11-26", due_date: "2026-12-26", status: "open", amount_cents: 12345, open_cents: 12345, tab: null, path: "/accounting/bills/b1" },
  ] };

describe("PerfumeCompanyCenter", () => {
  it("shows A/P open, opens each row's page, filters, and saves notes", async () => {
    const api = vi.mocked(clientApi.apiRequest);
    api.mockImplementation(async (url: string) => (url.endsWith("/notes") ? { updated: 1 } : center) as never);
    render(<MemoryRouter><ToastProvider><QueryClientProvider client={new QueryClient()}><PerfumeCompanyCenter companyId="co1" /></QueryClientProvider></ToastProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("BILL-7")).toBeTruthy());
    expect(screen.getByText("BILL-7").closest("a")!.getAttribute("href")).toBe("/accounting/bills/b1");
    expect(screen.getByText("QT-000001").closest("button")).toBeTruthy();
    expect(screen.getAllByText("$123.45").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByTestId("perfume-center-side"), { target: { value: "customer" } });
    expect(screen.queryByText("BILL-7")).toBeNull();
    fireEvent.click(screen.getByTestId("perfume-center-tab-notes"));
    fireEvent.change(screen.getByTestId("perfume-center-notes"), { target: { value: "Calls on Mondays" } });
    fireEvent.click(screen.getByTestId("perfume-center-notes-save"));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/v1/perfume/companies/co1/notes", { method: "PUT", body: { notes: "Calls on Mondays" } }));
  });
});
