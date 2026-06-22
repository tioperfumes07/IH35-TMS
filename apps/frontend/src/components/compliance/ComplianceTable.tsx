import { Link } from "react-router-dom";
import type { ComplianceCredential } from "../../api/compliance";

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
  yellow: "text-amber-700",
  green: "text-green-700",
};

export function ComplianceTable({
  rows,
  typeFilter,
  ownerTypeFilter,
  onTypeFilter,
  onOwnerTypeFilter,
  onExportCsv,
}: Props) {
  const types = Array.from(new Set(rows.map((r) => r.type))).sort();
  const ownerTypes = Array.from(new Set(rows.map((r) => r.owner_type))).sort();

  return (
    <div className="space-y-3" data-testid="compliance-table-panel">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Type{" "}
          <select className="ml-1 rounded border px-2 py-1" value={typeFilter} onChange={(e) => onTypeFilter(e.target.value)}>
            <option value="">All</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Owner{" "}
          <select
            className="ml-1 rounded border px-2 py-1"
            value={ownerTypeFilter}
            onChange={(e) => onOwnerTypeFilter(e.target.value)}
          >
            <option value="">All</option>
            {ownerTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="rounded bg-slate-800 px-3 py-1 text-sm text-white" onClick={onExportCsv}>
          Export CSV
        </button>
      </div>
      <table className="min-w-full border text-sm">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="p-2">Type</th>
            <th className="p-2">Owner</th>
            <th className="p-2">Name</th>
            <th className="p-2">Expiration</th>
            <th className="p-2">Days</th>
            <th className="p-2">Severity</th>
            <th className="p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.credential_id} className="border-t">
              <td className="p-2">{row.label}</td>
              <td className="p-2">{row.owner_type}</td>
              <td className="p-2">{row.owner_name}</td>
              <td className="p-2">{row.expiration_date ?? "—"}</td>
              <td className="p-2">{row.days_until_expiration ?? "—"}</td>
              <td className={`p-2 font-medium ${severityClass[row.severity] ?? ""}`}>{row.severity}</td>
              <td className="p-2">
                <Link className="text-slate-700 underline" to={row.action_link}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
