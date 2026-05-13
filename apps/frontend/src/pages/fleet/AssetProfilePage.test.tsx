import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as accountingApi from "../../api/accounting";
import * as mdataApi from "../../api/mdata";
import { ToastProvider } from "../../components/Toast";
import { AssetProfilePage } from "./AssetProfilePage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../components/forms/QboCombobox", () => ({
  QboCombobox: () => <div data-testid="qbo-vendor-combobox" />,
}));

vi.mock("../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/mdata")>();
  return {
    ...actual,
    getUnit: vi.fn(),
    patchUnit: vi.fn(),
  };
});

vi.mock("../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/accounting")>();
  return {
    ...actual,
    listClassesForJe: vi.fn(),
  };
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/fleet/units/unit-test-1"]}>
          <Routes>
            <Route path="/fleet/units/:id" element={ui} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("AssetProfilePage", () => {
  beforeEach(() => {
    vi.mocked(mdataApi.getUnit).mockResolvedValue({
      id: "unit-test-1",
      unit_number: "T-501",
      qbo_vendor_id: null,
      qbo_class_id: null,
    });
    vi.mocked(accountingApi.listClassesForJe).mockResolvedValue({
      classes: [{ id: "class-1", class_code: "TX", class_name: "Texas" }],
    });
    vi.mocked(mdataApi.patchUnit).mockResolvedValue({
      id: "unit-test-1",
      unit_number: "T-501",
      qbo_vendor_id: "v1",
      qbo_class_id: "class-1",
    });
  });

  it("renders QBO vendor control and class selector for the unit", async () => {
    render(wrap(<AssetProfilePage />));

    expect(await screen.findByText(/Unit T-501/)).toBeInTheDocument();
    expect(screen.getByTestId("qbo-vendor-combobox")).toBeInTheDocument();
    expect(screen.getByText(/Class \(TMS catalog\)/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
