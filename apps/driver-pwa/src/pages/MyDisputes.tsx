import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMyDisputes, withdrawMyDispute } from "../api/disputes";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";

function money(cents: number | null | undefined) {
  return `$${((Number(cents ?? 0) || 0) / 100).toFixed(2)}`;
}

function statusClass(status: string) {
  if (status === "open") return "bg-yellow-100 text-yellow-800";
  if (status === "under_review") return "bg-blue-100 text-blue-800";
  if (status === "resolved_in_favor" || status === "partially_resolved") return "bg-green-100 text-green-800";
  if (status === "withdrawn") return "bg-gray-100 text-gray-700";
  return "bg-red-100 text-red-700";
}

export function MyDisputesPage() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const query = useQuery({
    queryKey: ["pwa", "my-disputes"],
    queryFn: listMyDisputes,
  });

  const withdrawMutation = useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: string }) => withdrawMyDispute(id, companyId),
    onSuccess: async () => {
      pushToast("Dispute withdrawn", "success");
      await queryClient.invalidateQueries({ queryKey: ["pwa", "my-disputes"] });
    },
    onError: (error) => pushToast(String((error as Error).message || error), "error"),
  });

  const disputes = query.data?.disputes ?? [];

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-24">
        <PwaCard title="My Disputes" subtitle="Read-only status view with withdraw option while still open">
          {query.isLoading ? <div className="text-sm text-pwa-text-secondary">Loading disputes...</div> : null}
          {!query.isLoading && disputes.length === 0 ? (
            <div className="text-sm text-pwa-text-secondary">No disputes filed yet.</div>
          ) : null}
          <div className="space-y-2">
            {disputes.map((dispute) => (
              <div key={dispute.id} className="rounded border border-pwa-border bg-[#101522] p-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-semibold">{dispute.settlement_display_id ?? dispute.settlement_id}</p>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${statusClass(dispute.status)}`}>{dispute.status}</span>
                </div>
                <p className="text-xs text-pwa-text-secondary">
                  {dispute.period_start ?? "-"} to {dispute.period_end ?? "-"}
                </p>
                <p className="mt-1 text-xs">{dispute.dispute_category} · {money(dispute.disputed_amount_cents)}</p>
                <p className="mt-1 text-xs text-pwa-text-secondary">{dispute.dispute_description}</p>
                {dispute.status === "open" ? (
                  <button
                    type="button"
                    className="mt-2 min-h-11 rounded border border-red-400 px-3 py-1 text-xs font-semibold text-red-300"
                    disabled={withdrawMutation.isPending}
                    onClick={() => withdrawMutation.mutate({ id: dispute.id, companyId: dispute.operating_company_id })}
                  >
                    Withdraw
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </PwaCard>
      </div>
    </div>
  );
}
