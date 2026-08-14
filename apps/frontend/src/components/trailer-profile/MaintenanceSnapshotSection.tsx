import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

export function MaintenanceSnapshotSection({ maintenance }: { maintenance: Record<string, unknown> }) {
  const workOrders = (Array.isArray(maintenance.work_orders) ? maintenance.work_orders : []) as Array<
    Record<string, unknown>
  >;
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Maintenance snapshot</h2>
      <p className="mt-2 text-xs text-gray-700">Open work orders: {String(maintenance.open_wo_count ?? 0)}</p>
      {workOrders.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {workOrders.map((wo) => (
            <li key={String(wo.wo_id)} className="text-xs">
              <EntityLink
                kind="work_order"
                id={String(wo.wo_id)}
                label={entityLabel(wo.display_id, wo.wo_id, "Work order")}
                className="text-slate-700 hover:underline"
                data-testid="trailer-maint-snapshot-wo-link"
              />
              <span className="text-gray-500"> · {String(wo.status ?? "open")}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-gray-700">
        Next PM: {String((maintenance.next_pm_due as { label?: string })?.label ?? "—")}
      </p>
      <p className="text-xs text-gray-700">
        Last service: {String((maintenance.last_service as { date?: string })?.date ?? "—")}
      </p>
    </section>
  );
}
