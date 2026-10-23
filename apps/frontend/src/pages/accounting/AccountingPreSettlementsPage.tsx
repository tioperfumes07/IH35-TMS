import { useQuery } from "@tanstack/react-query";
import { listTours } from "../../api/tourReadout";
import { PreSettlementsPanel } from "../../components/driver-finance/PreSettlementsPanel";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";

/** ROUND 443.280-A — open tours so Unit / Ready / Waiting on are live (not settlement-list dashes). */
export function AccountingPreSettlementsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const preSettlementsQuery = useQuery({
    queryKey: ["accounting", "pre-settlements-tours", companyId],
    queryFn: () => listTours(companyId, "open"),
    enabled: Boolean(companyId),
  });

  return (
    <AccountingSubNavWrapper title="Pre-settlements" subtitle="Driver pre-settlement queue">
      {/* 0243-g8-5: surface a retryable error instead of an indefinitely-empty panel on load failure. */}
      {preSettlementsQuery.isError ? <ListErrorBanner onRetry={() => void preSettlementsQuery.refetch()} /> : null}
      <PreSettlementsPanel
        rows={preSettlementsQuery.data?.rows ?? []}
        loading={preSettlementsQuery.isLoading}
        isError={preSettlementsQuery.isError}
      />
    </AccountingSubNavWrapper>
  );
}
