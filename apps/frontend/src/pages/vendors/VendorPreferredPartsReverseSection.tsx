import { useQuery } from "@tanstack/react-query";
import { listMaintenanceParts } from "../../api/maintenance";
import { DataPanel } from "../../components/layout/DataPanel";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";

type Props = { operatingCompanyId: string; vendorId: string };

/** @matrix-built modules=vendors,inventory,maintenance cols=vendor,connectivity,reverse_link */
export function VendorPreferredPartsReverseSection({ operatingCompanyId, vendorId }: Props) {
  const query = useQuery({
    queryKey: ["vendor-preferred-parts", operatingCompanyId, vendorId],
    queryFn: () => listMaintenanceParts(operatingCompanyId, { vendor_id: vendorId }),
    enabled: Boolean(operatingCompanyId && vendorId),
  });
  const rows = query.data?.rows ?? [];

  return (
    <DataPanel title="Preferred Parts">
      {query.isError ? (
        <ListErrorBanner
          message={userFacingApiError(query.error, "Couldn't load preferred parts for this vendor")}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading preferred parts…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-500">No inventory parts use this preferred vendor.</p>
      ) : (
        <div className="space-y-1" data-testid="vendor-preferred-parts-reverse">
          {rows.map((part) => (
            <div key={part.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 px-2 py-1.5 text-xs">
              <EntityLink kind="inventory_part" id={part.id} label={entityLabel(part.name, part.id, "Part")} className="font-semibold" />
              <span className="text-gray-600">
                {part.part_number || "No SKU"} · on hand {part.qty_on_hand}
              </span>
            </div>
          ))}
        </div>
      )}
    </DataPanel>
  );
}
