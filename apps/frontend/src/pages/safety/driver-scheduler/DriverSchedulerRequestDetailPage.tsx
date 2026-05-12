import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { ApiError } from "../../../api/client";

export function DriverSchedulerRequestDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [deniedReason, setDeniedReason] = useState("");
  const [error, setError] = useState("");

  const query = useQuery({
    queryKey: ["driver-scheduler", "request", id, operatingCompanyId],
    enabled: Boolean(id && operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.getRequestDetail(operatingCompanyId, id),
  });

  const approveMut = useMutation({
    mutationFn: () => driverSchedulerOfficeApi.reviewRequest(operatingCompanyId, id, { action: "approve" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["driver-scheduler"] });
      setError("");
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) setError(String((e.data as { error?: string })?.error ?? "failed"));
      else setError("failed");
    },
  });

  const denyMut = useMutation({
    mutationFn: () =>
      driverSchedulerOfficeApi.reviewRequest(operatingCompanyId, id, { action: "deny", denied_reason: deniedReason }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["driver-scheduler"] });
      setError("");
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) setError(String((e.data as { error?: string })?.error ?? "failed"));
      else setError("failed");
    },
  });

  const req = query.data?.request;

  return (
    <div className="space-y-3">
      <PageHeader title="Leave request" subtitle={req ? String(req.request_number) : "…"} />
      <div className="mb-2">
        <Link to="/safety/scheduler/pending-requests" className="text-xs text-blue-600 hover:underline">
          ← Pending queue
        </Link>
      </div>

      {query.isLoading ? <div className="text-sm text-gray-500">Loading…</div> : null}
      {!query.isLoading && !req ? <div className="text-sm text-red-700">Request not found.</div> : null}

      {req ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-gray-200 bg-white p-3 text-xs">
            <div className="font-semibold text-gray-900">Driver</div>
            <div>{String(req.driver_name ?? "")}</div>
            <div className="mt-2 font-semibold">Type</div>
            <div>{String(req.leave_type)}</div>
            <div className="mt-2 font-semibold">Dates</div>
            <div>
              {String(req.start_date).slice(0, 10)} – {String(req.end_date).slice(0, 10)}
            </div>
            <div className="mt-2 font-semibold">Reason</div>
            <div className="whitespace-pre-wrap text-gray-700">{String(req.reason ?? "")}</div>
            <div className="mt-2 font-semibold">Status</div>
            <div>{String(req.status)}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3 text-xs">
            <div className="font-semibold text-gray-900">Review actions</div>
            {String(req.status) === "pending_review" ? (
              <div className="mt-2 space-y-2">
                <Button size="sm" onClick={() => void approveMut.mutate()} disabled={approveMut.isPending}>
                  Approve
                </Button>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Deny reason</label>
                  <textarea
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                    rows={2}
                    value={deniedReason}
                    onChange={(e) => setDeniedReason(e.target.value)}
                  />
                  <Button
                    className="mt-1"
                    size="sm"
                    variant="secondary"
                    onClick={() => void denyMut.mutate()}
                    disabled={denyMut.isPending || !deniedReason.trim()}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-gray-500">No actions — request is not pending review.</p>
            )}
            {error ? <p className="mt-2 text-red-700">{error}</p> : null}
          </div>
        </div>
      ) : null}

      {query.data?.audit_log?.length ? (
        <div className="rounded border border-gray-200 bg-white p-3 text-xs">
          <div className="mb-1 font-semibold">Audit trail</div>
          <ul className="space-y-1">
            {query.data.audit_log.map((a) => (
              <li key={String(a.id)}>
                {String(a.created_at)} · {String(a.event_type)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
