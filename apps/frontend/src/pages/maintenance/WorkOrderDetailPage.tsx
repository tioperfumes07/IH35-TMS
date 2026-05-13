import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getWorkOrder } from "../../api/maintenance";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

/**
 * Pilot drill-in page for invariant #21 (shared PageHeader + breadcrumb).
 * WO body is minimal shell; full drawer fields ship in follow-up.
 */
export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["maintenance", "work-order-detail", id, companyId],
    queryFn: () => getWorkOrder(id!, companyId),
    enabled: Boolean(id && companyId),
  });

  const wo = query.data as Record<string, unknown> | undefined;
  const woNumber = String(wo?.display_id ?? id?.slice(0, 8) ?? "—");

  if (!id) {
    return <div className="p-4 text-sm text-red-600">Missing work order id.</div>;
  }

  if (query.isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading work order…</div>;
  }

  if (query.isError) {
    return <div className="p-4 text-sm text-red-600">Failed to load work order.</div>;
  }

  if (!wo) {
    return <div className="p-4 text-sm text-gray-600">Work order not found.</div>;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={`Work Order ${woNumber}`}
        backHref="/maintenance"
        breadcrumb={[
          { label: "Maintenance", href: "/maintenance" },
          { label: "Work Orders", href: "/maintenance/work-orders" },
          { label: woNumber },
        ]}
      />
      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <p>Status: {String(wo.status ?? "—")}</p>
        <p>Source type: {String(wo.source_type ?? "—")}</p>
        <p>Unit: {String(wo.unit_id ?? "—")}</p>
      </div>
    </div>
  );
}
