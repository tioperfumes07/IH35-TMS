import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../shared/EntityLink";
import { listMaintenanceTireRecords } from "../../api/maintenance";
import { DataPanel } from "../layout/DataPanel";
import { ListErrorBanner } from "../shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = { operatingCompanyId: string; equipmentId: string };

/** @matrix-built modules=fleet,maintenance cols=trailer,connectivity,reverse_link,picker_law */
export function TrailerTiresReverseSection({ operatingCompanyId, equipmentId }: Props) {
  const query = useQuery({
    queryKey: ["trailer-tires-reverse", operatingCompanyId, equipmentId],
    queryFn: () => listMaintenanceTireRecords(operatingCompanyId, { equipment_id: equipmentId }),
    enabled: Boolean(operatingCompanyId && equipmentId),
  });
  const rows = query.isError ? [] : query.data?.rows ?? [];
  return (
    <DataPanel title="Tires">
      <div className="mb-2 flex justify-end">
        <EntityLink kind="tire_program_equipment" id={equipmentId} label="Open tire program" className="text-xs font-semibold text-slate-700 underline" />
      </div>
      {query.isError ? (
        <ListErrorBanner message={userFacingApiError(query.error, "Couldn't load trailer tires")} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading tires…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-500">No active tires are linked to this trailer.</p>
      ) : (
        <div className="space-y-1" data-testid="trailer-tires-reverse">
          {rows.map((row) => (
            <EntityLink
              key={row.id}
              kind="tire_program_equipment"
              id={equipmentId}
              className="flex justify-between rounded-sm border border-gray-200 px-2 py-1.5 text-xs hover:bg-gray-50"
              label={
                <>
                  <span className="font-semibold text-slate-700">{row.position_label || row.position_code}</span>
                  <span className="text-gray-600">{row.brand_name || "Unknown brand"} · {row.tread_depth_32nds}/32</span>
                </>
              }
            />
          ))}
        </div>
      )}
    </DataPanel>
  );
}
