import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../api/accounting-qbo-entities";
import { VendorsListPage } from "../VendorsListPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "00000000-0000-4000-8000-000000000001" }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("VendorsListPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders vendor grid", async () => {
    vi.spyOn(api, "listAccountingVendors").mockResolvedValue({
      items: [{ id: "v1", display_name: "Fuel Co", eligible_1099: true, open_bill_count: 1 }],
      next_cursor: null,
    });
    render(wrap(<VendorsListPage />));
    expect(await screen.findByText("Fuel Co")).toBeInTheDocument();
    const rows = screen.getAllByText("1099");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("1099 toggle passes filter to API", async () => {
    const spy = vi.spyOn(api, "listAccountingVendors").mockResolvedValue({ items: [], next_cursor: null });
    const user = userEvent.setup();
    render(wrap(<VendorsListPage />));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await user.click(screen.getByLabelText("Toggle 1099 eligible filter"));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", expect.objectContaining({ eligible_1099: true }))
    );
  });

  it("error case: load failure", async () => {
    vi.spyOn(api, "listAccountingVendors").mockRejectedValue(new Error("x"));
    render(wrap(<VendorsListPage />));
    expect(await screen.findByText(/Could not load vendors/)).toBeInTheDocument();
  });
});
