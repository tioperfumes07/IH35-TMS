import { useToast } from "../../components/Toast";
import { useBulkPermission } from "../../hooks/useBulkPermission";
import { ParityTable } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { companyToday } from "../../lib/businessDate";

export type FuelTransactionRow = {
  id: string;
  transaction_date: string;
  driver_name: string;
  gallons: number | null;
  amount_cents: number;
  station: string;
  // FINAL-WEEKEND-FULL-WIRING-2026-08-12 rank 6 (CC-2) — the backend (getFuelTransactions) already
  // returns these drill-through ids; the table just never rendered them. Optional so any narrower
  // caller keeps compiling, but the one real caller (FuelPlannerHome) always has them.
  driver_id?: string | null;
  unit_id?: string | null;
  unit_number?: string | null;
  load_id?: string | null;
  load_number?: string | null;
  trailer_id?: string | null;
  trailer_number?: string | null;
};

type Props = {
  rows: FuelTransactionRow[];
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Real client-side CSV export of the fuel-transaction rows in scope (QA-sweep: was a fake success toast).
function exportFuelTransactionsCsv(rows: FuelTransactionRow[]): void {
  const header = ["Date", "Driver", "Station", "Gallons", "Amount (USD)"].map(csvEscape).join(",");
  const body = rows
    .map((row) =>
      [
        row.transaction_date,
        row.driver_name,
        row.station,
        row.gallons == null ? "" : row.gallons.toFixed(2),
        ((row.amount_cents || 0) / 100).toFixed(2),
      ]
        .map((v) => csvEscape(String(v)))
        .join(",")
    )
    .join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fuel-transactions-${companyToday()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function FuelTransactionsTable({ rows }: Props) {
  const { pushToast } = useToast();
  // Same role gate the old BulkSelectableTable wrapper enforced (BULK_WRITE_ROLES via
  // useBulkPermission) — preserved here so bulk selection/actions stay hidden for roles that
  // couldn't see them before.
  const bulkPermission = useBulkPermission();

  return (
    <ParityTable
      rows={rows}
      rowKey={(row) => row.id}
      storageKey="fuel-transactions"
      emptyText="No fuel transactions."
      selectable={bulkPermission.canUseBulkOps}
      batchActions={() => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            onClick={() => {
              if (rows.length === 0) {
                pushToast("No fuel transactions to export.", "info");
                return;
              }
              exportFuelTransactionsCsv(rows);
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled
            title="Bulk categorize is not available yet."
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            onClick={() => pushToast("Bulk categorize is not available yet.", "info")}
          >
            Categorize
          </button>
        </div>
      )}
      columns={[
        {
          key: "transaction_date",
          label: "Date",
          sortable: true,
          render: (row) => formatDateUS(row.transaction_date) || "—",
        },
        {
          key: "driver_name",
          label: "Driver",
          sortable: true,
          render: (row) =>
            row.driver_id ? (
              <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
            ) : (
              row.driver_name || "—"
            ),
        },
        {
          key: "unit_number",
          label: "Unit",
          sortable: true,
          render: (row) =>
            row.unit_id ? (
              <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number ?? null, row.unit_id, "Unit")} />
            ) : (
              row.unit_number || "—"
            ),
        },
        {
          key: "load_number",
          label: "Load",
          sortable: true,
          render: (row) =>
            row.load_id ? (
              <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number ?? null, row.load_id, "Load")} />
            ) : (
              "—"
            ),
        },
        {
          key: "trailer_number",
          label: "Trailer",
          sortable: true,
          render: (row) =>
            row.trailer_id ? (
              <EntityLink
                kind="trailer"
                id={row.trailer_id}
                label={entityLabel(row.trailer_number ?? null, row.trailer_id, "Trailer")}
              />
            ) : (
              "—"
            ),
        },
        { key: "station", label: "Station", sortable: true },
        { key: "gallons", label: "Gallons", sortable: true, render: (row) => row.gallons == null ? "—" : row.gallons.toFixed(2) },
        { key: "amount_cents", label: "Amount", sortable: true, render: (row) => money(row.amount_cents) },
      ]}
    />
  );
}
