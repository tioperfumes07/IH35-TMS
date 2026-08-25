import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateUS } from "../../lib/formatDate";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { resolveApiUrl } from "../../api/client";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorState } from "../../components/ListErrorState";

// SAF-F06: these page-local helpers called bare fetch(path), so with
// VITE_API_BASE_URL set and NO /api rewrite on the static site the request hit
// app.ih35dispatch.com and got index.html back with HTTP 200 — res.ok was true, the
// !res.ok guard never fired, and res.json() threw on HTML. Every load failed silently
// and rendered as empty data. resolveApiUrl() is the shared client's URL resolver.
async function apiGet(path: string) {
  const res = await fetch(resolveApiUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

async function apiPatch(path: string, body: unknown) {
  const res = await fetch(resolveApiUrl(path), {
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
      <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs">
        <h3 className="text-sm font-semibold text-slate-900">Open return-to-duty processes</h3>
        {rtdQ.isError ? (
          <div data-testid="rtd-processes-query-error"><ListErrorState status={0} message={userFacingApiError(rtdQ.error, "Could not load return-to-duty processes.")} onRetry={() => void rtdQ.refetch()} /></div>
        ) : (
          <ul className="mt-2 space-y-2">
            {processes.map((proc) => (
              <li key={String(proc.id)} className="rounded-sm border border-gray-100 p-2">
                <div className="font-medium">
                  Driver{" "}
                  <EntityLink
                    kind="driver"
                    id={proc.driver_id ? String(proc.driver_id) : undefined}
                    label={entityLabel(proc.driver_name, proc.driver_id ? String(proc.driver_id) : undefined, "Driver")}
                  />
                </div>
                <div className="text-slate-600">Status: {String(proc.status)} · Started {formatDateUS(proc.started_at)}</div>
              </li>
            ))}
            {processes.length === 0 ? <li className="text-slate-500">No open RTD processes.</li> : null}
          </ul>
        )}
      </div>

      <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-xs">
        <h3 className="text-sm font-semibold text-slate-700">FMCSA Clearinghouse — pending positive reports</h3>
        {resultsQ.isError ? (
          <div data-testid="rtd-results-query-error"><ListErrorState status={0} message={userFacingApiError(resultsQ.error, "Could not load drug/alcohol results.")} onRetry={() => void resultsQ.refetch()} /></div>
        ) : (
          <ul className="mt-2 space-y-2">
            {positivePending.map((row) => (
              <li key={String(row.id)} className="flex items-center justify-between rounded-sm border border-slate-100 bg-white p-2">
                <span>
                  Driver{" "}
                  <EntityLink
                    kind="driver"
                    id={row.driver_id ? String(row.driver_id) : undefined}
                    label={entityLabel(row.driver_name, row.driver_id ? String(row.driver_id) : undefined, "Driver")}
                  />{" "}
                  · {String(row.test_date)}
                </span>
                <button
                  type="button"
                  className="rounded-sm bg-slate-700 px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50"
                  disabled={reportMutation.isPending}
                  onClick={() => reportMutation.mutate(String(row.id))}
                >
                  Mark reported
                </button>
              </li>
            ))}
            {positivePending.length === 0 ? <li className="text-slate-700">All positives reported or none on file.</li> : null}
          </ul>
        )}
        {reportMutation.isError ? (
          <p className="mt-2 text-xs text-red-700" data-testid="rtd-clearinghouse-report-error">
            {userFacingApiError(reportMutation.error, "Could not mark the Clearinghouse report as submitted.")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
