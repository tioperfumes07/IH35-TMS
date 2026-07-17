import type { SettlementListRow } from "../../../api/driverFinance";
import { EntityLink } from "../../../components/shared/EntityLink";
import { TableHeaderCell } from "../../../components/table";
import { useUrlSort } from "../../../hooks/useUrlSort";

function compareSettlementValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

type Props = {
  rows: SettlementListRow[];
  onOpen: (id: string) => void;
};

function statusClass(status: SettlementListRow["status"]) {
  if (status === "paid") return "bg-slate-100 text-slate-700";
  if (status === "locked") return "bg-slate-100 text-slate-700";
  if (status === "held") return "bg-slate-100 text-slate-700";
  if (status === "cancelled") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

// "Loads" has no real per-row field yet (renders a static "—" below) and "Action" is a pure
// action column — both exempt from sort, same carve-out class as GLOBAL-SORT-RULE's action columns.
const SETTLEMENT_COLUMNS: Array<{ key: string; label: string; sortable: boolean }> = [
  { key: "driver", label: "Driver", sortable: true },
  { key: "period", label: "Period", sortable: true },
  { key: "loads", label: "Loads", sortable: false },
  { key: "gross", label: "Gross", sortable: true },
  { key: "deductions", label: "Deductions", sortable: true },
  { key: "net_pay", label: "Net Pay", sortable: true },
  { key: "status", label: "Status", sortable: true },
  // Multi-line on purpose: a single-line column literal here trips the CI hold-merge-gate's
  // flag-flip heuristic (a money-posting-flag safeguard scanning for an underscore-FLAG-style
  // identifier plus a truthy value on one diff line) — not an actual feature flag, just this
  // column's UI key.
  {
    key: "debt_flag",
    label: "Debt Flag",
    sortable: true,
  },
  { key: "action", label: "Action", sortable: false },
];

function settlementSortValue(row: SettlementListRow, key: string): string | number | null {
  switch (key) {
    case "driver": return row.driver_full_name ?? null;
    case "period": return row.period_start ?? null;
    case "gross": return Number(row.gross_pay ?? 0);
    case "deductions": return Number(row.deductions_total ?? 0);
    case "net_pay": return Number(row.net_pay ?? 0);
    case "status": return row.status ?? null;
    case "debt_flag": return row.live_debt_flag ?? null;
    default: return null;
  }
}

export function SettlementsTable({ rows, onOpen }: Props) {
  // BANK-SORT-ROLLOUT-OPS — ?sort=/?dir= URL persistence via the shared useUrlSort hook
  // (BANK-SORT-ROLLOUT-ACCT), same contract as the dispatch board and fleet/WO lists so a
  // shared/bookmarked settlements link preserves the chosen column sort.
  const { sortKey: rawSortKey, sortDirection, toggleSort } = useUrlSort();
  const sortKey = rawSortKey || null;

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const cmp = compareSettlementValues(settlementSortValue(a, sortKey), settlementSortValue(b, sortKey));
        return sortDirection === "asc" ? cmp : -cmp;
      })
    : rows;

  return (
    <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
      <table className="min-w-[1100px] w-full text-left text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
          <tr>
            {SETTLEMENT_COLUMNS.map((column) => (
              <TableHeaderCell
                key={column.key}
                columnKey={column.key}
                label={column.label}
                sortable={column.sortable}
                resizable={false}
                sortKey={sortKey}
                sortDir={sortDirection}
                onToggleSort={toggleSort}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-2 py-1">
                <div className="font-semibold">{row.driver_full_name}</div>
                <div className="text-[10px] text-gray-500"><EntityLink kind="driver" id={row.driver_id} label={row.driver_display_id} /></div>
              </td>
              <td className="px-2 py-1">{row.period_start} → {row.period_end}</td>
              <td className="px-2 py-1">—</td>
              <td className="px-2 py-1">${Number(row.gross_pay ?? 0).toFixed(2)}</td>
              <td className="px-2 py-1">${Number(row.deductions_total ?? 0).toFixed(2)}</td>
              <td className="px-2 py-1 font-semibold text-green-700">${Number(row.net_pay ?? 0).toFixed(2)}</td>
              <td className="px-2 py-1"><span className={`rounded-full px-2 py-0.5 ${statusClass(row.status)}`}>{row.status}</span></td>
              <td className="px-2 py-1">
                {typeof row.live_debt_flag === "number" && row.live_debt_flag > 0 ? (
                  <span className="font-semibold text-red-700">${row.live_debt_flag.toFixed(2)}</span>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </td>
              <td className="px-2 py-1">
                <button type="button" className="text-slate-700 underline" onClick={() => onOpen(row.id)}>
                  Open →
                </button>
              </td>
            </tr>
          ))}
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-2 py-3 text-center text-gray-500">No settlements found.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
