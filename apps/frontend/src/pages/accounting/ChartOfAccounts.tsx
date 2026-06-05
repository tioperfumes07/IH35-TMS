import { useState } from "react";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ChartOfAccountsListPage } from "../lists/accounting/ChartOfAccountsListPage";
import { ChartOfAccountsSyncPanel } from "./ChartOfAccountsSyncPanel";

/**
 * Chart of Accounts with QBO sync status panel (QBO-SYNC-1).
 * Wraps the lists catalog page and surfaces pull/reconcile controls.
 */
export function ChartOfAccounts() {
  const [driftOnly, setDriftOnly] = useState(false);
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  if (!operatingCompanyId) {
    return <p className="text-sm text-muted-foreground">Select an operating company to view Chart of Accounts sync.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ChartOfAccountsSyncPanel
        operatingCompanyId={operatingCompanyId}
        onDriftFilterToggle={setDriftOnly}
      />
      {driftOnly && (
        <p className="text-sm text-amber-800">
          Showing drift filter active — reconcile or sync to heal unmatched CoA rows.
        </p>
      )}
      <ChartOfAccountsListPage />
    </div>
  );
}

export default ChartOfAccounts;
