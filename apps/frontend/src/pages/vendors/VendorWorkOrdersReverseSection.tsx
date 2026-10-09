import { useQuery } from "@tanstack/react-query";
import { listWorkOrdersFiltered } from "../../api/maintenance";
import { DataPanel } from "../../components/layout/DataPanel";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatDateUS } from "../../lib/formatDate";

type Props = {
  operatingCompanyId: string;
  vendorId: string;
};

export function VendorWorkOrdersReverseSection({ operatingCompanyId, vendorId }: Props) {
  const query = useQuery({
    queryKey: ["vendor-work-orders", operatingCompanyId, vendorId],
    queryFn: () => listWorkOrdersFiltered(operatingCompanyId, { vendor_id: vendorId }),
    enabled: Boolean(operatingCompanyId && vendorId),
  });

  return (
    // ROUND 297 audit: the server's total_count (the list is one 50-row page), not the page's length.
    <DataPanel title={query.data?.total_count ? `Work Orders · ${query.data.total_count}` : "Work Orders"}>
      {query.isError ? (
        <ListErrorBanner
          message={userFacingApiError(query.error, "Couldn't load vendor work orders")}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading work orders…</p>
      ) : (query.data?.work_orders?.length ?? 0) === 0 ? (
        <p className="text-xs text-gray-500">No work orders are linked to this vendor.</p>
      ) : (
        <div className="space-y-1" data-testid="vendor-work-orders-reverse">
          {query.data?.work_orders?.map((workOrder) => (
            <div key={workOrder.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 px-2 py-1.5 text-xs">
              <EntityLinkOrTombstone
                kind="work_order"
                id={workOrder.id}
                name={workOrder.display_id}
                noun="Work order"
                className="font-semibold text-[#1F2A44] hover:underline"
                data-testid="vendor-work-order-reverse-link"
              />
              <span className="flex items-center gap-1 text-gray-600">
                <EntityLinkOrTombstone
                  kind="unit"
                  id={workOrder.unit_id}
                  name={workOrder.unit_number}
                  noun="Unit"
                />
                <span>· {[workOrder.status, formatDateUS(workOrder.opened_at)].filter(Boolean).join(" · ")}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </DataPanel>
  );
}
