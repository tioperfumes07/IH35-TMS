import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PolicyDetail } from "./PolicyDetail";

/**
 * C-16 — the policy detail's Claims and Lawsuits tables rendered claim_number/case_number as
 * plain text: the office could see a claim/lawsuit was attached to the policy but had no way to
 * open it. EntityLink kind="claim"/"lawsuit" already resolve to their list surfaces with the
 * ?claim_id=/?lawsuit_id= query param the target tab honors (select+highlight) — the same reverse
 * chrome pattern used everywhere else these entities are listed on another record.
 */

const policyId = "00000000-0000-4000-8000-000000000123";
const claimId = "c1aa0000-0000-0000-0000-000000000001";
const lawsuitId = "1a550000-0000-0000-0000-000000000002";
const customerId = "c0570000-0000-4000-8000-000000000003";

const insuranceApiMocks = {
  getInsurancePolicy: vi.fn().mockResolvedValue({
    id: policyId,
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
  }),
  listInsuranceClaims: vi.fn().mockResolvedValue({
    claims: [{ id: claimId, claim_number: "CLM-0042", status: "open", amount_claimed_cents: 100000 }],
  }),
  listInsurancePaymentSchedule: vi.fn().mockResolvedValue({ payment_schedules: [] }),
  listInsuranceCoiRequests: vi.fn().mockResolvedValue({
    requests: [
      {
        id: "c0100000-0000-4000-8000-000000000004",
        tenant_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        customer_id: customerId,
        customer_name: "Acme Shipper",
        policy_id: policyId,
        requested_at: "2026-01-02T00:00:00.000Z",
        requested_by: null,
        status: "pending",
        notes: null,
        document_url: null,
        expires_at: null,
        responded_at: null,
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    ],
  }),
  listInsuranceLawsuits: vi.fn().mockResolvedValue({
    lawsuits: [{ id: lawsuitId, case_number: "CASE-9001", status: "filed", demand_cents: 500000, claim_id: claimId }],
  }),
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
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/safety/insurance/policies/${policyId}`]}>
        <Routes>
          <Route path="/safety/insurance/policies/:policyId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PolicyDetail claims/lawsuits reverse chrome (C-16)", () => {
  it("renders the claim number as a real EntityLink to the claim, not plain text", async () => {
    render(wrap(<PolicyDetail />));
    const link = await screen.findByRole("link", { name: "CLM-0042" });
    expect(link.getAttribute("href")).toBe(`/safety/insurance/claims?claim_id=${claimId}`);
  });

  it("renders the lawsuit case number as a real EntityLink to the lawsuit, not plain text", async () => {
    render(wrap(<PolicyDetail />));
    const link = await screen.findByRole("link", { name: "CASE-9001" });
    expect(link.getAttribute("href")).toBe(`/safety/insurance/lawsuits?lawsuit_id=${lawsuitId}`);
    expect(insuranceApiMocks.listInsuranceLawsuits).toHaveBeenCalledWith({
      operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      policy_id: policyId,
    });
  });

  it("requests an exact policy-filtered COI reverse list and drills to its customer", async () => {
    render(wrap(<PolicyDetail />));
    const link = await screen.findByRole("link", { name: "Acme Shipper" });
    expect(link.getAttribute("href")).toBe(`/customers/${customerId}`);
    expect(insuranceApiMocks.listInsuranceCoiRequests).toHaveBeenCalledWith({
      operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      policy_id: policyId,
    });
  });
});
