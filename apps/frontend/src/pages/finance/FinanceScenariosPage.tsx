import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";

// FIN-S06: this surface has no data model, no backend endpoint, and no operating_company_id
// query — it is a placeholder for a feature that has not been built. The static blurb below used
// to read like a working feature's description; it now says plainly that scenario planning is not
// available yet, which is the honest state for a route with nothing to fetch or scope.
export function FinanceScenariosPage() {
  return (
    <div className="space-y-4" data-testid="finance-scenarios-page">
      <PageHeader title="Scenarios" />
      <FinanceModuleTabs />
      <div className="rounded-sm border border-gray-200 bg-white p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Scenario Planning</h3>
          <p className="mt-2 text-sm text-gray-500" data-testid="finance-scenarios-not-available">
            Scenario planning and what-if analysis is not available yet. There is no working feature behind this
            tab today.
          </p>
        </div>
      </div>
    </div>
  );
}
