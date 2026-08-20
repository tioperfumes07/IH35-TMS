import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { LawsuitsTab } from "./LawsuitsTab";

const LAWSUIT_ID = "law-1234-5678";

const insuranceApiMocks = {
  listInsuranceLawsuits: vi.fn().mockResolvedValue({
    lawsuits: [
      {
        id: LAWSUIT_ID,
        case_number: "CASE-1001",
        status: "active",
        claim_id: "clm-9999",
        driver_id: "driver-9999",
        driver_name: "Jane Driver",
        unit_id: "unit-9999",
        unit_number: "T-9999",
        court_name: "State Court",
        filed_date: "2026-01-01",
        demand_cents: 100000,
        settlement_cents: 0,
      },
      {
        id: "law-other",
        case_number: "CASE-2002",
        status: "filed",
        claim_id: null,
        driver_id: null,
        unit_id: null,
        court_name: "Other Court",
        filed_date: "2026-02-01",
        demand_cents: 0,
        settlement_cents: 0,
      },
    ],
  }),
  listInsuranceClaims: vi.fn().mockResolvedValue({ claims: [] }),
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
    create: vi.fn(),
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

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({
    user: { uuid: "owner-1", email: "owner@test.invalid", role: "Owner" },
    session: { id: "session-1" },
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../api/legal-matters", () => ({
  legalMattersApi: {
    list: vi.fn().mockResolvedValue({ matters: [] }),
  },
}));

function wrap(ui: ReactElement, initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LawsuitsTab ?lawsuit_id= reverse drill-through (Law §9)", () => {
  it("selects and highlights the deep-linked lawsuit row from EntityLink kind=\"lawsuit\"", async () => {
    render(wrap(<LawsuitsTab />, `/safety/insurance/lawsuits?lawsuit_id=${LAWSUIT_ID}`));

    const targetRow = await screen.findByText("CASE-1001");
    await waitFor(() => {
      expect(targetRow.closest("tr")).toHaveClass("bg-slate-100");
    });

    const otherRow = screen.getByText("CASE-2002");
    expect(otherRow.closest("tr")).not.toHaveClass("bg-slate-100");
  });

  it("shows the deep-linked lawsuit's claim reverse section (no dead end)", async () => {
    render(wrap(<LawsuitsTab />, `/safety/insurance/lawsuits?lawsuit_id=${LAWSUIT_ID}`));

    await screen.findByText("CASE-1001");
    await waitFor(() => {
      expect(screen.getByTestId("insurance-lawsuit-legal-matters")).toBeInTheDocument();
    });
  });

  it("renders direct driver and unit drill-through resolved through the linked claim", async () => {
    render(wrap(<LawsuitsTab />, "/safety/insurance/lawsuits"));

    await screen.findByText("CASE-1001");
    // EntityLinkOrTombstone's accessible name is the resolved entity name ("Jane Driver"), never the
    // generic noun ("Driver — not visible" only renders when the name genuinely fails to resolve).
    expect(screen.getByRole("link", { name: "Jane Driver" })).toHaveAttribute("href", expect.stringContaining("driver-9999"));
    expect(screen.getByRole("link", { name: "T-9999" })).toHaveAttribute("href", expect.stringContaining("unit-9999"));
  });

  it("renders with no selection when lawsuit_id is absent (unchanged default behavior)", async () => {
    render(wrap(<LawsuitsTab />, "/safety/insurance/lawsuits"));

    const row = await screen.findByText("CASE-1001");
    expect(row.closest("tr")).not.toHaveClass("bg-slate-100");
  });
});
