import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createComplaint, getComplaints } from "../../api/safety";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type Props = {
  operatingCompanyId: string;
  role?: string;
};

export function ComplaintsPage({ operatingCompanyId, role }: Props) {
  const canView = useMemo(() => ["Owner", "Administrator", "Safety"].includes(String(role ?? "")), [role]);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    complaint_date: new Date().toISOString().slice(0, 10),
    complainant_type: "external",
    respondent_type: "driver",
    respondent_uuid: "",
    complaint_type_uuid: "",
    summary: "",
    severity: "medium",
  });

  const query = useQuery({
    queryKey: ["safety", "complaints", operatingCompanyId],
    queryFn: () => getComplaints(operatingCompanyId),
    enabled: Boolean(operatingCompanyId && canView),
  });

  const createMutation = useMutation({
    mutationFn: () => createComplaint(operatingCompanyId, form),
    onSuccess: async () => {
      setForm((prev) => ({ ...prev, summary: "" }));
      await queryClient.invalidateQueries({ queryKey: ["safety", "complaints", operatingCompanyId] });
    },
  });

  if (!canView) {
    return <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Complaints tab is restricted to Owner/Admin/Safety.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-7">
        <input type="date" value={form.complaint_date} onChange={(e) => setForm((v) => ({ ...v, complaint_date: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <SelectCombobox value={form.complainant_type} onChange={(e) => setForm((v) => ({ ...v, complainant_type: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="driver">driver</option>
          <option value="customer">customer</option>
          <option value="employee">employee</option>
          <option value="external">external</option>
          <option value="anonymous">anonymous</option>
        </SelectCombobox>
        <input value={form.respondent_uuid} placeholder="respondent_uuid" onChange={(e) => setForm((v) => ({ ...v, respondent_uuid: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.complaint_type_uuid} placeholder="complaint_type_uuid" onChange={(e) => setForm((v) => ({ ...v, complaint_type_uuid: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.summary} placeholder="Summary" onChange={(e) => setForm((v) => ({ ...v, summary: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <SelectCombobox value={form.severity} onChange={(e) => setForm((v) => ({ ...v, severity: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </SelectCombobox>
        <button type="button" className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white" disabled={!form.respondent_uuid || !form.complaint_type_uuid || !form.summary || createMutation.isPending} onClick={() => createMutation.mutate()}>
          + Create Complaint
        </button>
      </div>
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Complainant</th>
              <th className="px-2 py-1 text-left">Respondent</th>
              <th className="px-2 py-1 text-left">Type</th>
              <th className="px-2 py-1 text-left">Summary</th>
              <th className="px-2 py-1 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.complaints ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.complaint_date ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.complainant_type ?? "—")}</td>
                <td className="px-2 py-1">{String(row.respondent_type ?? "—")} · {String(row.respondent_id ?? "—")}</td>
                <td className="px-2 py-1">{String(row.type_code ?? "—")}</td>
                <td className="px-2 py-1">{String(row.summary ?? "—")}</td>
                <td className="px-2 py-1">{String(row.status ?? "open")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
