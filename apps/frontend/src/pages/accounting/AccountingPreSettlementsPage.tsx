import { useQuery } from "@tanstack/react-query";
import { listSettlements } from "../../api/driverFinance";
import { PreSettlementsPanel } from "../../components/driver-finance/PreSettlementsPanel";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNav } from "./AccountingSubNav";

export function AccountingPreSettlementsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const preSettlementsQuery = useQuery({
    queryKey: ["accounting", "pre-settlements", companyId],
    queryFn: () => listSettlements(companyId),
    enabled: Boolean(companyId),
  });
  const rows = (preSettlementsQuery.data?.settlements ?? []).filter((settlement) =>
    ["presettle", "acked", "locked"].includes(String(settlement.status))
  );

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader title="Pre-settlements" subtitle="Driver pre-settlement queue" />
      <PreSettlementsPanel rows={rows} loading={preSettlementsQuery.isLoading} />
    </div>
  );
}
