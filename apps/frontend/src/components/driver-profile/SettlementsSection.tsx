import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";

function cents(n: unknown) {
  const v = Number(n ?? 0);
  return `$${(v / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type WeekRow = {
  settlement_id: string;
  settlement_display_id: string | null;
  period_start: string;
  week_ending: string;
  gross: unknown;
  net: unknown;
};

// P30 reverse nav — the "Full settlements" link at the top only opens a driver-filtered LIST; it does
// not let a viewer click straight from one of these 4 weekly rows to the SPECIFIC settlement it
// summarizes. That per-row hop was structurally impossible before this change: the backend query
// (driver-aggregate.service.ts last_4_weeks CTE) never selected driver_settlements.id, so there was no
// id here to link to. Fixed at the root (added settlement_id to the SQL), not by inventing a client-side
// workaround.
//
// COL-06: the link also used week_ending (the period END date) as its own label, so there was no
// explicit Settlement # anywhere in this row, and no Period Begin column — added display_id + period_start
// to the same CTE (driver-aggregate.service.ts) and use the real settlement number as the link label.
const WEEK_COLUMNS: Array<ParityColumn<WeekRow>> = [
  {
    key: "settlement_display_id",
    label: "Settlement #",
    sortable: true,
    render: (row) =>
      row.settlement_id ? (
        <EntityLink
          kind="settlement"
          id={row.settlement_id}
          label={entityLabel(row.settlement_display_id, row.settlement_id, "Settlement")}
        />
      ) : (
        "—"
      ),
  },
  {
    key: "period_start",
    label: "Period Begin",
    sortable: true,
    render: (row) => (row.period_start ? formatDateUS(row.period_start) : "—"),
  },
  {
    key: "week_ending",
    label: "Period End",
    sortable: true,
    render: (row) => String(row.week_ending || "—"),
  },
  {
    key: "gross",
    label: "Gross",
    sortable: true,
    sortValue: (row) => Number(row.gross ?? 0),
    render: (row) => cents(row.gross),
  },
  {
    key: "net",
    label: "Net",
    sortable: true,
    sortValue: (row) => Number(row.net ?? 0),
    render: (row) => cents(row.net),
  },
];

export function SettlementsSection({
  settlements,
  driverId,
  autoPayEnabled = false,
  autoPaySaving = false,
  onAutoPayChange,
}: {
  settlements: Record<string, unknown>;
  driverId: string;
  autoPayEnabled?: boolean;
  autoPaySaving?: boolean;
  onAutoPayChange?: (enabled: boolean) => void;
}) {
  const weeks = useMemo((): WeekRow[] => {
    const raw = (settlements.last_4_weeks as Array<Record<string, unknown>>) ?? [];
    return raw.map((w) => ({
      settlement_id: w.settlement_id ? String(w.settlement_id) : "",
      settlement_display_id: w.settlement_display_id ? String(w.settlement_display_id) : null,
      period_start: String(w.period_start ?? ""),
      week_ending: String(w.week_ending ?? ""),
      gross: w.gross,
      net: w.net,
    }));
  }, [settlements.last_4_weeks]);

  const columns = useMemo(() => WEEK_COLUMNS, []);

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Settlements</h2>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={autoPayEnabled} disabled={!onAutoPayChange || autoPaySaving} onChange={(e) => onAutoPayChange?.(e.target.checked)} />
          Auto-pay on payday
        </label>
        <Link to={`/driver-finance/settlements?driver_id=${driverId}`} className="text-xs text-slate-700 underline">
          Full settlements
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-sm border border-gray-100 p-2">
          <div className="text-[10px] uppercase text-gray-500">YTD gross</div>
          <div className="font-semibold">{cents(settlements.ytd_gross)}</div>
        </div>
        <div className="rounded-sm border border-gray-100 p-2">
          <div className="text-[10px] uppercase text-gray-500">YTD deductions</div>
          <div className="font-semibold">{cents(settlements.ytd_deductions)}</div>
        </div>
        <div className="rounded-sm border border-gray-100 p-2">
          <div className="text-[10px] uppercase text-gray-500">YTD net</div>
          <div className="font-semibold">{cents(settlements.ytd_net)}</div>
        </div>
        <div className="rounded-sm border border-gray-100 p-2">
          <div className="text-[10px] uppercase text-gray-500">Lifetime net</div>
          <div className="font-semibold">{cents(settlements.lifetime_with_company)}</div>
        </div>
      </div>
      <div className="mt-3">
        <ParityTable
          storageKey="driver-profile-settlements-weeks"
          tableTestId="driver-settlements-weeks"
          columns={columns}
          rows={weeks}
          rowKey={(row) => row.settlement_id || row.week_ending || "empty"}
          emptyText="No recent settlements."
          initialPageSize={10}
          pageSizeOptions={[5, 10, 20]}
        />
      </div>
    </section>
  );
}
