import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";

async function apiGet(path: string) {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

async function apiPatch(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

export function ReturnToDuty() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();

  const rtdQ = useQuery({
    queryKey: ["compliance", "drug-alcohol", "rtd", companyId],
    enabled: Boolean(companyId),
    queryFn: () => apiGet(`/api/v1/compliance/drug-alcohol/rtd?operating_company_id=${encodeURIComponent(companyId)}`),
  });

  const resultsQ = useQuery({
    queryKey: ["compliance", "drug-alcohol", "results", companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiGet(`/api/v1/compliance/drug-alcohol/results?operating_company_id=${encodeURIComponent(companyId)}`),
  });

  const reportMutation = useMutation({
    mutationFn: (testId: string) =>
      apiPatch(`/api/v1/compliance/drug-alcohol/results/${testId}/clearinghouse`, {
        operating_company_id: companyId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["compliance", "drug-alcohol", "results", companyId] });
    },
  });

  const processes = (rtdQ.data as { processes?: Array<Record<string, unknown>> })?.processes ?? [];
  const positivePending = (
    (resultsQ.data as { results?: Array<Record<string, unknown>> })?.results ?? []
  ).filter((row) => row.result === "positive" && row.clearinghouse_pending === true);

  return (
    <div className="space-y-4">
      <div className="rounded border border-gray-200 bg-white p-4 text-xs">
        <h3 className="text-sm font-semibold text-slate-900">Open return-to-duty processes</h3>
        <ul className="mt-2 space-y-2">
          {processes.map((proc) => (
            <li key={String(proc.id)} className="rounded border border-gray-100 p-2">
              <div className="font-medium">Driver {String(proc.driver_id).slice(0, 8)}…</div>
              <div className="text-slate-600">Status: {String(proc.status)} · Started {String(proc.started_at).slice(0, 10)}</div>
            </li>
          ))}
          {processes.length === 0 ? <li className="text-slate-500">No open RTD processes.</li> : null}
        </ul>
      </div>

      <div className="rounded border border-amber-200 bg-amber-50 p-4 text-xs">
        <h3 className="text-sm font-semibold text-amber-900">FMCSA Clearinghouse — pending positive reports</h3>
        <ul className="mt-2 space-y-2">
          {positivePending.map((row) => (
            <li key={String(row.id)} className="flex items-center justify-between rounded border border-amber-100 bg-white p-2">
              <span>
                Driver {String(row.driver_id).slice(0, 8)}… · {String(row.test_date)}
              </span>
              <button
                type="button"
                className="rounded bg-amber-800 px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50"
                disabled={reportMutation.isPending}
                onClick={() => reportMutation.mutate(String(row.id))}
              >
                Mark reported
              </button>
            </li>
          ))}
          {positivePending.length === 0 ? <li className="text-amber-800">All positives reported or none on file.</li> : null}
        </ul>
      </div>
    </div>
  );
}
