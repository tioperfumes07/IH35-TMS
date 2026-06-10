import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";

export function FinanceProjectionsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Projections" />
      <FinanceModuleTabs />
      <div className="rounded border border-gray-200 bg-white p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Financial Projections</h3>
          <p className="mt-2 text-sm text-gray-500">
            Financial projections and forecasting tools.
          </p>
        </div>
      </div>
    </div>
  );
}
