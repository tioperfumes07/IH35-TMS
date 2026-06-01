import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { ClaimsTab } from "./ClaimsTab";

const insuranceApiMocks = {
  listInsuranceClaims: vi.fn().mockResolvedValue({ claims: [] }),
  listInsurancePolicies: vi.fn().mockResolvedValue({
    policies: [{ id: "policy-1", policy_number: "POL-100", insurer_name: "IH35 Insurance" }],
  }),
  createClaim: vi.fn(),
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
  listInsuranceClaims: (...args: unknown[]) => insuranceApiMocks.listInsuranceClaims(...args),
  listInsurancePolicies: (...args: unknown[]) => insuranceApiMocks.listInsurancePolicies(...args),
  insuranceClaimsApi: {
    create: (...args: unknown[]) => insuranceApiMocks.createClaim(...args),
  },
}));

vi.mock("../../api/mdata", () => ({
  listUnits: vi.fn().mockResolvedValue({
    units: [{ id: "unit-1", unit_code: "TRK-100", status: "Active" }],
  }),
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

describe("ClaimsTab create claim modal", () => {
  beforeEach(() => {
    insuranceApiMocks.createClaim.mockReset();
  });

  it("closes on cancel without persisting draft values", async () => {
    const user = userEvent.setup();
    render(wrap(<ClaimsTab />));

    await user.click(await screen.findByRole("button", { name: /\+ Claim/i }));
    await screen.findByRole("heading", { name: /Create Claim/i });

    const claimNumberInput = screen.getByLabelText(/Claim Number/i);
    await user.type(claimNumberInput, "CLM-1001");
    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Create Claim/i })).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: /\+ Claim/i }));
    await screen.findByRole("heading", { name: /Create Claim/i });
    expect(screen.getByLabelText(/Claim Number/i)).toHaveValue("");
    expect(insuranceApiMocks.createClaim).not.toHaveBeenCalled();
  });
});
