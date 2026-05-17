import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { createHosViolation, listHosViolations, voidHosViolation } from "../../../api/safetyV64";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

export function HOSViolationsTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    driver_id: "",
    violation_code: "",
    violation_description: "",
    occurred_at: new Date().toISOString(),
    source: "manual" as "manual" | "eld_import" | "dot_inspection",
    duty_status: "",
    severity: "medium" as "low" | "medium" | "high" | "critical",
    notes: "",
  });

  const query = useQuery({
    queryKey: ["safety-v64", "hos-violations", companyId],
    queryFn: () => listHosViolations(companyId),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createHosViolation(companyId, {
        driver_id: form.driver_id,
        violation_code: form.violation_code,
        violation_description: form.violation_description || undefined,
        occurred_at: form.occurred_at,
        source: form.source,
        duty_status: form.duty_status || undefined,
        severity: form.severity,
        notes: form.notes || undefined,
      }),
    onSuccess: async () => {
      setForm((prev) => ({ ...prev, violation_code: "", violation_description: "", notes: "" }));
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "hos-violations", companyId] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidHosViolation(companyId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "hos-violations", companyId] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-8">
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="driver_id" value={form.driver_id} onChange={(e) => setForm((v) => ({ ...v, driver_id: e.target.value }))} />
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Violation type" value={form.violation_code} onChange={(e) => setForm((v) => ({ ...v, violation_code: e.target.value }))} />
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Description" value={form.violation_description} onChange={(e) => setForm((v) => ({ ...v, violation_description: e.target.value }))} />
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" type="datetime-local" value={form.occurred_at.slice(0, 16)} onChange={(e) => setForm((v) => ({ ...v, occurred_at: new Date(e.target.value).toISOString() }))} />
        <SelectCombobox className="rounded border border-gray-300 px-2 py-1 text-xs" value={form.source} onChange={(e) => setForm((v) => ({ ...v, source: e.target.value as typeof form.source }))}>
          <option value="manual">manual_office</option>
          <option value="eld_import">samsara_auto</option>
          <option value="dot_inspection">dot_citation</option>
        </SelectCombobox>
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Duration/status" value={form.duty_status} onChange={(e) => setForm((v) => ({ ...v, duty_status: e.target.value }))} />
        <SelectCombobox className="rounded border border-gray-300 px-2 py-1 text-xs" value={form.severity} onChange={(e) => setForm((v) => ({ ...v, severity: e.target.value as typeof form.severity }))}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </SelectCombobox>
        <button
          type="button"
          className="rounded bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
          disabled={!form.driver_id || !form.violation_code || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          + Create
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Violation Type</th>
              <th className="px-2 py-1 text-left">Occurred</th>
              <th className="px-2 py-1 text-left">Source</th>
              <th className="px-2 py-1 text-left">Duration</th>
              <th className="px-2 py-1 text-left">CSA Pts</th>
              <th className="px-2 py-1 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.hos_violations ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.driver_id ?? "—")}</td>
                <td className="px-2 py-1">{String(row.violation_code ?? row.violation_type ?? "—")}</td>
                <td className="px-2 py-1">{String(row.occurred_at ?? "").slice(0, 16).replace("T", " ")}</td>
                <td className="px-2 py-1">{String(row.source ?? "—")}</td>
                <td className="px-2 py-1">{String(row.duty_status ?? row.duration_minutes ?? "—")}</td>
                <td className="px-2 py-1">{String(row.csa_points ?? "0")}</td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    className="text-red-700 underline disabled:opacity-50"
                    disabled={Boolean(row.voided_at) || voidMutation.isPending}
                    onClick={() => voidMutation.mutate(String(row.id))}
                  >
                    {row.voided_at ? "Voided" : "Void"}
                  </button>
                </td>
              </tr>
            ))}
            {(query.data?.hos_violations ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-slate-500">
                  No HOS violations found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
