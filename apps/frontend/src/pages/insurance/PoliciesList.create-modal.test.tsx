import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { PoliciesList } from "./PoliciesList";

const authState = {
  role: "Owner",
};

const insuranceApiMocks = {
  listInsurancePolicies: vi.fn().mockResolvedValue({ policies: [] }),
  listInsuranceTypeCatalog: vi.fn().mockResolvedValue({
    types: [{ id: "type-1", code: "auto_liability", name: "Auto Liability" }],
  }),
  createPolicy: vi.fn(),
};

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({
    user: { role: authState.role, uuid: "81111181-1111-4111-8111-111111111111" },
    session: null,
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

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
  listInsurancePolicies: (...args: unknown[]) => insuranceApiMocks.listInsurancePolicies(...args),
  listInsuranceTypeCatalog: (...args: unknown[]) => insuranceApiMocks.listInsuranceTypeCatalog(...args),
  insurancePoliciesApi: {
    create: (...args: unknown[]) => insuranceApiMocks.createPolicy(...args),
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

vi.mock("../../components/insurance/PolicyCreateWizard", () => ({
  PolicyCreateWizard: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="policy-wizard">
        <button onClick={onClose}>Close wizard</button>
      </div>
    ) : null,
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

describe("PoliciesList create policy access and cancel behavior", () => {
  beforeEach(() => {
    authState.role = "Owner";
    insuranceApiMocks.createPolicy.mockReset();
  });

  it("shows + Create policy only for allowed roles (Guard B vocabulary)", async () => {
    authState.role = "Driver";
    const { rerender } = render(wrap(<PoliciesList />));
    expect(screen.queryByRole("button", { name: /\+ Create policy/i })).toBeNull();

    authState.role = "Accountant";
    rerender(wrap(<PoliciesList />));
    expect(await screen.findByRole("button", { name: /\+ Create policy/i })).toBeInTheDocument();
  });

  it("opens wizard (not modal) when + Create policy clicked", async () => {
    const user = userEvent.setup();
    render(wrap(<PoliciesList />));
    await user.click(await screen.findByRole("button", { name: /\+ Create policy/i }));
    expect(screen.getByTestId("policy-wizard")).toBeInTheDocument();
  });
});
