import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountRoleBindingsListPage } from "../pages/lists/accounting/AccountRoleBindingsListPage";
import { ChartOfAccountsListPage } from "../pages/lists/accounting/ChartOfAccountsListPage";
import { ClassesListPage } from "../pages/lists/accounting/ClassesListPage";
import { ItemsListPage } from "../pages/lists/accounting/ItemsListPage";
import { JournalEntryTypesListPage } from "../pages/lists/accounting/JournalEntryTypesListPage";
import { PaymentTermsListPage } from "../pages/lists/accounting/PaymentTermsListPage";
import { PostingTemplatesListPage } from "../pages/lists/accounting/PostingTemplatesListPage";
import { QboCategoriesListPage } from "../pages/lists/accounting/QboCategoriesListPage";
import { AdditionalChargesListPage } from "../pages/lists/dispatch/AdditionalChargesListPage";
import { DetentionReasonsListPage } from "../pages/lists/dispatch/DetentionReasonsListPage";
import { LoadTypesListPage } from "../pages/lists/dispatch/LoadTypesListPage";
import { PickupTimeTypesListPage } from "../pages/lists/dispatch/PickupTimeTypesListPage";
import { DriverDeductionTypesListPage } from "../pages/lists/driver/DriverDeductionTypesListPage";
import { DriverPayTypesListPage } from "../pages/lists/driver/DriverPayTypesListPage";
import { EscrowTypesListPage } from "../pages/lists/driver/EscrowTypesListPage";
import { PayRateTemplatesListPage } from "../pages/lists/driver/PayRateTemplatesListPage";
import { ConditionCodesListPage } from "../pages/lists/fleet/ConditionCodesListPage";
import { EquipmentTypesListPage } from "../pages/lists/fleet/EquipmentTypesListPage";
import { OwnershipTypesListPage } from "../pages/lists/fleet/OwnershipTypesListPage";
import { TirePositionsListPage } from "../pages/lists/fleet/TirePositionsListPage";
import { TractorStatusesListPage } from "../pages/lists/fleet/TractorStatusesListPage";
import { TrailerStatusesListPage } from "../pages/lists/fleet/TrailerStatusesListPage";
import { ExpensiveStatesListPage } from "../pages/lists/fuel/ExpensiveStatesListPage";
import { FuelCardTypesListPage } from "../pages/lists/fuel/FuelCardTypesListPage";
import { FuelExceptionTypesListPage } from "../pages/lists/fuel/FuelExceptionTypesListPage";
import { FuelStationBrandsListPage } from "../pages/lists/fuel/FuelStationBrandsListPage";
import { FuelStopReasonCodesListPage } from "../pages/lists/fuel/FuelStopReasonCodesListPage";
import { FuelTaxJurisdictionsListPage } from "../pages/lists/fuel/FuelTaxJurisdictionsListPage";
import { MpgBandsListPage } from "../pages/lists/fuel/MpgBandsListPage";
import { MaintenanceFailureCodesListPage } from "../pages/lists/maintenance/MaintenanceFailureCodesListPage";
import { MaintenanceLaborCodesListPage } from "../pages/lists/maintenance/MaintenanceLaborCodesListPage";
import { MaintenancePartsListPage } from "../pages/lists/maintenance/MaintenancePartsListPage";
import { MaintenancePriorityLevelsListPage } from "../pages/lists/maintenance/MaintenancePriorityLevelsListPage";
import { MaintenanceServiceTasksListPage } from "../pages/lists/maintenance/MaintenanceServiceTasksListPage";
import { MaintenanceShopLocationsListPage } from "../pages/lists/maintenance/MaintenanceShopLocationsListPage";
import { MaintenanceVendorsListPage } from "../pages/lists/maintenance/MaintenanceVendorsListPage";
import { WorkOrderStatusesListPage } from "../pages/lists/maintenance/WorkOrderStatusesListPage";
import { CivilFineTypesListPage } from "../pages/lists/safety/CivilFineTypesListPage";
import { CompanyViolationTypesListPage } from "../pages/lists/safety/CompanyViolationTypesListPage";
import { InternalFineReasonsListPage } from "../pages/lists/safety/InternalFineReasonsListPage";

