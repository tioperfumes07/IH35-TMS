import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { LawsuitsTab } from "./LawsuitsTab";

const insuranceApiMocks = {
  listInsuranceLawsuits: vi.fn().mockResolvedValue({ lawsuits: [] }),
  listInsuranceClaims: vi.fn().mockResolvedValue({
    claims: [{ id: "claim-1", claim_number: "CLM-1001" }],
  }),
  createLawsuit: vi.fn(),
};

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../api/insurance", () => ({
  listInsuranceLawsuits: (...args: unknown[]) => insuranceApiMocks.listInsuranceLawsuits(...args),
  listInsuranceClaims: (...args: unknown[]) => insuranceApiMocks.listInsuranceClaims(...args),
  insuranceLawsuitsApi: {
    create: (...args: unknown[]) => insuranceApiMocks.createLawsuit(...args),
  },
}));

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

vi.mock("../../api/safety", () => ({
  getUserPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LawsuitsTab create lawsuit modal", () => {
  beforeEach(() => {
    insuranceApiMocks.createLawsuit.mockReset();
  });

  it("closes on cancel without persisting draft values", async () => {
    const user = userEvent.setup();
    render(wrap(<LawsuitsTab />));

    await user.click(await screen.findByRole("button", { name: /\+ Lawsuit/i }));
    await screen.findByRole("heading", { name: /Create Lawsuit/i });

    const caseNumberInput = screen.getByLabelText(/Case Number/i);
    await user.type(caseNumberInput, "CASE-1001");
    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Create Lawsuit/i })).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: /\+ Lawsuit/i }));
    await screen.findByRole("heading", { name: /Create Lawsuit/i });
    expect(screen.getByLabelText(/Case Number/i)).toHaveValue("");
    expect(insuranceApiMocks.createLawsuit).not.toHaveBeenCalled();
  });
});
