/**
 * OpenPreSettlementsPanel — E11-D4 (Lead ruling, Round 86/"FINISH ALL 13" packet, 2026-09-23):
 * "pre-settlement is a first-class board state, its own column; 6 of 9 have no load assigned =
 * a NAMED GAP never blank."
 *
 * Dispatch's existing "Pre-Settlements" tab (PreSettlementsPanel.tsx, subTab === "pre_settlements"
 * in Dispatch.tsx) already exists as a first-class tab, but it filters to
 * status IN ('presettle','acked','locked') -- payment-ready settlements. The broader,
 * EARLIER-stage cohort the ruling means (measured live: 10 open pre-settlements, 7 with no load
 * linked yet -- a driver's tour has started accumulating deductions/escrow before any load has
 * been bookended to it) is a DIFFERENT status ('open') and was never rendered anywhere on
 * Dispatch at all -- not wrong, not blank, simply absent. This panel is that missing state,
 * sourced from the SAME read model DispatchBoard.tsx's own per-row annotation already uses
 * (GET /api/v1/driver-finance/pre-settlements/open-by-driver, built for exactly this board per
 * its own "M.3 ... so Dispatch can show it as its own board column" comment) — reused here as a
 * genuine board section instead of only a per-load annotation.
 */
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { DataPanel } from "../layout/DataPanel";
import { DataTable, type DataTableColumn } from "../DataTable";
import { colors } from "../../design/tokens";
import { formatUsd } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import type { OpenPreSettlement } from "../../api/driverFinance";

/** The load range for one open pre-settlement. Renders a NAMED gap, never a bare dash, when the
 *  driver's tour has accumulated pay/deductions but no load has been bookended to it yet -- the
 *  exact "6 of 9 have no load assigned" state the ruling names. */
function renderLoadRange(row: OpenPreSettlement) {
  if (!row.first_load_id) {
    return (
      <span className="text-xs italic text-slate-600" data-testid="open-pre-settlement-no-load">
        No load assigned yet
      </span>
    );
  }
  const first = <EntityLink kind="load" id={row.first_load_id} label={entityLabel(row.first_load_number, row.first_load_id, "Load")} />;
  if (!row.last_load_id || row.last_load_id === row.first_load_id) return first;
  return (
    <span className="flex items-center gap-1">
      {first}
      <span aria-hidden="true">→</span>
      <EntityLink kind="load" id={row.last_load_id} label={entityLabel(row.last_load_number, row.last_load_id, "Load")} />
    </span>
  );
}

const columns: DataTableColumn<OpenPreSettlement>[] = [
  {
    key: "driver",
    label: "Driver",
    sortable: true,
    sortValue: (row) => row.driver_name ?? "",
    render: (row) => <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name ?? undefined} noun="Driver" />,
  },
  {
    key: "settlement_number",
    label: "Settlement",
    sortable: true,
    sortValue: (row) => row.settlement_number ?? "",
    render: (row) =>
      row.settlement_number ? (
        <EntityLink kind="settlement" id={row.settlement_id} label={entityLabel(row.settlement_number, row.settlement_id, "Settlement")} />
      ) : (
        "—"
      ),
  },
  {
    key: "loads",
    label: "Load(s)",
    sortable: true,
    sortValue: (row) => row.first_load_number ?? "",
    render: renderLoadRange,
  },
  {
    key: "trip_started_at",
    label: "Tour started",
    sortable: true,
    sortValue: (row) => row.trip_started_at ?? "",
    render: (row) => (row.trip_started_at ? formatDateUS(row.trip_started_at) : "—"),
  },
  {
    key: "gross_pay",
    label: "Gross",
    sortable: true,
    sortValue: (row) => Number(row.gross_pay ?? 0),
    className: "text-right tabular-nums",
    render: (row) => formatUsd(Number(row.gross_pay ?? 0)),
  },
  {
    key: "deductions_total",
    label: "Deductions",
    sortable: true,
    sortValue: (row) => Number(row.deductions_total ?? 0),
    className: "text-right tabular-nums",
    render: (row) => formatUsd(Number(row.deductions_total ?? 0)),
  },
  {
    key: "net_pay",
    label: "Net (running)",
    sortable: true,
    sortValue: (row) => Number(row.net_pay ?? 0),
    className: "text-right tabular-nums",
    render: (row) => formatUsd(Number(row.net_pay ?? 0)),
  },
];

type Props = {
  rows: OpenPreSettlement[];
  loading?: boolean;
  isError?: boolean;
};

export function OpenPreSettlementsPanel({ rows, loading = false, isError = false }: Props) {
  const noLoadCount = rows.filter((r) => !r.first_load_id).length;
  return (
    <DataPanel
      title={`Open — accumulating · ${loading || isError ? "—" : rows.length} tour(s)${!loading && !isError && noLoadCount > 0 ? ` (${noLoadCount} with no load assigned yet)` : ""}`}
      accentColor={colors.accounting.strong}
    >
      {loading ? <p className="px-2 py-2 text-xs text-gray-500">Loading open pre-settlements…</p> : null}
      {!loading && isError ? (
        <p className="px-2 py-2 text-xs text-red-700" data-testid="open-pre-settlements-error">
          Couldn&apos;t load open pre-settlements. Try refreshing the page.
        </p>
      ) : null}
      {!loading && !isError && rows.length > 0 ? (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.settlement_id} rowTestId={() => "open-pre-settlement-row"} hidePager />
      ) : null}
      {!loading && !isError && rows.length === 0 ? (
        <p className="px-2 py-2 text-xs text-gray-500" data-testid="dispatch-open-pre-settlements-honest-empty">
          No driver currently has an open (accumulating) pre-settlement.
        </p>
      ) : null}
    </DataPanel>
  );
}