vi.mock("../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: null,
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

function row(path: string, element: ReactElement, heading: RegExp) {
  return { path, element, heading };
}

const LIST_ROUTES = [
  row("/lists/dispatch/load-types", <LoadTypesListPage />, /load types/i),
  row("/lists/dispatch/detention-reasons", <DetentionReasonsListPage />, /detention reasons/i),
  row("/lists/dispatch/pickup-time-types", <PickupTimeTypesListPage />, /pickup time types/i),
  row("/lists/dispatch/additional-charges", <AdditionalChargesListPage />, /additional charges/i),
  row("/lists/driver/pay-rate-templates", <PayRateTemplatesListPage />, /pay rate templates/i),
  row("/lists/driver/deduction-types", <DriverDeductionTypesListPage />, /driver deduction types/i),
  row("/lists/driver/pay-types", <DriverPayTypesListPage />, /driver pay types/i),
  row("/lists/driver/escrow-types", <EscrowTypesListPage />, /escrow types/i),
  row("/lists/maintenance/failure-codes", <MaintenanceFailureCodesListPage />, /maintenance failure codes/i),
  row("/lists/maintenance/labor-codes", <MaintenanceLaborCodesListPage />, /maintenance labor codes/i),
  row("/lists/maintenance/parts", <MaintenancePartsListPage />, /maintenance parts/i),
  row("/lists/maintenance/priority-levels", <MaintenancePriorityLevelsListPage />, /maintenance priority levels/i),
  row("/lists/maintenance/service-tasks", <MaintenanceServiceTasksListPage />, /maintenance service tasks/i),
  row("/lists/maintenance/shop-locations", <MaintenanceShopLocationsListPage />, /maintenance shop locations/i),
  row("/lists/maintenance/vendors", <MaintenanceVendorsListPage />, /maintenance vendors/i),
  row("/lists/maintenance/work-order-statuses", <WorkOrderStatusesListPage />, /work order statuses/i),
  row("/lists/fuel/card-types", <FuelCardTypesListPage />, /fuel card types/i),
  row("/lists/fuel/exception-types", <FuelExceptionTypesListPage />, /fuel exception types/i),
  row("/lists/fuel/station-brands", <FuelStationBrandsListPage />, /fuel station brands/i),
  row("/lists/fuel/stop-reason-codes", <FuelStopReasonCodesListPage />, /fuel stop reason codes/i),
  row("/lists/fuel/mpg-bands", <MpgBandsListPage />, /mpg bands/i),
  row("/lists/fuel/expensive-states", <ExpensiveStatesListPage />, /expensive states/i),
  row("/lists/fuel/tax-jurisdictions", <FuelTaxJurisdictionsListPage />, /fuel tax jurisdictions/i),
  row("/lists/fleet/tractor-statuses", <TractorStatusesListPage />, /tractor statuses/i),
  row("/lists/fleet/trailer-statuses", <TrailerStatusesListPage />, /trailer statuses/i),
  row("/lists/fleet/condition-codes", <ConditionCodesListPage />, /condition codes/i),
  row("/lists/fleet/equipment-types", <EquipmentTypesListPage />, /^equipment types$/i),
  row("/lists/fleet/tire-positions", <TirePositionsListPage />, /tire positions/i),
  row("/lists/fleet/ownership-types", <OwnershipTypesListPage />, /ownership types/i),
  row("/lists/accounting/chart-of-accounts", <ChartOfAccountsListPage />, /chart of accounts/i),
  row("/lists/accounting/classes", <ClassesListPage />, /^classes$/i),
  row("/lists/accounting/payment-terms", <PaymentTermsListPage />, /payment terms/i),
  row("/lists/accounting/posting-templates", <PostingTemplatesListPage />, /posting templates/i),
  row("/lists/accounting/journal-entry-types", <JournalEntryTypesListPage />, /journal entry types/i),
  row("/lists/accounting/qbo-categories", <QboCategoriesListPage />, /qbo categories/i),
  row("/lists/accounting/items", <ItemsListPage />, /^items$/i),
  row("/lists/accounting/account-role-bindings", <AccountRoleBindingsListPage />, /account role bindings/i),
  row("/lists/safety/internal-fine-reasons", <InternalFineReasonsListPage />, /internal fine reasons/i),
  row("/lists/safety/civil-fine-types", <CivilFineTypesListPage />, /civil fine types/i),
  row("/lists/safety/company-violation-types", <CompanyViolationTypesListPage />, /company violation types/i),
];

describe("lists catalog routing smoke", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it.each(LIST_ROUTES)("renders heading for $path", async ({ path, element, heading }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={path} element={element} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
