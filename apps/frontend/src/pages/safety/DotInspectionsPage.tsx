import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDotInspection, getDotInspections } from "../../api/safety";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type Props = {
  operatingCompanyId: string;
};

export function DotInspectionsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    inspection_date: new Date().toISOString().slice(0, 10),
    inspector_name: "",
    inspection_level: 1,
    outcome: "PASS",
    notes: "",
  });

  const query = useQuery({
    queryKey: ["safety", "dot-inspections", operatingCompanyId],
    queryFn: () => getDotInspections(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: () => createDotInspection(operatingCompanyId, form),
    onSuccess: async () => {
      setForm({ inspection_date: new Date().toISOString().slice(0, 10), inspector_name: "", inspection_level: 1, outcome: "PASS", notes: "" });
      await queryClient.invalidateQueries({ queryKey: ["safety", "dot-inspections", operatingCompanyId] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-5">
        <input value={form.inspection_date} type="date" onChange={(e) => setForm((v) => ({ ...v, inspection_date: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.inspector_name} placeholder="Inspector name" onChange={(e) => setForm((v) => ({ ...v, inspector_name: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.inspection_level} type="number" min={1} max={6} onChange={(e) => setForm((v) => ({ ...v, inspection_level: Number(e.target.value || 1) }))} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <SelectCombobox value={form.outcome} onChange={(e) => setForm((v) => ({ ...v, outcome: e.target.value }))} className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="PASS">PASS</option>
          <option value="WARNING">WARNING</option>
          <option value="OOS">OOS</option>
        </SelectCombobox>
        <button type="button" onClick={() => createMutation.mutate()} disabled={!form.inspector_name.trim() || createMutation.isPending} className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white">
          + Create DOT Inspection
        </button>
      </div>
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Inspector</th>
              <th className="px-2 py-1 text-left">Level</th>
              <th className="px-2 py-1 text-left">Outcome</th>
              <th className="px-2 py-1 text-left">Spawned WO</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.inspections ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.inspection_date ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.inspector_name ?? "—")}</td>
                <td className="px-2 py-1">{String(row.inspection_level ?? "—")}</td>
                <td className="px-2 py-1">{String(row.outcome ?? "—")}</td>
                <td className="px-2 py-1">{String(row.spawned_wo_id ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
