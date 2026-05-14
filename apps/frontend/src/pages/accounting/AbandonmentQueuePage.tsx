import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveAbandonmentChargeback, listAbandonmentChargebacks } from "../../api/abandonment";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function AbandonmentQueuePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"pending" | "all">("pending");

  const listQuery = useQuery({
    queryKey: ["abandonment-chargebacks", companyId, status],
    queryFn: () => listAbandonmentChargebacks({ operating_company_id: companyId, status }),
    enabled: Boolean(companyId),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approveAbandonmentChargeback(id, { operating_company_id: companyId }),
    onSuccess: () => {
      pushToast("Chargeback approved", "success");
      void queryClient.invalidateQueries({ queryKey: ["abandonment-chargebacks"] });
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Approve failed"), "error"),
  });

  const rows = listQuery.data?.abandonment_chargebacks ?? [];

  const subtitle = useMemo(() => "Office queue for abandonment chargebacks (pending approvals).", []);

  return (
    <div className="mx-auto max-w-6xl space-y-3 px-3 py-3">
      <PageHeader title="Abandonment chargebacks" subtitle={subtitle} />

      {!companyId ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">Select a company.</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <select className="h-9 rounded border border-gray-300 px-2 text-xs" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="pending">Pending</option>
          <option value="all">All</option>
        </select>
      </div>

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full border-collapse text-left text-[13px]">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
            <tr>
              <th className="border-b border-gray-200 px-2 py-2">Load</th>
              <th className="border-b border-gray-200 px-2 py-2">Driver</th>
              <th className="border-b border-gray-200 px-2 py-2">Total ¢</th>
              <th className="border-b border-gray-200 px-2 py-2">Status</th>
              <th className="border-b border-gray-200 px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = String(row.id ?? "");
              const loadId = String(row.load_id ?? "");
              const driverId = String(row.driver_id ?? "");
              const total = String(row.total_chargeback_cents ?? "");
              const st = String(row.status ?? "");
              return (
                <tr key={id} className="border-b border-gray-100">
                  <td className="px-2 py-2 font-mono text-[11px]">{loadId.slice(0, 8)}…</td>
                  <td className="px-2 py-2 font-mono text-[11px]">{driverId.slice(0, 8)}…</td>
                  <td className="px-2 py-2">{total}</td>
                  <td className="px-2 py-2 capitalize">{st}</td>
                  <td className="px-2 py-2 text-right">
                    {st === "pending" ? (
                      <Button type="button" size="sm" onClick={() => void approveMut.mutateAsync(id)} disabled={approveMut.isPending}>
                        Approve
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!listQuery.isLoading && rows.length === 0 ? <div className="p-4 text-sm text-slate-500">No rows.</div> : null}
      </div>
    </div>
  );
}
