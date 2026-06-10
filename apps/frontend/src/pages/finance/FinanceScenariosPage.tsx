import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";

export function FinanceScenariosPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Scenarios" />
      <FinanceModuleTabs />
      <div className="rounded border border-gray-200 bg-white p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Scenario Planning</h3>
          <p className="mt-2 text-sm text-gray-500">
            Scenario planning and what-if analysis for financial decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
