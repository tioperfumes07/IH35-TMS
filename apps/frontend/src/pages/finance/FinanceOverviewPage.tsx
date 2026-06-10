import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";

export function FinanceOverviewPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Finance Overview" />
      <FinanceModuleTabs />
      <div className="rounded border border-gray-200 bg-white p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Finance Overview</h3>
          <p className="mt-2 text-sm text-gray-500">
            Financial projections overview. Future module for financial planning.
          </p>
        </div>
      </div>
    </div>
  );
}
