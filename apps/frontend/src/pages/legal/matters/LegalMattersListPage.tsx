import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { legalMattersApi, type LegalMatterListRow } from "../../../api/legal-matters";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";

function daysUntil(dateStr: unknown) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(ms / (24 * 3600 * 1000));
}

export function LegalMattersListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [type, setType] = useState("");

  const listQuery = useQuery({
    queryKey: ["legal", "matters", companyId, status, severity, type],
    queryFn: () =>
      legalMattersApi.list(companyId, {
        status: status || undefined,
        severity: severity || undefined,
        type: type || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const rows = listQuery.data?.matters ?? [];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Legal matters"
        subtitle="Lawsuits, claims, and regulatory matters"
        actions={
          <Link to="/legal/matters/new">
            <Button>+ Create Matter</Button>
          </Link>
        }
      />
      <LegalModuleTabs activeTabId="matters" />
      {!companyId ? (
        <p className="text-sm text-gray-600">Select an operating company.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded border border-gray-200 px-2 py-1 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {["open", "investigating", "litigation", "settled", "dismissed", "judgment", "closed"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-gray-200 px-2 py-1 text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">All severity</option>
              {["critical", "high", "medium", "low"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select className="rounded border border-gray-200 px-2 py-1 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {["lawsuit", "claim", "demand_letter", "settlement", "regulatory", "other"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {listQuery.isLoading ? (
            <p className="text-sm text-gray-600">Loading…</p>
          ) : listQuery.isError ? (
            <p className="text-sm text-red-600">Could not load matters.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-600">No matters match filters.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Number</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Severity</th>
                    <th className="px-3 py-2">SOL / hearing</th>
                    <th className="px-3 py-2"> </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: LegalMatterListRow) => {
                    const id = String(row.id ?? "");
                    const sol = daysUntil(row.statute_of_limitations_at);
                    const urgent = sol !== null && sol >= 0 && sol < 14;
                    return (
                      <tr key={id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-mono text-xs">{String(row.matter_number ?? "")}</td>
                        <td className="px-3 py-2">{String(row.type ?? "")}</td>
                        <td className="px-3 py-2">{String(row.status ?? "")}</td>
                        <td className="px-3 py-2">{String(row.severity ?? "")}</td>
                        <td className="px-3 py-2">
                          {urgent ? (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                              SOL {sol}d
                            </span>
                          ) : (
                            <span className="text-xs text-gray-600">
                              {row.statute_of_limitations_at ? String(row.statute_of_limitations_at).slice(0, 10) : "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Link to={`/legal/matters/${id}`} className="text-xs text-blue-600">
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
