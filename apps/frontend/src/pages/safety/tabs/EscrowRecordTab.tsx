import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forfeitEscrow, listEscrowRecords, type EscrowRecordRow } from "../../../api/driverFinance";
import { useAuth } from "../../../auth/useAuth";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { EscrowForfeitModal } from "../components/EscrowForfeitModal";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

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

  const columns = useMemo<ParityColumn<EscrowRecordRow>[]>(
    () => [
      { key: "driver_name", label: "Driver", sortable: true },
      { key: "current_balance", label: "Current Balance", sortable: true, render: (row) => `$${row.current_balance.toFixed(2)}` },
      { key: "pre_clause_total", label: "Pre-clause", sortable: true, render: (row) => `$${row.pre_clause_total.toFixed(2)}` },
      { key: "post_clause_total", label: "Post-clause", sortable: true, render: (row) => `$${row.post_clause_total.toFixed(2)}` },
      { key: "accumulation_rate_pct", label: "Accumulation Rate", sortable: true, render: (row) => `${row.accumulation_rate_pct.toFixed(2)}%` },
      { key: "forfeiture_history_count", label: "Forfeiture History", sortable: true },
      {
        key: "action",
        label: "Actions",
        render: (row) =>
          isOwner ? (
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
          ),
      },
    ],
    [isOwner],
  );

  return (
    <div className="space-y-3" data-testid="escrow-record-tab">
      <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-slate-600">
        Escrow balances and events surface security-invoker data. Forfeiture attempts are auditable.
      </div>

      {escrowQuery.isError ? (
        <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-xs text-red-700">Unable to load escrow records.</div>
      ) : null}

      <ParityTable<EscrowRecordRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={escrowQuery.isLoading}
        emptyText="No escrow records available for the selected company."
        storageKey="safety-escrow-records"
        exportFilename="escrow-records"
        tableTestId="escrow-record-table"
        rowTestId={(row) => `escrow-record-row-${row.id}`}
      />

      <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="escrow-forfeit-audit">
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
