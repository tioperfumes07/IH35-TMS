import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getIntegrityAlerts } from "../../api/safety";
import { IntegrityAlertDetailDrawer } from "./components/IntegrityAlertDetailDrawer";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type Props = {
  operatingCompanyId: string;
};

export function IntegrityAlertsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  const query = useQuery({
    queryKey: ["safety", "integrity-alerts", operatingCompanyId, category, severity, status],
    queryFn: () =>
      getIntegrityAlerts(operatingCompanyId, {
        alert_category: category,
        severity,
        resolution_status: status,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = query.data?.integrity_alerts ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs"
          placeholder="Category"
        />
        <SelectCombobox value={severity} onChange={(event) => setSeverity(event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="">All severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </SelectCombobox>
        <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="">All statuses</option>
          <option value="unresolved">Unresolved</option>
          <option value="investigating">Investigating</option>
          <option value="false_positive">False positive</option>
          <option value="confirmed_action_taken">Confirmed action taken</option>
          <option value="dismissed">Dismissed</option>
        </SelectCombobox>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-[980px] w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1">Created</th>
              <th className="px-2 py-1">Category</th>
              <th className="px-2 py-1">Severity</th>
              <th className="px-2 py-1">Subject</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.created_at ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.alert_category ?? "—")}</td>
                <td className="px-2 py-1">{String(row.severity ?? "—")}</td>
                <td className="px-2 py-1">{String(row.subject_type ?? "—")}</td>
                <td className="px-2 py-1">{String(row.resolution_status ?? "unresolved")}</td>
                <td className="px-2 py-1">
                  <button type="button" className="text-blue-700 underline" onClick={() => setSelected(row)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center text-gray-500">
                  No integrity alerts yet. Phase 6 alert engine will populate this view from the integrity views shipped in T11.6.1
                  (tire frequency, repair frequency, cost anomalies, MPG anomalies, vendor-driver collusion patterns).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <IntegrityAlertDetailDrawer
        open={Boolean(selected)}
        alert={selected}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setSelected(null)}
        onUpdated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "integrity-alerts", operatingCompanyId] })}
      />
    </div>
  );
}
