import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import {
  approvePendingEscrowDeduction,
  listPendingEscrowDeductions,
  rejectPendingEscrowDeduction,
  type EscrowPendingDeduction,
} from "../../api/driverFinance";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

function formatMoney(cents: number) {
  return `$${(Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function daysUntil(value: string) {
  const expires = new Date(value).getTime();
  const now = Date.now();
  return Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
}

export function EscrowDeductionsPendingTab() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [selected, setSelected] = useState<EscrowPendingDeduction | null>(null);
  const [overrideAmount, setOverrideAmount] = useState<string>("");
  const [reviewNotes, setReviewNotes] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const pendingQuery = useQuery({
    queryKey: ["driver-finance", "escrow-pending", companyId],
    queryFn: () => listPendingEscrowDeductions(companyId),
    enabled: Boolean(companyId),
  });

  const rows = pendingQuery.data?.data ?? [];
  const isOwner = auth.user?.role === "Owner";

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const normalized = overrideAmount.trim();
      const overrideAmountCents =
        normalized.length > 0 ? Math.round(Math.max(0, Number(normalized.replace(/[$,]/g, ""))) * 100) : undefined;
      return approvePendingEscrowDeduction(selected.id, {
        operating_company_id: companyId,
        override_amount_cents: overrideAmountCents,
        review_notes: reviewNotes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setSelected(null);
      setOverrideAmount("");
      setReviewNotes("");
      setErrorMessage("");
      await queryClient.invalidateQueries({ queryKey: ["driver-finance", "escrow-pending", companyId] });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? `${err.status}: ${err.message}` : String((err as Error).message ?? err);
      setErrorMessage(message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      return rejectPendingEscrowDeduction(selected.id, {
        operating_company_id: companyId,
        review_notes: reviewNotes.trim(),
      });
    },
    onSuccess: async () => {
      setSelected(null);
      setOverrideAmount("");
      setReviewNotes("");
      setErrorMessage("");
      await queryClient.invalidateQueries({ queryKey: ["driver-finance", "escrow-pending", companyId] });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? `${err.status}: ${err.message}` : String((err as Error).message ?? err);
      setErrorMessage(message);
    },
  });

  const selectedAmountDefault = useMemo(() => {
    if (!selected) return "";
    return (selected.proposed_amount_cents / 100).toFixed(2);
  }, [selected]);

  return (
    <div className="space-y-3">
      <PageHeader title="Escrow Deductions Pending Review" subtitle="Auto-proposed abandonment deductions requiring Owner decision." />

      {!isOwner ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Owner approval required.
        </div>
      ) : null}

      <div className="rounded border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2">Driver Name</th>
                <th className="px-3 py-2">Load #</th>
                <th className="px-3 py-2">Proposed Amount</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Proposed At</th>
                <th className="px-3 py-2">Expires At</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const nearExpiry = daysUntil(row.expires_at) <= 3;
                const loadId = row.load_id ?? "";
                return (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{row.driver_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.load_id ? (
                        <button
                          type="button"
                          className="text-blue-700 underline hover:text-blue-900"
                          onClick={() => navigate(`/dispatch?load_id=${encodeURIComponent(loadId)}`)}
                        >
                          {row.load_number ?? row.load_id.slice(0, 8)}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{formatMoney(row.proposed_amount_cents)}</td>
                    <td className="max-w-[320px] truncate px-3 py-2" title={row.proposed_reason}>
                      {row.proposed_reason}
                    </td>
                    <td className="px-3 py-2">{formatDateTime(row.proposed_at)}</td>
                    <td className={`px-3 py-2 ${nearExpiry ? "font-semibold text-red-600" : ""}`}>{formatDateTime(row.expires_at)}</td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelected(row);
                          setOverrideAmount((row.proposed_amount_cents / 100).toFixed(2));
                          setReviewNotes("");
                          setErrorMessage("");
                        }}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-sm text-gray-500" colSpan={7}>
                    No pending escrow deductions
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setErrorMessage("");
          setOverrideAmount("");
          setReviewNotes("");
        }}
        title="Review Escrow Deduction"
      >
        {selected ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
              <div><span className="font-semibold">Driver:</span> {selected.driver_name ?? "—"}</div>
              <div><span className="font-semibold">Load:</span> {selected.load_number ?? selected.load_id ?? "—"}</div>
              <div><span className="font-semibold">Proposed:</span> {formatMoney(selected.proposed_amount_cents)}</div>
              <div><span className="font-semibold">Reason:</span> {selected.proposed_reason}</div>
              <div className="space-y-1">
                <div className="font-semibold">Breakdown JSON</div>
                <pre className="max-h-56 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(selected.proposed_breakdown_json ?? {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="space-y-3 rounded border border-gray-200 p-3">
              <label className="block text-xs font-semibold uppercase text-gray-600">Override Amount (optional)</label>
              <input
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                value={overrideAmount || selectedAmountDefault}
                onChange={(event) => setOverrideAmount(event.target.value)}
                placeholder="e.g. 650.00"
              />

              <label className="block text-xs font-semibold uppercase text-gray-600">Review Notes</label>
              <textarea
                className="min-h-28 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                placeholder="Explain decision..."
              />

              {errorMessage ? <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">{errorMessage}</div> : null}

              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!isOwner || reviewNotes.trim().length < 10}
                  loading={rejectMutation.isPending}
                  onClick={() => void rejectMutation.mutateAsync()}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  className="!border-amber-500 !bg-amber-500 hover:!bg-amber-600"
                  disabled={!isOwner}
                  loading={approveMutation.isPending}
                  onClick={() => void approveMutation.mutateAsync()}
                >
                  Approve
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
