import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../shared/EntityLink";
import { getMaintenanceTireLayout } from "../../api/maintenance";
import { ListErrorState } from "../ListErrorState";

export function UnitTireProgramReverseSection({ operatingCompanyId, unitId }: { operatingCompanyId: string; unitId: string }) {
  const query = useQuery({
    queryKey: ["maintenance", "reverse", "tire-program", operatingCompanyId, unitId],
    queryFn: () => getMaintenanceTireLayout(operatingCompanyId, { unit_id: unitId }),
    enabled: Boolean(operatingCompanyId && unitId),
  });
  const mounted = (query.data?.positions ?? []).filter((position) => position.record);
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="unit-tire-program-reverse">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Mounted Tires{mounted.length ? ` (${mounted.length})` : ""}</h3>
        <EntityLink kind="tire_program_unit" id={unitId} label="Open Tire Program" className="text-xs font-semibold text-slate-700 underline" />
      </div>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading mounted tires…</p> : null}
      {query.isError ? <ListErrorState status={0} message="Could not load mounted tires for this unit." onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError && mounted.length === 0 ? <p className="text-sm text-gray-500">No tire records mounted to this unit.</p> : null}
      {mounted.length ? <ul className="grid gap-2 md:grid-cols-2">{mounted.map((position) => {
        const record = position.record!;
        return (
          <li key={position.code} className="rounded-sm border border-gray-200 p-2 text-xs text-slate-700">
            <span className="font-semibold">{position.label}</span>
            <span> · {record.brand_name || "Unknown brand"}</span>
            <div className="text-gray-500">SN {record.serial_number || "—"} · {record.tread_depth_32nds}/32 tread</div>
          </li>
        );
      })}</ul> : null}
    </section>
  );
}
