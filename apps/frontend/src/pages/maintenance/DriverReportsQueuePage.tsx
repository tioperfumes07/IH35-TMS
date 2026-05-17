import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDriverReports, updateDriverReportStatus, type DriverReportRow } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

export function DriverReportsQueuePage() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"" | DriverReportRow["status"]>("");
  const [resolutionDraft, setResolutionDraft] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["maintenance", "driver-reports", operatingCompanyId, statusFilter],
    queryFn: () =>
      listDriverReports({
        operating_company_id: operatingCompanyId,
        status: statusFilter || undefined,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = useMemo(() => q.data?.rows ?? [], [q.data?.rows]);
  const mut = useMutation({
    mutationFn: (args: { id: string; status: "under_review" | "resolved" | "dismissed"; resolution_notes?: string }) =>
      updateDriverReportStatus(args.id, {
        operating_company_id: operatingCompanyId,
        status: args.status,
        resolution_notes: args.resolution_notes,
      }),
    onSuccess: async () => {
      pushToast("Driver report updated", "success");
      await qc.invalidateQueries({ queryKey: ["maintenance", "driver-reports", operatingCompanyId] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Driver Reports Queue</h2>
        <SelectCombobox
          className="h-9 rounded border border-gray-300 px-2 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "" | DriverReportRow["status"])}
        >
          <option value="">All statuses</option>
          <option value="submitted">submitted</option>
          <option value="under_review">under_review</option>
          <option value="resolved">resolved</option>
          <option value="dismissed">dismissed</option>
        </SelectCombobox>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-[980px] w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-2">Reported</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Driver</th>
              <th className="px-2 py-2">Load</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">Evidence</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100 align-top">
                <td className="px-2 py-2">{new Date(row.reported_at).toLocaleString()}</td>
                <td className="px-2 py-2">{row.report_type}</td>
                <td className="px-2 py-2">{row.driver_name ?? row.driver_id}</td>
                <td className="px-2 py-2">{row.load_number ?? row.load_id ?? "—"}</td>
                <td className="max-w-[320px] px-2 py-2">
                  <p className="whitespace-pre-wrap text-xs text-gray-700">{row.description}</p>
                  {row.latitude != null && row.longitude != null ? (
                    <p className="mt-1 text-[11px] text-gray-500">
                      {row.latitude}, {row.longitude}
                    </p>
                  ) : null}
                </td>
                <td className="px-2 py-2">
                  <div className="text-[11px] text-gray-700">Photos: {row.photo_r2_paths?.length ?? 0}</div>
                  <div className="text-[11px] text-gray-700">Voice: {row.voice_memo_r2_path ? "yes" : "no"}</div>
                </td>
                <td className="px-2 py-2">{row.status}</td>
                <td className="px-2 py-2">
                  <div className="space-y-1">
                    <textarea
                      rows={2}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      placeholder="Resolution notes..."
                      value={resolutionDraft[row.id] ?? ""}
                      onChange={(event) =>
                        setResolutionDraft((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => mut.mutate({ id: row.id, status: "under_review" })}>
                        Review
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          mut.mutate({ id: row.id, status: "resolved", resolution_notes: resolutionDraft[row.id] ?? undefined })
                        }
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          mut.mutate({ id: row.id, status: "dismissed", resolution_notes: resolutionDraft[row.id] ?? undefined })
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-sm text-gray-500">
                  No driver reports found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
