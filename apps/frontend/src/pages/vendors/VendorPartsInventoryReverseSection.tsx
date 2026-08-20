import { useQuery } from "@tanstack/react-query";
import { listPartsInventory } from "../../api/maintenance";
import { DataPanel } from "../../components/layout/DataPanel";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";

export function VendorPartsInventoryReverseSection({ operatingCompanyId, vendorId }: { operatingCompanyId: string; vendorId: string }) {
  const query = useQuery({
    queryKey: ["vendor-parts-inventory", operatingCompanyId, vendorId],
    queryFn: () => listPartsInventory(operatingCompanyId, { vendor_id: vendorId }),
    enabled: Boolean(operatingCompanyId && vendorId),
  });
  const rows = query.data ?? [];
  return (
    <DataPanel title="Purchased Parts Inventory">
      {query.isError ? <ListErrorBanner message={userFacingApiError(query.error, "Couldn't load purchased inventory for this vendor")} onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="text-xs text-gray-500">Loading purchased inventory…</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-xs text-gray-500">No parts inventory purchases from this vendor.</p> : null}
      {rows.length > 0 ? (
        <div className="space-y-1" data-testid="vendor-parts-inventory-reverse">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 px-2 py-1.5 text-xs">
              <EntityLinkOrTombstone kind="parts_inventory" id={row.id} name={row.part_description} noun="Part" className="font-semibold" />
              <span className="text-gray-600">{row.part_number || "No part #"} · on hand {row.on_hand_qty}</span>
            </div>
          ))}
        </div>
      ) : null}
    </DataPanel>
  );
}
