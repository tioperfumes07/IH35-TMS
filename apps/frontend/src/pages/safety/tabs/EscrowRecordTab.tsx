import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/useAuth";

type EscrowRow = {
  id: string;
  driver_name: string;
  current_balance: number;
  pre_clause_total: number;
  post_clause_total: number;
  accumulation_rate_pct: number;
  forfeiture_history_count: number;
  has_signed_clause: boolean;
};

type Attempt = {
  id: string;
  driver_name: string;
  amount: number;
  reason: string;
  linked_liability_id?: string;
  status: "success" | "blocked";
  created_at: string;
};

const DEFAULT_ROWS: EscrowRow[] = [
  {
    id: "legacy-demo",
    driver_name: "Legacy Driver (demo)",
    current_balance: 0,
    pre_clause_total: 0,
    post_clause_total: 0,
    accumulation_rate_pct: 0,
    forfeiture_history_count: 0,
    has_signed_clause: false,
  },
];

export function EscrowRecordTab() {
  const auth = useAuth();
  const isOwner = auth.user?.role === "Owner";
  const [rows, setRows] = useState<EscrowRow[]>(DEFAULT_ROWS);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selected, setSelected] = useState<EscrowRow | null>(null);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [linkedLiabilityId, setLinkedLiabilityId] = useState("");

  const totalForfeits = useMemo(() => attempts.filter((a) => a.status === "success").length, [attempts]);

  return (
    <div className="space-y-3">
      <div className="rounded border border-gray-200 bg-white p-3 text-xs text-slate-600">
        Escrow balances and events surface security-invoker data. Forfeiture attempts are auditable, including blocked legacy-driver attempts.
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
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
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-2 py-1">{row.driver_name}</td>
                <td className="px-2 py-1">${row.current_balance.toFixed(2)}</td>
                <td className="px-2 py-1">${row.pre_clause_total.toFixed(2)}</td>
                <td className="px-2 py-1">${row.post_clause_total.toFixed(2)}</td>
                <td className="px-2 py-1">{row.accumulation_rate_pct.toFixed(2)}%</td>
                <td className="px-2 py-1">{row.forfeiture_history_count}</td>
                <td className="px-2 py-1">
                  {isOwner ? (
                    <button type="button" className="text-[#1f2a44] underline" onClick={() => setSelected(row)}>
                      Forfeit
                    </button>
                  ) : (
                    <span className="text-slate-400">Owner-only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <h4 className="text-xs font-semibold text-slate-700">Forfeiture Audit</h4>
        <p className="mt-1 text-[11px] text-slate-500">Successful forfeitures: {totalForfeits}</p>
        <div className="mt-2 space-y-1 text-[11px]">
          {attempts.map((entry) => (
            <div key={entry.id} className={entry.status === "blocked" ? "text-red-700" : "text-slate-700"}>
              {entry.created_at.slice(0, 16).replace("T", " ")} - {entry.driver_name} - ${entry.amount.toFixed(2)} - {entry.reason} ({entry.status})
            </div>
          ))}
          {attempts.length === 0 ? <div className="text-slate-400">No forfeiture attempts yet.</div> : null}
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded border border-gray-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-800">Escrow Forfeit - {selected.driver_name}</h4>
            <div className="mt-3 space-y-2">
              <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value || 0))} placeholder="Amount" />
              <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
              <input className="w-full rounded border border-gray-300 px-2 py-1 text-xs" value={linkedLiabilityId} onChange={(e) => setLinkedLiabilityId(e.target.value)} placeholder="Linked liability_id (optional)" />
            </div>
            {!selected.has_signed_clause ? (
              <p className="mt-2 text-xs text-red-700">Blocked: legacy driver without signed escrow clause (MUST 3.13.6.3.D).</p>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded border border-gray-300 px-2 py-1 text-xs" onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white"
                onClick={() => {
                  const blocked = !selected.has_signed_clause;
                  setAttempts((prev) => [
                    {
                      id: `${Date.now()}-${Math.random()}`,
                      driver_name: selected.driver_name,
                      amount,
                      reason,
                      linked_liability_id: linkedLiabilityId || undefined,
                      status: blocked ? "blocked" : "success",
                      created_at: new Date().toISOString(),
                    },
                    ...prev,
                  ]);
                  if (!blocked) {
                    setRows((prev) =>
                      prev.map((row) => (row.id === selected.id ? { ...row, current_balance: Math.max(0, row.current_balance - amount), forfeiture_history_count: row.forfeiture_history_count + 1 } : row))
                    );
                  }
                  setSelected(null);
                  setAmount(0);
                  setReason("");
                  setLinkedLiabilityId("");
                }}
              >
                Submit Forfeit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
