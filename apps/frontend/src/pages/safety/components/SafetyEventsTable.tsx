import { useMemo } from "react";
import { formatDateUS } from "../../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useToast } from "../../../components/Toast";
import { entityLabel } from "../../../lib/entity-label";
import { companyToday } from "../../../lib/businessDate";

type SafetyEventRow = Record<string, unknown>;

type Props = {
  rows: Array<SafetyEventRow>;
  onOpenAccident: (row: SafetyEventRow) => void;
  loading?: boolean;
};

function typePill(type: string) {
  if (type.includes("accident") || type.includes("hos")) return "bg-red-100 text-red-700";
  if (type.includes("speed") || type.includes("brake")) return "bg-slate-100 text-slate-700";
  if (type.includes("training")) return "bg-slate-100 text-slate-700";
  if (type.includes("drug")) return "bg-slate-100 text-slate-700";
  return "bg-gray-100 text-gray-700";
}

function severityPill(severity: string) {
  if (severity.toLowerCase() === "critical") return "bg-red-100 text-red-700";
  if (severity.toLowerCase() === "major") return "bg-slate-100 text-slate-700";
  return "bg-gray-100 text-gray-700";
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportSelectedCsv(selected: SafetyEventRow[], pushToast: (message: string, kind: "success" | "info" | "error") => void) {
  const cols: Array<[string, (row: SafetyEventRow) => string]> = [
    ["Date", (row) => formatDateUS(row.event_at)],
    ["Driver", (row) => entityLabel(row.driver_full_name, String(row.driver_id ?? ""), "Driver")],
    ["Unit", (row) => entityLabel(row.unit_display_id, String(row.unit_id ?? ""), "Unit")],
    ["Type", (row) => String(row.event_type ?? "")],
    ["Severity", (row) => String(row.severity ?? "minor")],
    ["Source", (row) => String(row.source ?? "system")],
    ["Status", (row) => String(row.status ?? "open")],
  ];
  const header = cols.map(([label]) => csvEscape(label)).join(",");
  const body = selected.map((row) => cols.map(([, get]) => csvEscape(get(row))).join(",")).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `safety-events-${companyToday()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  pushToast(`Exported ${selected.length} safety event${selected.length === 1 ? "" : "s"}.`, "success");
}

export function SafetyEventsTable({ rows, onOpenAccident, loading }: Props) {
  const { pushToast } = useToast();

  const columns: Array<ParityColumn<SafetyEventRow>> = useMemo(
    () => [
      { key: "event_at", label: "Date", sortable: true, render: (row) => formatDateUS(row.event_at) },
      {
        key: "driver_full_name",
        label: "Driver",
        sortable: true,
        render: (row) => {
          const id = String(row.driver_id ?? "").trim();
          const label = entityLabel(row.driver_full_name, id, "Driver");
          if (!id) return label;
          return <EntityLink kind="driver" id={id} label={label} />;
        },
      },
      {
        key: "unit_display_id",
        label: "Unit",
        render: (row) => {
          const id = String(row.unit_id ?? "").trim();
          const label = entityLabel(row.unit_display_id, id, "Unit");
          if (!id) return label;
          return <EntityLink kind="unit" id={id} label={label} />;
        },
      },
      {
        key: "event_type",
        label: "Type",
        sortable: true,
        render: (row) => {
          const type = String(row.event_type ?? "");
          return <span className={`rounded-full px-2 py-0.5 ${typePill(type.toLowerCase())}`}>{type || "event"}</span>;
        },
      },
      {
        key: "severity",
        label: "Severity",
        sortable: true,
        render: (row) => {
          const severity = String(row.severity ?? "minor");
          return <span className={`rounded-full px-2 py-0.5 ${severityPill(severity)}`}>{severity}</span>;
        },
      },
      { key: "source", label: "Source", render: (row) => String(row.source ?? "system") },
      {
        key: "action",
        label: "Action",
        render: (row) => {
          const type = String(row.event_type ?? "");
          return (
            <button type="button" className="text-slate-700 underline" onClick={() => onOpenAccident(row)}>
              {type.toLowerCase().includes("accident") ? "Open accident" : "View"}
            </button>
          );
        },
      },
      { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "open") },
    ],
    [onOpenAccident],
  );

  return (
    <ParityTable<SafetyEventRow>
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row.id)}
      loading={loading}
      emptyText="No safety events found."
      storageKey="safety-events"
      exportFilename="safety-events"
      tableTestId="safety-events-table"
      selectable
      maxSelectable={200}
      onSelectionCapExceeded={() => pushToast("Selection cap of 200 rows reached.", "error")}
      batchActions={(selected) => (
        <>
          <button
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            onClick={() => {
              if (selected.length === 0) {
                pushToast("Select at least one event to export.", "info");
                return;
              }
              exportSelectedCsv(selected, pushToast);
            }}
          >
            Export Selected
          </button>
          <button
            type="button"
            disabled
            title="Bulk archive is not available yet — no backend endpoint."
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            onClick={() => pushToast("Bulk archive is not available yet — no backend endpoint.", "info")}
          >
            Archive
          </button>
        </>
      )}
    />
  );
}
