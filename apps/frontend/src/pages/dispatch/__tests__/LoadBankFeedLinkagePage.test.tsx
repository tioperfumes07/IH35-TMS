import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as bankingApi from "../../../api/banking";
import * as loadsApi from "../../../api/loads";
import { LoadBankingLinkagePage } from "../LoadBankingLinkagePage";

/**
 * DISP-S22: /dispatch/loads/:id/banking renders, is entity-scoped, and shows an honest empty
 * state.
 */

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const loadId = "l1111111-0f3a-4c2d-8e1b-2c3d4e5f6071";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/dispatch/loads/${loadId}/banking`]}>
        <Routes>
          <Route path="/dispatch/loads/:id/banking" element={<LoadBankingLinkagePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockLoad() {
  return vi.spyOn(loadsApi, "getLoad").mockResolvedValue({
    id: loadId,
    operating_company_id: companyId,
    load_number: "L-20260820-0042",
  } as loadsApi.LoadDetail);
}

describe("LoadBankingLinkagePage (DISP-S22)", () => {
  it("renders without a blank frame and scopes the linkage fetch to company + load id", async () => {
    const spy = vi.spyOn(bankingApi, "getBankTransactionsByLinkage").mockResolvedValue({ rows: [], total_count: 0 });
    const loadSpy = mockLoad();
    wrap();
    expect(await screen.findByTestId("load-banking-linkage-page")).toBeTruthy();
    expect(spy).toHaveBeenCalledWith(companyId, expect.objectContaining({ load_id: loadId }));
    expect(loadSpy).toHaveBeenCalledWith(loadId, companyId);
    expect(await screen.findAllByText("L-20260820-0042")).toHaveLength(2);
  });

  it("shows a named honest-empty state (not a silent blank) when nothing is tagged to this load", async () => {
    vi.spyOn(bankingApi, "getBankTransactionsByLinkage").mockResolvedValue({ rows: [], total_count: 0 });
    mockLoad();
    wrap();
    expect(await screen.findByTestId("linked-bank-transactions-empty")).toBeTruthy();
  });

  it("surfaces a fetch failure honestly instead of a silent blank", async () => {
    vi.spyOn(bankingApi, "getBankTransactionsByLinkage").mockRejectedValue(new Error("boom"));
    mockLoad();
    wrap();
    expect(await screen.findByTestId("load-banking-linkage-page")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Refresh/i })).toBeTruthy();
  });
});
