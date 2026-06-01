import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PolicyDetail } from "./PolicyDetail";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const insuranceApiMocks = {
  getInsurancePolicy: vi.fn(),
  listInsuranceClaims: vi.fn().mockResolvedValue({ claims: [] }),
  listInsurancePaymentSchedule: vi.fn().mockResolvedValue({ payment_schedules: [] }),
  listInsuranceCoiRequests: vi.fn().mockResolvedValue({ requests: [] }),
  listInsuranceLawsuits: vi.fn().mockResolvedValue({ lawsuits: [] }),
  updateInsurancePolicy: vi.fn().mockResolvedValue({}),
  archiveInsurancePolicy: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../../api/insurance", () => ({
  getInsurancePolicy: (...args: unknown[]) => insuranceApiMocks.getInsurancePolicy(...args),
  listInsuranceClaims: (...args: unknown[]) => insuranceApiMocks.listInsuranceClaims(...args),
  listInsurancePaymentSchedule: (...args: unknown[]) => insuranceApiMocks.listInsurancePaymentSchedule(...args),
  listInsuranceCoiRequests: (...args: unknown[]) => insuranceApiMocks.listInsuranceCoiRequests(...args),
  listInsuranceLawsuits: (...args: unknown[]) => insuranceApiMocks.listInsuranceLawsuits(...args),
  updateInsurancePolicy: (...args: unknown[]) => insuranceApiMocks.updateInsurancePolicy(...args),
  archiveInsurancePolicy: (...args: unknown[]) => insuranceApiMocks.archiveInsurancePolicy(...args),
}));

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
  }),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({
    pushToast: vi.fn(),
  }),
}));

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/safety/insurance/policies/00000000-0000-4000-8000-000000000123"]}>
        <Routes>
          <Route path="/safety/insurance/policies/:policyId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PolicyDetail edit and archive", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    insuranceApiMocks.updateInsurancePolicy.mockClear();
    insuranceApiMocks.archiveInsurancePolicy.mockClear();
    insuranceApiMocks.getInsurancePolicy.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000123",
      insurer_name: "IH35 Carrier",
      policy_number: "PN-100",
      coverage_type: "auto_liability",
      coverage_type_id: "00000000-0000-4000-8000-000000000321",
      effective_date: "2026-01-01",
      expiry_date: "2026-12-31",
      total_premium_cents: 200000,
      down_payment_cents: 50000,
      installment_count: 6,
      due_day: 1,
      pay_day: 5,
      late_fee_pct: "1.50",
      insurer_email: null,
      agent_contact: null,
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      units: [],
    });
  });

  it("submits policy edit payload from detail page", async () => {
    const user = userEvent.setup();
    render(wrap(<PolicyDetail />));

    await screen.findByText(/Policy PN-100/i);
    await user.click(screen.getByRole("button", { name: /Edit \/ Update/i }));
    await user.selectOptions(screen.getByLabelText(/Status/i), "expired");
    await user.clear(screen.getByLabelText(/Effective date/i));
    await user.type(screen.getByLabelText(/Effective date/i), "2026-02-15");
    await user.clear(screen.getByLabelText(/Expiry date/i));
    await user.type(screen.getByLabelText(/Expiry date/i), "2027-02-15");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(insuranceApiMocks.updateInsurancePolicy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000123",
        "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        {
          status: "expired",
          effective_date: "2026-02-15",
          expiry_date: "2027-02-15",
        }
      );
    });
  });

  it("archives the policy and returns to policies list", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(wrap(<PolicyDetail />));

    await screen.findByText(/Policy PN-100/i);
    await user.click(screen.getByRole("button", { name: /^Archive$/i }));

    await waitFor(() => {
      expect(insuranceApiMocks.archiveInsurancePolicy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000123",
        "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
      );
      expect(mockNavigate).toHaveBeenCalledWith("/safety/insurance/policies");
    });

    confirmSpy.mockRestore();
  });
});
