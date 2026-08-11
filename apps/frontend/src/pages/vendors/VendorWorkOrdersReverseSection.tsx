import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listWorkOrdersFiltered } from "../../api/maintenance";
import { DataPanel } from "../../components/layout/DataPanel";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";

type Props = {
  operatingCompanyId: string;
  vendorId: string;
};

export function VendorWorkOrdersReverseSection({ operatingCompanyId, vendorId }: Props) {
  const query = useQuery({
    queryKey: ["vendor-work-orders", operatingCompanyId, vendorId],
    queryFn: () => listWorkOrdersFiltered(operatingCompanyId, { external_vendor_id: vendorId }),
    enabled: Boolean(operatingCompanyId && vendorId),
  });

  return (
    <DataPanel title="Work Orders">
      {query.isError ? (
        <ListErrorBanner
          message={userFacingApiError(query.error, "Couldn't load vendor work orders")}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading work orders…</p>
      ) : (query.data?.work_orders.length ?? 0) === 0 ? (
        <p className="text-xs text-gray-500">No work orders are linked to this vendor.</p>
      ) : (
        <div className="space-y-1" data-testid="vendor-work-orders-reverse">
          {query.data?.work_orders.map((workOrder) => (
            <div key={workOrder.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 px-2 py-1.5 text-xs">
              <Link className="font-semibold text-slate-700 hover:underline" to={`/maintenance/work-orders/${workOrder.id}`}>
                {entityLabel(workOrder.display_id, workOrder.id, "Work order")}
              </Link>
              <span className="text-gray-600">
                {[workOrder.unit_number, workOrder.status, formatDateUS(workOrder.opened_at)].filter(Boolean).join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </DataPanel>
  );
}
