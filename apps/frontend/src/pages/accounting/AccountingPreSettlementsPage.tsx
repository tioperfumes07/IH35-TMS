import { useQuery } from "@tanstack/react-query";
import { listSettlements } from "../../api/driverFinance";
import { PreSettlementsPanel } from "../../components/driver-finance/PreSettlementsPanel";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

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
    <AccountingSubNavWrapper title="Pre-settlements" subtitle="Driver pre-settlement queue">
      <PreSettlementsPanel rows={rows} loading={preSettlementsQuery.isLoading} />
    </AccountingSubNavWrapper>
  );
}
