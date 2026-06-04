import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forfeitEscrow, listEscrowRecords, type EscrowRecordRow } from "../../../api/driverFinance";
import { useAuth } from "../../../auth/useAuth";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { EscrowForfeitModal } from "../components/EscrowForfeitModal";

export function EscrowRecordTab() {
  const auth = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const isOwner = auth.user?.role === "Owner";
  const [selected, setSelected] = useState<EscrowRecordRow | null>(null);

  const escrowQuery = useQuery({
    queryKey: ["safety", "escrow-records", operatingCompanyId],
    queryFn: () => listEscrowRecords(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const forfeitMutation = useMutation({
    mutationFn: (payload: { row: EscrowRecordRow; amount: number; reason: string; linked_liability_id?: string }) =>
      forfeitEscrow(payload.row.id, {
        operating_company_id: operatingCompanyId,
        amount: payload.amount,
        reason: payload.reason,
        linked_liability_id: payload.linked_liability_id,
      }),
    onSuccess: (result) => {
      pushToast(
        result.status === "blocked" ? "Forfeiture blocked by agreement gate." : "Escrow forfeiture submitted.",
        result.status === "blocked" ? "error" : "success"
      );
      void queryClient.invalidateQueries({ queryKey: ["safety", "escrow-records", operatingCompanyId] });
      setSelected(null);
    },
    onError: () => {
      pushToast("Forfeiture request failed.", "error");
    },
  });

  const rows = escrowQuery.data?.records ?? [];
  const attempts = escrowQuery.data?.forfeit_attempts ?? [];
  const totalForfeits = useMemo(() => attempts.filter((a) => a.status === "success").length, [attempts]);

  return (
    <div className="space-y-3" data-testid="escrow-record-tab">
      <div className="rounded border border-gray-200 bg-white p-3 text-xs text-slate-600">
        Escrow balances and events surface security-invoker data. Forfeiture attempts are auditable.
      </div>

      {escrowQuery.isLoading ? (
        <div className="rounded border border-gray-200 bg-white p-3 text-xs text-slate-500">Loading escrow records…</div>
      ) : null}
      {escrowQuery.isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">Unable to load escrow records.</div>
      ) : null}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs" data-testid="escrow-record-table">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Current Balance</th>
              <th className="px-2 py-1 text-left">Pre-clause</th>
              <th className="px-2 py-1 text-left">Post-clause</th>
              <th className="px-2 py-1 text-left">Accumulation Rate</th>
              <th className="px-2 py-1 text-left">Forfeiture History</th>
              <th className="px-2 py-1 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100" data-testid={`escrow-record-row-${row.id}`}>
                <td className="px-2 py-1">{row.driver_name}</td>
                <td className="px-2 py-1">${row.current_balance.toFixed(2)}</td>
                <td className="px-2 py-1">${row.pre_clause_total.toFixed(2)}</td>
                <td className="px-2 py-1">${row.post_clause_total.toFixed(2)}</td>
                <td className="px-2 py-1">{row.accumulation_rate_pct.toFixed(2)}%</td>
                <td className="px-2 py-1">{row.forfeiture_history_count}</td>
                <td className="px-2 py-1">
                  {isOwner ? (
                    <button
                      type="button"
                      className="text-[#1f2a44] underline"
                      data-testid={`escrow-forfeit-btn-${row.id}`}
                      onClick={() => setSelected(row)}
                    >
                      Forfeit
                    </button>
                  ) : (
                    <span className="text-slate-400">Owner-only</span>
                  )}
                </td>
              </tr>
            ))}
            {!escrowQuery.isLoading && rows.length === 0 ? (
              <tr className="border-t border-gray-100">
                <td className="px-2 py-3 text-center text-slate-500" colSpan={7}>
                  No escrow records available for the selected company.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3" data-testid="escrow-forfeit-audit">
        <h4 className="text-xs font-semibold text-slate-700">Forfeiture Audit</h4>
        <p className="mt-1 text-[11px] text-slate-500">Successful forfeitures: {totalForfeits}</p>
        <div className="mt-2 space-y-1 text-[11px]">
          {attempts.map((entry) => (
            <div key={entry.id} className={entry.status === "blocked" ? "text-red-700" : "text-slate-700"}>
              {entry.created_at.slice(0, 16).replace("T", " ")} - {entry.driver_name} - ${entry.amount.toFixed(2)} - {entry.reason} (
              {entry.status})
            </div>
          ))}
          {attempts.length === 0 ? <div className="text-slate-400">No forfeiture attempts yet.</div> : null}
        </div>
      </div>

      {/* ARCHIVE-not-DELETE: legacy inline forfeit modal replaced by EscrowForfeitModal (A23-8). Sunset: Phase 4 driver-finance escrow API parity. */}
      <EscrowForfeitModal
        open={Boolean(selected)}
        row={selected}
        loading={forfeitMutation.isPending}
        onClose={() => setSelected(null)}
        onConfirm={(payload) => {
          if (!selected) return;
          forfeitMutation.mutate({ row: selected, ...payload });
        }}
      />
    </div>
  );
}
