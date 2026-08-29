import { useQuery } from "@tanstack/react-query";
import { AR_AP_AGING_UI_FLAG, getApAgingBills } from "../../api/arApAging";
import { companyToday } from "../../lib/businessDate";
import { DataPanel } from "../../components/layout/DataPanel";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

type Props = {
  operatingCompanyId: string;
  vendorId: string;
};

// Reverse drill-through (finance module Wave B): AR aging already surfaces live data inline on
// CustomerDetail.tsx; the AP side had no equivalent on VendorDetail.tsx at all, even though the
// real, dedicated per-vendor endpoint (getApAgingBills, FIN-20) already exists and is already
// consumed by finance/ArApAgingPage.tsx's own drill panel. Gated behind the same
// AR_AP_AGING_UI_ENABLED flag that page already respects.
export function VendorApAgingSection({ operatingCompanyId, vendorId }: Props) {
  const { enabled, loading: flagLoading } = useFeatureFlag(AR_AP_AGING_UI_FLAG, operatingCompanyId || undefined);
  const asOfDate = companyToday();

  const query = useQuery({
    queryKey: ["vendor-ap-aging", operatingCompanyId, vendorId, asOfDate],
    queryFn: () => getApAgingBills(operatingCompanyId, vendorId, asOfDate),
    enabled: Boolean(operatingCompanyId && vendorId && enabled),
  });

  if (flagLoading || !enabled) return null;

  const bills = (query.data?.bills ?? []).filter((b) => b.open_cents > 0);

  return (
    <DataPanel title="AP aging (open bills)">
      {query.isError ? (
        <ListErrorBanner
          message={userFacingApiError(query.error, "Couldn't load open bills for this vendor")}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading open bills…</p>
      ) : bills.length === 0 ? (
        <p className="text-xs text-gray-500">No open bills for this vendor.</p>
      ) : (
        <div className="space-y-1" data-testid="vendor-ap-aging-reverse">
          {bills.map((bill) => (
            <div key={bill.bill_id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 px-2 py-1.5 text-xs">
              <span className="flex items-center gap-2">
                <EntityLink kind="bill" id={bill.bill_id} label={visibleDocumentLabel(bill.bill_number, bill.bill_id, "Bill")} className="font-semibold text-slate-700 hover:underline" />
                {/* VENDOR-PROFILE-AP-AGING-NO-GL-JE-LINK — drill to the bill's posted JE when one
                    exists (nullable: an open/unpaid bill may not be posted yet). */}
                {bill.journal_entry_id ? (
                  <EntityLink
                    kind="journal_entry"
                    id={bill.journal_entry_id}
                    label={entityLabel(bill.journal_entry_memo, bill.journal_entry_id, "Journal entry")}
                    className="text-slate-500 hover:underline"
                  />
                ) : null}
              </span>
              <span className="flex items-center gap-1 text-gray-600">
                <span>due {formatDateUS(bill.due_date)}</span>
                {bill.days_overdue > 0 ? <span className="font-medium text-rose-700">· {bill.days_overdue}d overdue</span> : null}
                <span>· {formatUsdCents(bill.open_cents)} open</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </DataPanel>
  );
}
