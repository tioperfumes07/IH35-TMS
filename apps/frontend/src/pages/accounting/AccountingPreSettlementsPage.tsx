import { useQuery } from "@tanstack/react-query";
import { listSettlements } from "../../api/driverFinance";
import { PreSettlementsPanel } from "../../components/driver-finance/PreSettlementsPanel";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";

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
      {/* 0243-g8-5: surface a retryable error instead of an indefinitely-empty panel on load failure. */}
      {preSettlementsQuery.isError ? <ListErrorBanner onRetry={() => void preSettlementsQuery.refetch()} /> : null}
      <PreSettlementsPanel rows={rows} loading={preSettlementsQuery.isLoading} />
    </AccountingSubNavWrapper>
  );
}
