import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSettlementDispute,
  listSettlementDisputes,
  markSettlementDisputeUnderReview,
  resolveSettlementDispute,
  type SettlementDisputeRow,
  type SettlementDisputeStatus,
} from "../../../api/driverFinance";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";

function money(cents: number | null | undefined) {
  return `$${((Number(cents ?? 0) || 0) / 100).toFixed(2)}`;
}

function statusBadgeClass(status: SettlementDisputeStatus) {
  if (status === "open") return "bg-yellow-100 text-yellow-800";
  if (status === "under_review") return "bg-blue-100 text-blue-800";
  if (status === "resolved_in_favor" || status === "partially_resolved") return "bg-green-100 text-green-800";
  if (status === "withdrawn") return "bg-gray-100 text-gray-700";
  return "bg-red-100 text-red-700";
}

export function SettlementDisputesTab({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState<"open" | "all">("open");
  const [driverId, setDriverId] = useState("");
  const [selected, setSelected] = useState<SettlementDisputeRow | null>(null);
  const [resolution, setResolution] = useState<"in_favor" | "rejected" | "partial">("in_favor");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolutionAmount, setResolutionAmount] = useState("");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const disputesQuery = useQuery({
    queryKey: ["driver-finance", "settlement-disputes", companyId, status, driverId],
    queryFn: () => listSettlementDisputes(companyId, { status, driver_id: driverId.trim() || undefined }),
    enabled: Boolean(companyId),
  });

  const detailQuery = useQuery({
    queryKey: ["driver-finance", "settlement-disputes", "detail", selected?.id ?? "", companyId],
    queryFn: () => getSettlementDispute(selected!.id, companyId),
    enabled: Boolean(selected?.id && companyId),
  });

  const reviewMutation = useMutation({
    mutationFn: (id: string) => markSettlementDisputeUnderReview(id, { operating_company_id: companyId }),
    onSuccess: async () => {
      pushToast("Dispute marked under review", "success");
      await queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlement-disputes"] });
    },
    onError: (error) => pushToast(String((error as Error)?.message || error), "error"),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) =>
      resolveSettlementDispute(id, {
        operating_company_id: companyId,
        resolution,
        resolution_notes: resolutionNotes.trim(),
        resolution_amount_cents:
          resolution === "rejected" ? undefined : Math.max(0, Math.round(Number(resolutionAmount || "0") * 100)) || undefined,
      }),
    onSuccess: async () => {
      pushToast("Dispute resolved", "success");
      setSelected(null);
      setResolution("in_favor");
      setResolutionNotes("");
      setResolutionAmount("");
      await queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlement-disputes"] });
    },
    onError: (error) => pushToast(String((error as Error)?.message || error), "error"),
  });

  const rows = disputesQuery.data?.disputes ?? [];
  const detail = detailQuery.data?.dispute ?? selected;
  const openedDaysAgo = useMemo(() => {
    if (!detail?.opened_at) return null;
    const diff = Date.now() - new Date(detail.opened_at).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }, [detail?.opened_at]);

  const resolutionAmountPreviewCents = Math.max(0, Math.round(Number(resolutionAmount || "0") * 100));
  const canResolve =
    Boolean(detail?.id) &&
    resolutionNotes.trim().length >= 20 &&
    (resolution === "rejected" || resolutionAmountPreviewCents > 0);

  return (
    <div className="space-y-3">
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-xs">
            <div className="mb-1 text-gray-500">Status</div>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "open" | "all")}
              className="w-full rounded border border-gray-300 px-2 py-1"
            >
              <option value="all">All</option>
              <option value="open">Open / Under Review</option>
            </select>
          </label>
          <label className="text-xs">
            <div className="mb-1 text-gray-500">Driver ID</div>
            <input
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1"
              placeholder="Optional driver UUID filter"
            />
          </label>
          <div className="flex items-end">
            <Button size="sm" variant="secondary" onClick={() => void disputesQuery.refetch()}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2">Driver Name</th>
              <th className="px-3 py-2">Settlement Period</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Disputed Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Opened</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="min-w-0 max-w-[240px] px-3 py-2">
                  {(() => {
                    const dn = row.driver_name ?? row.driver_id ?? "—";
                    return (
                      <span title={dn !== "—" ? String(dn) : undefined} className="single-line-name">
                        {String(dn)}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3 py-2">{row.period_start ?? "-"} to {row.period_end ?? "-"}</td>
                <td className="px-3 py-2">{row.dispute_category}</td>
                <td className="max-w-[240px] truncate px-3 py-2" title={row.dispute_description}>
                  {row.dispute_description}
                </td>
                <td className="px-3 py-2">{money(row.disputed_amount_cents)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(row.status)}`}>{row.status}</span>
                </td>
                <td className="px-3 py-2">{Math.max(0, Math.floor((Date.now() - new Date(row.opened_at).getTime()) / 86400000))}d ago</td>
                <td className="px-3 py-2">
                  <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  {disputesQuery.isLoading ? "Loading disputes..." : "No disputes found for current filter."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detail ? (
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Dispute Detail</p>
              <p className="text-xs text-gray-500">
                {detail.settlement_display_id ?? detail.settlement_id} ·{" "}
                <span
                  title={
                    detail.driver_name || detail.driver_id
                      ? String(detail.driver_name ?? detail.driver_id)
                      : undefined
                  }
                  className="single-line-name"
                >
                  {detail.driver_name ?? detail.driver_id}
                </span>
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSelected(null);
                setResolution("in_favor");
                setResolutionNotes("");
                setResolutionAmount("");
              }}
            >
              Close
            </Button>
          </div>

          <div className="grid gap-2 text-xs md:grid-cols-2">
            <div className="rounded border border-gray-100 p-2">
              <p className="font-semibold text-gray-700">Dispute</p>
              <p>Category: {detail.dispute_category}</p>
              <p>Status: {detail.status}</p>
              <p>Opened: {openedDaysAgo ?? "-"} days ago</p>
              <p>Description: {detail.dispute_description}</p>
            </div>
            <div className="rounded border border-gray-100 p-2">
              <p className="font-semibold text-gray-700">Settlement Breakdown</p>
              <p>Period: {detail.period_start ?? "-"} to {detail.period_end ?? "-"}</p>
              <p>Gross: {money(Number(detail.gross_pay ?? 0))}</p>
              <p>Deductions: {money(Number(detail.deductions_total ?? 0))}</p>
              <p>Net: {money(Number(detail.net_pay ?? 0))}</p>
            </div>
          </div>

          <div className="mt-3 space-y-2 rounded border border-gray-100 p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Action Panel</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={reviewMutation.isPending || detail.status !== "open"}
                onClick={() => reviewMutation.mutate(detail.id)}
              >
                Review
              </Button>
              <select
                value={resolution}
                onChange={(event) => setResolution(event.target.value as "in_favor" | "rejected" | "partial")}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="in_favor">Resolve in Favor</option>
                <option value="rejected">Reject</option>
                <option value="partial">Partial</option>
              </select>
              <input
                value={resolutionAmount}
                onChange={(event) => setResolutionAmount(event.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                placeholder="Adjustment amount (USD)"
                disabled={resolution === "rejected"}
              />
            </div>
            <textarea
              value={resolutionNotes}
              onChange={(event) => setResolutionNotes(event.target.value)}
              className="min-h-[90px] w-full rounded border border-gray-300 px-2 py-1 text-xs"
              placeholder="Resolution notes (minimum 20 chars, required for audit clarity)"
            />

            {resolution === "in_favor" || resolution === "partial" ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                Corrective JE preview: debit and credit entries will be posted for {money(resolutionAmountPreviewCents)}.
              </div>
            ) : null}

            <Button
              size="sm"
              disabled={!canResolve || resolveMutation.isPending || detail.status === "withdrawn"}
              onClick={() => resolveMutation.mutate(detail.id)}
            >
              Resolve
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
