import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listWorkOrdersFiltered } from "../../api/maintenance";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  operatingCompanyId: string;
  driverId: string;
  "data-testid"?: string;
};

/**
 * DRV-LINK-WO-REVERSE — driver → maintenance.work_orders reverse drill.
 * List API accepts driver_id (same caller-controlled scope as load_id).
 */
export function DriverWorkOrdersReverseSection({
  operatingCompanyId,
  driverId,
  "data-testid": testId = "driver-work-orders-reverse-section",
}: Props) {
  const enabled = Boolean(operatingCompanyId) && Boolean(driverId);
  const q = useQuery({
    queryKey: ["maintenance-work-orders", "reverse-driver", operatingCompanyId, driverId],
    queryFn: () => listWorkOrdersFiltered(operatingCompanyId, { driver_id: driverId }),
    enabled,
  });

  const rows = q.data?.work_orders ?? [];

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Work orders</h3>
        <Link className="text-xs font-semibold text-slate-700 underline" to="/maintenance/active-wos">
          Open Maintenance
        </Link>
      </div>
      <p className="text-sm text-gray-600">Repair / tire / accident work orders linked to this driver.</p>

      {q.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {q.isError ? (
        <ListErrorState
          title="Couldn't load work orders"
          status={0}
          message={(q.error as Error)?.message}
          onRetry={() => void q.refetch()}
        />
      ) : null}
      {!q.isLoading && !q.isError && rows.length === 0 ? (
        <p className="text-sm text-gray-500">No work orders linked to this driver.</p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((wo) => {
            const id = String(wo.id ?? "");
            const label = entityLabel(wo.display_id ?? wo.description, id, "Work order");
            return (
              <li key={id} className="flex flex-wrap items-center gap-2 text-sm">
                <EntityLink kind="work_order" id={id} label={label} />
                {wo.unit_id ? (
                  <EntityLink
                    kind="unit"
                    id={String(wo.unit_id)}
                    label={entityLabel(wo.unit_number, wo.unit_id, "Unit")}
                  />
                ) : null}
                {wo.load_id ? (
                  <EntityLink kind="load" id={String(wo.load_id)} label={entityLabel(null, wo.load_id, "Load")} />
                ) : null}
                <span className="text-xs text-slate-500">{String(wo.status ?? "")}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
