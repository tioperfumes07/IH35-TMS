import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listMaintenanceVendors } from "../../api/maintenance";
import { DataPanel } from "../../components/layout/DataPanel";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";

export function VendorMaintenanceCatalogReverseSection({ operatingCompanyId, vendorId }: { operatingCompanyId: string; vendorId: string }) {
  const query = useQuery({
    queryKey: ["vendor-maintenance-catalog", operatingCompanyId, vendorId],
    queryFn: () => listMaintenanceVendors(operatingCompanyId, { mdata_vendor_id: vendorId, include_archived: true }),
    enabled: Boolean(operatingCompanyId && vendorId),
  });
  const rows = query.data?.rows ?? [];
  return (
    <DataPanel title="Maintenance Vendor Catalog">
      {query.isError ? <ListErrorBanner message={userFacingApiError(query.error, "Couldn't load linked maintenance vendors")} onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="text-xs text-gray-500">Loading maintenance vendor links…</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-xs text-gray-500">No maintenance vendor catalog records link to this AP vendor.</p> : null}
      {rows.length > 0 ? (
        <div className="space-y-1" data-testid="vendor-maintenance-catalog-reverse">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 px-2 py-1.5 text-xs">
              <Link className="font-semibold text-slate-700 underline" to={`/maintenance/vendors?maintenance_vendor_id=${encodeURIComponent(row.id)}`}>
                {entityLabel(row.display_name, row.id, "Maintenance vendor")}
              </Link>
              <span className="text-gray-600">{row.code || "No code"} · {row.is_active ? "Active" : "Archived"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </DataPanel>
  );
}
