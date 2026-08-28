import { Link } from "react-router-dom";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { Button } from "../Button";

const OPEN_WO_STATUSES = new Set(["open", "in_progress", "awaiting_parts", "awaiting_approval", "scheduled"]);

export function MaintenanceSnapshotSection({
  openWoCount,
  nextPmDue,
  lastService,
  unitId,
  activeFaultCount = 0,
  pendingFaultDraftCount = 0,
  workOrders = [],
}: {
  openWoCount: { in_house: number; external: number; roadside: number; total: number };
  nextPmDue: Record<string, unknown>;
  lastService: Record<string, unknown> | null;
  unitId: string;
  activeFaultCount?: number;
  pendingFaultDraftCount?: number;
  /** Complete canonical open-WO range for this unit (wo_id · display_id · status). */
  workOrders?: Array<Record<string, unknown>>;
}) {
  const pmEntries = Object.entries(nextPmDue ?? {}).slice(0, 4);
  const openWorkOrders = workOrders.filter((wo) =>
    OPEN_WO_STATUSES.has(String(wo.status ?? "").toLowerCase()),
  );
  return (
    <section id="asset-maintenance" className="scroll-mt-4 rounded-sm border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Maintenance snapshot</h3>
      <p className="mt-1 text-xs text-gray-600">
        Open WOs: in-house {openWoCount.in_house} · external {openWoCount.external} · roadside {openWoCount.roadside} (
        {openWoCount.total} total)
      </p>
      {openWorkOrders.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {openWorkOrders.map((wo) => (
            <li key={String(wo.wo_id)} className="text-xs">
              <EntityLinkOrTombstone
                kind="work_order"
                id={String(wo.wo_id)}
                name={wo.display_id}
                noun="Work order"
                className="text-slate-700 hover:underline"
                data-testid="vehicle-maint-snapshot-wo-link"
              />
              <span className="text-gray-500"> · {String(wo.status ?? "open")}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {activeFaultCount > 0 || pendingFaultDraftCount > 0 ? (
        <p className="mt-1 text-xs text-amber-800">
          {activeFaultCount} active fault code{activeFaultCount === 1 ? "" : "s"}
          {pendingFaultDraftCount > 0
            ? ` — ${pendingFaultDraftCount} auto-WO draft${pendingFaultDraftCount === 1 ? "" : "s"} pending review`
            : ""}
          {" · "}
          <EntityLink kind="fault_drafts_unit" id={unitId} label="View fault history" className="underline" />
        </p>
      ) : null}
      <Link to="/maintenance" className="text-xs text-slate-700 underline">
        Open maintenance console
      </Link>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        {pmEntries.length === 0 ? (
          <p className="text-xs text-gray-500">No PM due alerts.</p>
        ) : (
          pmEntries.map(([key, val]) => {
            const row = val as Record<string, unknown>;
            return (
              <div key={key} className="rounded-sm border border-gray-100 p-2 text-xs">
                <div className="font-semibold capitalize">{key.replace(/_/g, " ")}</div>
                <div>Miles remaining: {String(row.miles_remaining ?? "—")}</div>
                <div>Due est: {String(row.due_date_est ?? "—")}</div>
              </div>
            );
          })
        )}
      </div>
      {lastService ? (
        <p className="mt-2 text-xs text-gray-600" data-testid="vp-maint-snapshot-last-service">
          Last service:{" "}
          {lastService.wo_id ? (
            <EntityLinkOrTombstone
              kind="work_order"
              id={String(lastService.wo_id)}
              name={lastService.display_id}
              noun="Work order"
              className="text-slate-700 hover:underline"
              data-testid="vp-maint-snapshot-last-service-wo-link"
            />
          ) : (
            String(lastService.date ?? "—")
          )}{" "}
          · ${String(lastService.cost ?? "—")} ·{" "}
          {lastService.vendor_id ? (
            <EntityLinkOrTombstone
              kind="vendor"
              id={String(lastService.vendor_id)}
              name={lastService.vendor}
              noun="Vendor"
              className="text-slate-700 hover:underline"
              data-testid="vp-maint-snapshot-last-service-vendor-link"
            />
          ) : (
            String(lastService.vendor ?? "—")
          )}
        </p>
      ) : null}
      <Link to={`/maintenance/work-orders/new?unit_id=${encodeURIComponent(unitId)}`}>
        <Button size="sm" variant="secondary" className="mt-2">
          Create work order
        </Button>
      </Link>
    </section>
  );
}
