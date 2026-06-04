import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DefectsInboxPage } from "../DefectsInboxPage";

const listMaintenanceDvirDefects = vi.fn();
const triageMaintenanceDvirDefect = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  listMaintenanceDvirDefects: (...args: unknown[]) => listMaintenanceDvirDefects(...args),
  triageMaintenanceDvirDefect: (...args: unknown[]) => triageMaintenanceDvirDefect(...args),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "11111111-1111-4111-8111-111111111111",
    companies: [{ id: "11111111-1111-4111-8111-111111111111", name: "IH35" }],
  }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DefectsInboxPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DefectsInboxPage (B27)", () => {
  beforeEach(() => {
    listMaintenanceDvirDefects.mockReset();
    triageMaintenanceDvirDefect.mockReset();
    listMaintenanceDvirDefects.mockResolvedValue({
      defects: [
        {
          id: "defect-1",
          dvir_submission_id: "sub-1",
          unit_id: "unit-1",
          item_key: "brakes",
          severity: "major",
          notes: "soft pedal",
          triage_status: "pending",
          submitted_at: "2026-06-04T12:00:00Z",
          unit_number: "T-101",
          driver_name: "Alex Driver",
        },
      ],
    });
  });

  it("renders inbox shell and loads defects", async () => {
    renderPage();
    expect(screen.getByTestId("maint-dvir-defects-inbox")).toBeInTheDocument();
    expect(await screen.findByText("brakes")).toBeInTheDocument();
    expect(screen.getByText("Alex Driver")).toBeInTheDocument();
  });

  it("links to defect detail route", async () => {
    renderPage();
    const link = await screen.findByTestId("defect-detail-link-defect-1");
    expect(link).toHaveAttribute("href", "/maintenance/defects/defect-1");
  });

  it("shows empty state when queue is empty", async () => {
    listMaintenanceDvirDefects.mockResolvedValue({ defects: [] });
    renderPage();
    expect(await screen.findByText(/No DVIR defects/)).toBeInTheDocument();
  });
});
