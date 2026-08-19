import { useQuery } from "@tanstack/react-query";
import { listWorkOrdersFiltered } from "../../api/maintenance";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

/**
 * LOAD-WO-REVERSE — the load↔work-order link existed in the database and appeared on no screen.
 *
 * `maintenance.work_orders.load_id` has always been written, and G18 makes it mandatory for every
 * diesel/roadside expense, so the forward direction was never in doubt. The reverse was: the
 * dispatch drawer rendered Insurance Claims and "Safety records on this load", and NOTHING for
 * maintenance — `LoadDetailDrawer` did not contain the string "work order" at all. Live prove on
 * prod: load L-20260808-0085 carries TWO work orders (WO-T120-RS-08-08-2026-0001-PEND0 and -0002)
 * whose `load_id` points at it, and the drawer showed neither. §10a: a link is done only when it
 * drills BOTH ways.
 *
 * Filtered server-side. A load-scoped read deliberately includes CLOSED work orders — a completed
 * repair is part of that trip's history, and the list's open-only default would hide precisely what
 * this block exists to show.
 */

type Props = {
  operatingCompanyId: string;
  loadId: string;
  "data-testid"?: string;
};

export function LoadWorkOrdersReverseSection({
  operatingCompanyId,
  loadId,
  "data-testid": testId = "load-detail-work-orders",
}: Props) {
  const query = useQuery({
    queryKey: [
      "maintenance",
      "reverse",
      "work-orders",
      "load",
      operatingCompanyId,
      loadId,
    ],
    queryFn: () =>
      listWorkOrdersFiltered(operatingCompanyId, { load_id: loadId }),
    enabled: Boolean(operatingCompanyId) && Boolean(loadId),
  });
  const rows = query.data?.work_orders ?? [];

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="text-xs font-semibold text-gray-600">
        Maintenance on this load
      </div>

      <div
        className="space-y-2 rounded-sm border border-gray-200 bg-white p-3"
        data-testid="load-reverse-work-orders"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Work Orders
            {rows.length > 0 ? (
              <span className="ml-2 text-xs font-normal text-gray-600">
                ({rows.length})
              </span>
            ) : null}
          </h3>
          <EntityLink
            kind="active_wos_load"
            id={loadId}
            label="Open Work Orders"
            className="text-xs font-semibold text-slate-700 underline"
          />
        </div>
        {query.isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : null}
        {query.isError ? (
          <p className="text-sm text-red-600">
            Could not load work orders for this load.
          </p>
        ) : null}
        {!query.isLoading && !query.isError && rows.length === 0 ? (
          <p className="text-sm text-gray-500">
            No work orders linked to this load.
          </p>
        ) : null}
        {rows.length > 0 ? (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="text-sm text-slate-700"
                data-testid={`load-work-order-${row.id}`}
              >
                {/* The WO display_id is the human label (WO-{UNIT}-{TYPE}-{DATE}-{NNNN}-{V5}); fall
                    back to a short id only when a row genuinely has none, never to the raw uuid. */}
                <EntityLinkOrTombstone
                  kind="work_order"
                  id={row.id}
                  name={row.display_id || null}
                  noun="Work order"
                />
                <span className="ml-2 inline-flex flex-wrap items-center gap-1 text-xs text-gray-500">
                  {row.opened_at
                    ? formatDateUS(String(row.opened_at).slice(0, 10))
                    : "—"}
                  {` · ${row.status}`}
                  {row.unit_id ? (
                    <>
                      <span>·</span>
                      <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number ?? null} noun="Unit" />
                    </>
                  ) : null}
                  {row.description ? ` · ${row.description}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
