// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LoadDetail } from "../../api/loads";
import "../../design/design-tokens.css";
import { LoadDetailDrawer } from "./LoadDetailDrawer";

expect.extend(jestDomMatchers);

const mockUseDispatchLoad = vi.fn();
const mockUseLoad = vi.fn();
const mockUseLoadAudit = vi.fn();

vi.mock("../../api/loads", () => ({
  useDispatchLoad: (...args: unknown[]) => mockUseDispatchLoad(...args),
  useLoad: (...args: unknown[]) => mockUseLoad(...args),
  useLoadAudit: (...args: unknown[]) => mockUseLoadAudit(...args),
  updateLoad: vi.fn(),
}));

vi.mock("../../api/accounting", () => ({
  createInvoiceFromLoad: vi.fn(),
  listInvoices: vi.fn(),
}));

vi.mock("../../api/dispatch", () => ({
  cancelDispatchLoad: vi.fn(),
  distributeLoadInstructions: vi.fn(),
  getDispatchAssignmentHistory: vi.fn(),
  getRecentAutoStatusSwitches: vi.fn(),
}));

vi.mock("../../api/docs", () => ({
  listFiles: vi.fn(),
}));

vi.mock("../Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("./CancelLoadModal", () => ({
  CancelLoadModal: () => null,
}));

vi.mock("./LoadDetailDriverPayTab", () => ({
  LoadDetailDriverPayTab: () => null,
}));

vi.mock("./LoadDetailSettlementTab", () => ({
  LoadDetailSettlementTab: () => null,
}));

vi.mock("./LoadDetailGeofenceTimelineTab", () => ({
  LoadDetailGeofenceTimelineTab: () => null,
}));

vi.mock("../audit/EntityAuditHistoryTab", () => ({
  EntityAuditHistoryTab: () => null,
}));

vi.mock("../../pages/dispatch/LoadReassignModal", () => ({
  LoadReassignModal: () => null,
}));

vi.mock("../../pages/dispatch/MultiStopEditor", () => ({
  MultiStopEditor: () => null,
}));

vi.mock("../../pages/dispatch/LoadTemplateLibrary", () => ({
  LoadTemplateLibrary: () => null,
  SaveLoadTemplateModal: () => null,
  templateJsonFromLoadDetail: vi.fn(),
}));

vi.mock("../../pages/loads/AbandonmentReportModal", () => ({
  AbandonmentReportModal: () => null,
}));

vi.mock("./PreSettlementPanel", () => ({
  PreSettlementPanel: () => null,
}));

vi.mock("./drawer-tabs/CustomsTab", () => ({
  CustomsTab: () => null,
}));

vi.mock("./tabs/FactoringTab", () => ({
  FactoringTab: () => null,
}));

vi.mock("./tabs/FinesDeductionsCard", () => ({
  FinesDeductionsCard: () => null,
}));

vi.mock("./tabs/SettlementProfitabilityCard", () => ({
  SettlementProfitabilityCard: () => null,
}));

vi.mock("../../pages/dispatch/components/BookLoadModalV4", () => ({
  BookLoadModalV4: () => null,
}));

vi.mock("../../pages/dispatch/cargo-sensors/CargoSensorTimeline", () => ({
  CargoSensorTimeline: () => null,
}));

vi.mock("../documents/DocumentsTab", () => ({
  DocumentsTab: () => null,
}));

vi.mock("../insurance/InsuranceClaimsReverseSection", () => ({
  InsuranceClaimsReverseSection: () => null,
}));

function mockLoadDetail(overrides: Partial<LoadDetail> = {}): LoadDetail {
  return {
    id: "load-1",
    operating_company_id: "co-1",
    load_number: "L-100",
    customer_id: "cust-1",
    customer_name: "ACME",
    status: "booked",
    rate_total_cents: 10000,
    currency_code: "USD",
    assigned_unit_id: null,
    assigned_unit_number: null,
    assigned_primary_driver_id: null,
    assigned_primary_driver_name: null,
    assigned_secondary_driver_id: null,
    dispatcher_user_id: "u-1",
    notes: null,
    first_pickup_city: "Austin",
    first_delivery_city: "Dallas",
    flag_code: "GRAY",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    soft_deleted_at: null,
    deleted_by_user_id: null,
    stops: [],
    ...overrides,
  };
}

function renderDrawer(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function footerPrimaryAction() {
  const footer = screen.getByRole("complementary").querySelector("footer");
  expect(footer).toBeTruthy();
  return within(footer as HTMLElement).getAllByRole("button")[0];
}

describe("LoadDetailDrawer footer cancel vs close (d-02)", () => {
  it("shows plain Close (not danger Cancel Load) when load is not persisted yet", () => {
    mockUseDispatchLoad.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseLoad.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseLoadAudit.mockReturnValue({ data: [], refetch: vi.fn() });

    renderDrawer(
      <LoadDetailDrawer
        loadId="draft-load-id"
        isOpen
        canEdit
        operatingCompanyId="co-1"
        onClose={vi.fn()}
      />,
    );

    const primary = footerPrimaryAction();
    expect(primary).toHaveTextContent("Close");
    expect(primary.className).toMatch(/border-gray-300/);
    expect(screen.queryByRole("button", { name: "Cancel Load" })).not.toBeInTheDocument();
  });

  it("shows danger Cancel Load for a persisted, non-cancelled load", () => {
    mockUseDispatchLoad.mockReturnValue({
      data: mockLoadDetail(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseLoad.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseLoadAudit.mockReturnValue({ data: [], refetch: vi.fn() });

    renderDrawer(
      <LoadDetailDrawer
        loadId="load-1"
        isOpen
        canEdit
        operatingCompanyId="co-1"
        onClose={vi.fn()}
      />,
    );

    const primary = footerPrimaryAction();
    expect(primary).toHaveTextContent("Cancel Load");
    expect(primary.className).toMatch(/border-crit/);
  });
});
