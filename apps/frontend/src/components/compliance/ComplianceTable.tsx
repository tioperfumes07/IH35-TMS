import { Link } from "react-router-dom";
import type { ComplianceCredential } from "../../api/compliance";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLink, type EntityKind } from "../shared/EntityLink";

type Props = {
  rows: ComplianceCredential[];
  typeFilter: string;
  ownerTypeFilter: string;
  onTypeFilter: (value: string) => void;
  onOwnerTypeFilter: (value: string) => void;
  onExportCsv: () => void;
};

const severityClass: Record<string, string> = {
  red: "text-red-700",
  yellow: "text-slate-700",
  green: "text-slate-700",
};

function ownerNoun(ownerType: string): string {
  switch (ownerType) {
    case "driver":
      return "Driver";
    case "unit":
    case "unit_plate":
      return "Unit";
    case "equipment":
    case "equipment_plate":
      return "Trailer";
    default:
      return "Owner";
  }
}

function ownerEntityKind(ownerType: string): EntityKind | null {
  switch (ownerType) {
    case "driver":
      return "driver";
    case "unit":
    case "unit_plate":
      return "unit";
    case "equipment":
    case "equipment_plate":
      return "trailer";
    default:
      return null;
  }
}

const COLUMNS: Array<ParityColumn<ComplianceCredential>> = [
  {
    key: "label",
    label: "Type",
    sortable: true,
    render: (row) => row.label,
  },
  {
    key: "owner_type",
    label: "Owner",
    sortable: true,
  },
  {
    key: "owner_name",
    label: "Name",
    sortable: true,
    render: (row) => {
      const kind = ownerEntityKind(row.owner_type);
      const label = entityLabel(row.owner_name, row.owner_id, ownerNoun(row.owner_type));
      if (!kind || !row.owner_id) return label;
      return <EntityLink kind={kind} id={row.owner_id} label={label} />;
    },
  },
  {
    key: "expiration_date",
    label: "Expiration",
    sortable: true,
    sortValue: (row) => row.expiration_date ?? "",
    render: (row) => formatDateUS(row.expiration_date) || "—",
  },
  {
    key: "days_until_expiration",
    label: "Days",
    sortable: true,
    sortValue: (row) => row.days_until_expiration ?? Number.POSITIVE_INFINITY,
    render: (row) => row.days_until_expiration ?? "—",
  },
  {
    key: "severity",
    label: "Severity",
    sortable: true,
    render: (row) => (
      <span className={`font-medium ${severityClass[row.severity] ?? ""}`}>{row.severity}</span>
    ),
  },
  {
    key: "action_link",
    label: "Action",
    sortable: false,
    render: (row) => (
      <Link className="text-slate-700 underline" to={row.action_link}>
        Open
      </Link>
    ),
  },
];

export function ComplianceTable({
  rows,
  typeFilter,
  ownerTypeFilter,
  onTypeFilter,
  onOwnerTypeFilter,
  onExportCsv,
}: Props) {
  const types = Array.from(new Set(rows.map((r) => r.type))).sort();
  // Each row already carries its own human-readable type label (row.label, e.g. "us_insurance" ->
  // "US Insurance") — reuse it instead of showing the raw snake_case credential type in the filter.
  const typeLabelByType = new Map(rows.map((r) => [r.type, r.label]));
  const ownerTypes = Array.from(new Set(rows.map((r) => r.owner_type))).sort();

  return (
    <div className="space-y-3" data-testid="compliance-table-panel">
      <ParityTable
        rows={rows}
        columns={COLUMNS}
        rowKey={(row) => row.credential_id}
        loading={false}
        storageKey="compliance-dashboard-credentials"
        emptyText="No credentials match the selected filters."
        exportFilename="compliance-credentials"
        tableTestId="compliance-credentials-table"
        rowTestId={(row) => `compliance-credential-${row.credential_id}`}
        filterBar={
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">
              Type{" "}
              <select className="ml-1 rounded-sm border px-2 py-1" value={typeFilter} onChange={(e) => onTypeFilter(e.target.value)}>
                <option value="">All</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {typeLabelByType.get(t) ?? t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Owner{" "}
              <select
                className="ml-1 rounded-sm border px-2 py-1"
                value={ownerTypeFilter}
                onChange={(e) => onOwnerTypeFilter(e.target.value)}
              >
                <option value="">All</option>
                {ownerTypes.map((t) => (
                  <option key={t} value={t}>
                    {ownerNoun(t)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="rounded-sm bg-slate-800 px-3 py-1 text-sm text-white" onClick={onExportCsv}>
              Export CSV
            </button>
          </div>
        }
      />
    </div>
  );
}
