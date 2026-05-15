import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as acct from "../../../api/accounting";
import * as qbo from "../../../api/accounting-qbo-entities";
import { VENDOR_TX_STATUS_OPTIONS, VENDOR_TX_TYPE_OPTIONS, VendorDetailPage } from "../VendorDetailPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "00000000-0000-4000-8000-000000000001" }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../../../api/accounting-wave2", () => ({
  get1099FormPdf: vi.fn(),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/vendors/v1"]}>
        <Routes>
          <Route path="/vendors/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("VendorDetailPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("status filter has 10 options", async () => {
    vi.spyOn(qbo, "getAccountingVendor").mockResolvedValue({ id: "v1", display_name: "Vend" } as never);
    vi.spyOn(qbo, "listAccountingVendors").mockResolvedValue({ items: [], next_cursor: null });
    vi.spyOn(acct, "listBills").mockResolvedValue({ rows: [] });
    const user = userEvent.setup();
    render(wrap(<VendorDetailPage />));
    await screen.findByRole("heading", { name: "Vend" });
    await user.click(screen.getByLabelText("Status filter"));
    expect(screen.getAllByRole("option").length).toBeGreaterThanOrEqual(VENDOR_TX_STATUS_OPTIONS.length);
  });

  it("type filter lists options", async () => {
    vi.spyOn(qbo, "getAccountingVendor").mockResolvedValue({ id: "v1", display_name: "Vend" } as never);
    vi.spyOn(qbo, "listAccountingVendors").mockResolvedValue({ items: [], next_cursor: null });
    vi.spyOn(acct, "listBills").mockResolvedValue({ rows: [] });
    const user = userEvent.setup();
    render(wrap(<VendorDetailPage />));
    await screen.findByRole("heading", { name: "Vend" });
    await user.click(screen.getByLabelText("Type filter"));
    for (const opt of VENDOR_TX_TYPE_OPTIONS) {
      expect(screen.getByRole("option", { name: new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeInTheDocument();
    }
  });
});
