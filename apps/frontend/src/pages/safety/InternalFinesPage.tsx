import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createInternalFine, getInternalFines } from "../../api/safety";

type Props = {
  operatingCompanyId: string;
};

export function InternalFinesPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    driver_uuid: "",
    reason_uuid: "",
    amount: 25,
    imposed_date: new Date().toISOString().slice(0, 10),
    status: "pending",
    notes: "",
  });

  const query = useQuery({
    queryKey: ["safety", "internal-fines", operatingCompanyId],
    queryFn: () => getInternalFines(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: () => createInternalFine(operatingCompanyId, form),
    onSuccess: async () => {
      setForm((prev) => ({ ...prev, notes: "" }));
      await queryClient.invalidateQueries({ queryKey: ["safety", "internal-fines", operatingCompanyId] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-6">
        <input value={form.driver_uuid} placeholder="driver_uuid" onChange={(e) => setForm((v) => ({ ...v, driver_uuid: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.reason_uuid} placeholder="reason_uuid" onChange={(e) => setForm((v) => ({ ...v, reason_uuid: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.amount} type="number" min={1} onChange={(e) => setForm((v) => ({ ...v, amount: Number(e.target.value || 0) }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.imposed_date} type="date" onChange={(e) => setForm((v) => ({ ...v, imposed_date: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="disputed">disputed</option>
        </select>
        <button type="button" className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white" disabled={!form.driver_uuid || !form.reason_uuid || createMutation.isPending} onClick={() => createMutation.mutate()}>
          + Create Internal Fine
        </button>
      </div>
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Reason</th>
              <th className="px-2 py-1 text-left">Amount</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Liability</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.fines ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.imposed_date ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.driver_id ?? "—")}</td>
                <td className="px-2 py-1">{String(row.reason_code ?? row.reason_name ?? "—")}</td>
                <td className="px-2 py-1">${Number(row.amount ?? 0).toFixed(2)}</td>
                <td className="px-2 py-1">{String(row.status ?? "pending")}</td>
                <td className="px-2 py-1">{String(row.driver_liability_id ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
