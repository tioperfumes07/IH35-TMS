import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { driverHubRequestsApi, type DriverHubRequestRow } from "../../api/driverHubRequests";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

function formatUsdFromCents(cents: unknown) {
  const n = Number(cents ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n / 100);
}

const REVIEW_ROLES = ["Owner", "Administrator", "Manager"];

export function DriverHubPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const role = String(user?.role ?? "");
  const canReview = REVIEW_ROLES.includes(role);

  const [denyForId, setDenyForId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [approveNotesById, setApproveNotesById] = useState<Record<string, string>>({});

  const requestsKey = ["driver-hub", "cash-advance-requests", "pending", companyId];

  const pendingQuery = useQuery({
    queryKey: requestsKey,
    queryFn: () => driverHubRequestsApi.listPending(companyId),
    enabled: Boolean(companyId) && canReview,
  });

  const approveMut = useMutation({
    mutationFn: async (row: DriverHubRequestRow) => {
      const id = String(row.id ?? "");
      const notes = approveNotesById[id]?.trim();
      return driverHubRequestsApi.approve(companyId, id, { approval_notes: notes || undefined });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: requestsKey }),
  });

  const denyMut = useMutation({
    mutationFn: async () => {
      if (!denyForId) throw new Error("missing");
      return driverHubRequestsApi.deny(companyId, denyForId, { denial_reason: denyReason.trim() });
    },
    onSuccess: () => {
      setDenyForId(null);
      setDenyReason("");
      void qc.invalidateQueries({ queryKey: requestsKey });
    },
  });

  const rows = pendingQuery.data?.requests ?? [];
  const busyId = approveMut.variables ? String((approveMut.variables as DriverHubRequestRow).id ?? "") : "";

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ap = a.is_above_policy ? 1 : 0;
        const bp = b.is_above_policy ? 1 : 0;
        if (ap !== bp) return ap - bp;
        return String(a.submitted_at ?? "").localeCompare(String(b.submitted_at ?? ""));
      }),
    [rows]
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Driver Hub" subtitle="Driver overview and quick actions" />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Requests</h2>
          <p className="text-sm text-gray-500">
            Driver-submitted cash advance requests. Approving records the repayment as a settlement deduction.
          </p>
        </div>

        {!canReview ? (
          <p className="text-sm text-gray-600">Approving requests requires a Manager or Owner role.</p>
        ) : !companyId ? (
          <p className="text-sm text-gray-600">Select an operating company to view requests.</p>
        ) : pendingQuery.isLoading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : pendingQuery.isError ? (
          <p className="text-sm text-red-600">Could not load requests.</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-gray-600">No pending requests.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2">Request</th>
                  <th className="px-3 py-2">Driver</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Policy</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const id = String(row.id ?? "");
                  const above = Boolean(row.is_above_policy);
                  return (
                    <tr key={id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono text-xs">{String(row.display_id ?? "")}</td>
                      <td className="min-w-0 max-w-[240px] px-3 py-2">
                        <span title={String(row.driver_name ?? "")}>{String(row.driver_name ?? "")}</span>
                      </td>
                      <td className="px-3 py-2">{formatUsdFromCents(row.requested_amount_cents)}</td>
                      <td className="px-3 py-2">
                        {above ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Above policy</span>
                        ) : (
                          <span className="text-xs text-gray-500">Within policy</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {String(row.submitted_at ?? "").replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-40 max-w-full rounded border border-gray-200 px-2 py-1 text-xs"
                          placeholder="Approval notes"
                          value={approveNotesById[id] ?? ""}
                          onChange={(e) => setApproveNotesById((prev) => ({ ...prev, [id]: e.target.value }))}
                        />
                      </td>
                      <td className="space-x-2 px-3 py-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          disabled={approveMut.isPending}
                          onClick={() => approveMut.mutate(row)}
                          className={busyId === id ? "opacity-70" : ""}
                        >
                          Approve
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setDenyForId(id)}>
                          Deny
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {approveMut.isError ? <p className="text-sm text-red-600">Approve failed — try again.</p> : null}
        {denyMut.isError ? <p className="text-sm text-red-600">Deny failed.</p> : null}
      </section>

      {denyForId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-lg">
            <h2 className="text-base font-semibold text-gray-900">Deny request</h2>
            <p className="mt-1 text-sm text-gray-600">Reason is recorded to the audit log and shared with the driver.</p>
            <textarea
              className="mt-3 w-full rounded border border-gray-200 p-2 text-sm"
              rows={4}
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Denial reason (required)"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDenyForId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={denyReason.trim().length < 1 || denyMut.isPending}
                onClick={() => void denyMut.mutate()}
              >
                Confirm deny
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
