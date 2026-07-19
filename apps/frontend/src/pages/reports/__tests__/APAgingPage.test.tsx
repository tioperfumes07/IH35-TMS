import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as reportsApi from "../../../api/reports";
import { ToastProvider } from "../../../components/Toast";
import { APAgingPage } from "../APAgingPage";
import { apAgingBillsListHref, apAgingVendorProfileHref } from "../agingDrillThrough";

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";
const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const mockNavigate = vi.fn();
let selectedCompanyId: string | null = COMPANY_ID;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId }),
}));

vi.mock("../ReportsSubNav", () => ({
  ReportsSubNav: () => <nav aria-label="Reports subnav stub" />,
}));

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const sampleRow: reportsApi.APAgingRow = {
  vendor_id: VENDOR_ID,
  vendor_name: "Loves Travel Stops",
  open_bill_count: 3,
  current_cents: 8_000,
  bucket_1_30_cents: 4_000,
  bucket_31_60_cents: 0,
  bucket_61_90_cents: 1_000,
  bucket_91_plus_cents: 0,
  total_open_cents: 13_000,
  last_payment_date: null,
};

describe("APAgingPage drill-through", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    selectedCompanyId = COMPANY_ID;
    vi.spyOn(reportsApi, "getApAgingReport").mockResolvedValue({
      status: "real",
      generated_at: "2026-07-18T00:00:00.000Z",
      as_of_date: "2026-07-18",
      rows: [sampleRow],
    });
    vi.spyOn(reportsApi, "exportApAging").mockResolvedValue(undefined as never);
  });

  it("requires an operating company (entity scoping)", async () => {
    selectedCompanyId = null;
    render(wrap(<APAgingPage />));
    expect(await screen.findByText(/Select an operating company/i)).toBeInTheDocument();
    expect(reportsApi.getApAgingReport).not.toHaveBeenCalled();
  });

  it("loads aging for the selected company only", async () => {
    render(wrap(<APAgingPage />));
    await waitFor(() => expect(screen.getByText("Loves Travel Stops")).toBeInTheDocument());
    expect(reportsApi.getApAgingReport).toHaveBeenCalledWith(COMPANY_ID, expect.any(String));
  });

  it("row click drills to unpaid bills list filtered by vendor", async () => {
    const user = userEvent.setup();
    render(wrap(<APAgingPage />));
    await waitFor(() => expect(screen.getByText("Loves Travel Stops")).toBeInTheDocument());
    await user.click(screen.getByText("Loves Travel Stops"));
    expect(mockNavigate).toHaveBeenCalledWith(apAgingBillsListHref(VENDOR_ID));
  });

  it("Pay now remains and targets the same unpaid bills list (keyboard)", async () => {
    const user = userEvent.setup();
    render(wrap(<APAgingPage />));
    await waitFor(() => expect(screen.getByText("Loves Travel Stops")).toBeInTheDocument());
    const payNow = screen.getByRole("button", { name: /Pay now for Loves Travel Stops/i });
    payNow.focus();
    expect(payNow).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(mockNavigate).toHaveBeenCalledWith(apAgingBillsListHref(VENDOR_ID));
  });

  it("Vendor profile row action preserves AP profile entry (keyboard Space)", async () => {
    const user = userEvent.setup();
    render(wrap(<APAgingPage />));
    await waitFor(() => expect(screen.getByText("Loves Travel Stops")).toBeInTheDocument());
    const profile = screen.getByRole("button", { name: /Open vendor profile for Loves Travel Stops/i });
    profile.focus();
    await user.keyboard(" ");
    expect(mockNavigate).toHaveBeenCalledWith(apAgingVendorProfileHref(VENDOR_ID));
  });
});
