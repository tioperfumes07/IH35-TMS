import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { InspectionsPage } from "../inspections/InspectionsPage";

const listMaintenanceInspections = vi.fn();
const createMaintenanceInspection = vi.fn();
const updateMaintenanceInspection = vi.fn();
const archiveMaintenanceInspection = vi.fn();
const attachMaintenanceInspectionPhoto = vi.fn();
const listUnits = vi.fn();
const getSafetyDvirSubmissions = vi.fn();
const requestUploadUrl = vi.fn();
const confirmUpload = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  listMaintenanceInspections: (...args: unknown[]) => listMaintenanceInspections(...args),
  createMaintenanceInspection: (...args: unknown[]) => createMaintenanceInspection(...args),
  updateMaintenanceInspection: (...args: unknown[]) => updateMaintenanceInspection(...args),
  archiveMaintenanceInspection: (...args: unknown[]) => archiveMaintenanceInspection(...args),
  attachMaintenanceInspectionPhoto: (...args: unknown[]) => attachMaintenanceInspectionPhoto(...args),
}));

vi.mock("../../../api/mdata", () => ({
  listUnits: (...args: unknown[]) => listUnits(...args),
}));

vi.mock("../../../api/safety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/safety")>();
  return {
    ...actual,
    getSafetyDvirSubmissions: (...args: unknown[]) => getSafetyDvirSubmissions(...args),
  };
});

vi.mock("../../../api/docs", () => ({
  requestUploadUrl: (...args: unknown[]) => requestUploadUrl(...args),
  confirmUpload: (...args: unknown[]) => confirmUpload(...args),
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
        <InspectionsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Maintenance InspectionsPage (B30)", () => {
  beforeEach(() => {
    listMaintenanceInspections.mockReset();
    createMaintenanceInspection.mockReset();
    updateMaintenanceInspection.mockReset();
    archiveMaintenanceInspection.mockReset();
    attachMaintenanceInspectionPhoto.mockReset();
    listUnits.mockReset();
    getSafetyDvirSubmissions.mockReset();
    requestUploadUrl.mockReset();
    confirmUpload.mockReset();

    listMaintenanceInspections.mockResolvedValue({
      rows: [
        {
          id: "insp-1",
          unit_id: "unit-1",
          unit_number: "T-101",
          inspection_type: "annual_dot",
          inspection_type_label: "Annual DOT",
          status: "completed",
          inspection_date: "2026-06-04",
          inspector_name: "Alex",
          outcome: "pass",
          dvir_submission_id: null,
          photo_count: 0,
        },
      ],
    });
    listUnits.mockResolvedValue({ units: [{ id: "unit-1", unit_number: "T-101" }] });
    getSafetyDvirSubmissions.mockResolvedValue({
      submissions: [{ id: "dvir-1", type: "pre_trip", submitted_at: "2026-06-04T08:00:00Z" }],
    });
  });

  it("renders inspections list with CRUD shell", async () => {
    renderPage();
    expect(await screen.findByTestId("maint-inspections-page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create Inspection" })).toBeInTheDocument();
    expect(await screen.findByText("Annual DOT")).toBeInTheDocument();
  });

  it("opens create inspection modal", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "+ Create Inspection" }));
    expect(await screen.findByText("Photo upload (docs module)")).toBeInTheDocument();
    expect(screen.getByLabelText("Close Create Inspection")).toBeInTheDocument();
  });

  it("shows DVIR linkage when pre-trip type selected", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "+ Create Inspection" }));
    await user.selectOptions(screen.getByDisplayValue("Annual DOT"), "pre_trip");
    expect(await screen.findByText("Link DVIR submission")).toBeInTheDocument();
  });
});
