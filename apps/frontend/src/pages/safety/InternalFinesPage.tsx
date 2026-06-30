import { useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createInternalFine, getInternalFines } from "../../api/safety";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { companyToday } from "../../lib/businessDate";

type Props = {
  operatingCompanyId: string;
};

export function InternalFinesPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    driver_uuid: "",
    reason_uuid: "",
    amount: 25,
    imposed_date: companyToday(),
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
        <input value={form.driver_uuid} placeholder="Search by driver" onChange={(e) => setForm((v) => ({ ...v, driver_uuid: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.reason_uuid} placeholder="Filter by reason" onChange={(e) => setForm((v) => ({ ...v, reason_uuid: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        {/* M-1 (GUARD inline FAIL): this is the inline-create fine AMOUNT (sent to createInternalFine as
            dollars; display is $row.amount.toFixed(2)). The old "Show 25" placeholder was misleading — it is
            money, not a row limit. dollars-mode MoneyInput; amount stays a DOLLAR number, byte-for-byte. */}
        <MoneyInput valueDollars={form.amount || null} onChangeDollars={(d) => setForm((v) => ({ ...v, amount: d ?? 0 }))} ariaLabel="Fine amount (USD)" placeholder="Amount (USD)" />
        <DatePicker value={form.imposed_date} onChange={(next) => setForm((v) => ({ ...v, imposed_date: next }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <SelectCombobox value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="disputed">Disputed</option>
        </SelectCombobox>
        <button type="button" className="rounded bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white" disabled={!form.driver_uuid || !form.reason_uuid || createMutation.isPending} onClick={() => createMutation.mutate()}>
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
                <td className="px-2 py-1">{toStatusLabel(String(row.status ?? "pending"))}</td>
                <td className="px-2 py-1">{String(row.driver_liability_id ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function toStatusLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "pending") return "Pending";
  if (normalized === "approved") return "Approved";
  if (normalized === "denied") return "Denied";
  if (normalized === "paid") return "Paid";
  if (normalized === "disputed") return "Disputed";
  return value || "Pending";
}
