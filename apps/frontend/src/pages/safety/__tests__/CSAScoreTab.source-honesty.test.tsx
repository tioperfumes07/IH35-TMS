import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CSAScoreTab } from "../tabs/CSAScoreTab";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "11111111-1111-4111-8111-111111111111" }),
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

vi.mock("../../../api/safetyV64", () => ({
  getCurrentCsaScore: vi.fn(async () => ({
    current: {
      basic_unsafe_driving: null,
      basic_hos_compliance: 7,
      basic_driver_fitness: null,
      basic_controlled_substances: null,
      basic_vehicle_maintenance: null,
      basic_crash_indicator: null,
      basic_hazmat: 99,
    },
  })),
  listCsaScores: vi.fn(async () => ({
    csa_scores: [{ id: "history-1", period_start: "2026-01-01", period_end: "2026-06-30", total_violations: null }],
  })),
  pullCsaFromSafer: vi.fn(async () => {
    throw new Error("source_not_authoritative");
  }),
  recomputeCsa: vi.fn(async () => ({ csa_score: {} })),
}));

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CSAScoreTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CSA Score source honesty", () => {
  it("labels local values as internal points and preserves missing values", async () => {
    renderTab();

    expect(await screen.findByText(/IH35 internal inspection-point rollups/)).toBeInTheDocument();
    expect(screen.queryByText(/Threshold/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/not an FMCSA percentile/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Internal Inspection Points")).toBeInTheDocument();
    expect((await screen.findAllByText("Unavailable")).length).toBeGreaterThan(0);

    const hazmatLabel = screen.getByText("Hazmat");
    const hazmatCard = hazmatLabel.closest("div.rounded-sm");
    expect(hazmatCard).not.toBeNull();
    expect(within(hazmatCard as HTMLElement).getByText("-")).toBeInTheDocument();
    expect(
      within(hazmatCard as HTMLElement).getByText(/authenticated carrier SMS required/i)
    ).toBeInTheDocument();
    expect(within(hazmatCard as HTMLElement).queryByText("99.00")).not.toBeInTheDocument();
  });
});
