import { useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { createDotInspection, listDotInspections, uploadDotInspectionPdf, voidDotInspection } from "../../../api/safetyV64";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

export function DOTInspectionsTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    inspection_date: new Date().toISOString().slice(0, 10),
    driver_id: "",
    unit_id: "",
    inspector_name: "",
    inspection_level: 1,
    outcome: "PASS" as "PASS" | "WARNING" | "OOS",
    location: "",
    notes: "",
    csa_points: 0,
  });

  const query = useQuery({
    queryKey: ["safety-v64", "dot-inspections", companyId],
    queryFn: () => listDotInspections(companyId),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (form.outcome === "OOS") {
        const confirmed = window.confirm("An OOS inspection will auto-spawn a maintenance WO. Confirm?");
        if (!confirmed) return null;
      }
      return createDotInspection(companyId, {
        inspection_date: form.inspection_date,
        driver_id: form.driver_id || undefined,
        unit_id: form.unit_id || undefined,
        inspector_name: form.inspector_name,
        inspection_level: form.inspection_level,
        outcome: form.outcome,
        location: form.location || undefined,
        notes: form.notes || undefined,
        csa_points_vehicle_maintenance: form.csa_points,
      });
    },
    onSuccess: async () => {
      setForm((prev) => ({ ...prev, inspector_name: "", notes: "", csa_points: 0 }));
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "dot-inspections", companyId] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidDotInspection(companyId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "dot-inspections", companyId] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadDotInspectionPdf(companyId, id, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "dot-inspections", companyId] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-9">
        <DatePicker className="rounded border border-gray-300 px-2 py-1 text-xs" value={form.inspection_date} onChange={(next) => setForm((v) => ({ ...v, inspection_date: next }))} />
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="driver_id" value={form.driver_id} onChange={(e) => setForm((v) => ({ ...v, driver_id: e.target.value }))} />
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="unit_id" value={form.unit_id} onChange={(e) => setForm((v) => ({ ...v, unit_id: e.target.value }))} />
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Inspector" value={form.inspector_name} onChange={(e) => setForm((v) => ({ ...v, inspector_name: e.target.value }))} />
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" type="number" min={1} max={6} value={form.inspection_level} onChange={(e) => setForm((v) => ({ ...v, inspection_level: Number(e.target.value || 1) }))} />
        <SelectCombobox className="rounded border border-gray-300 px-2 py-1 text-xs" value={form.outcome} onChange={(e) => setForm((v) => ({ ...v, outcome: e.target.value as typeof form.outcome }))}>
          <option value="PASS">PASS</option>
          <option value="WARNING">WARNING</option>
          <option value="OOS">OOS</option>
        </SelectCombobox>
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Location" value={form.location} onChange={(e) => setForm((v) => ({ ...v, location: e.target.value }))} />
        <input className="rounded border border-gray-300 px-2 py-1 text-xs" type="number" min={0} placeholder="CSA pts" value={form.csa_points} onChange={(e) => setForm((v) => ({ ...v, csa_points: Number(e.target.value || 0) }))} />
        <button type="button" className="rounded bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60" disabled={!form.inspector_name || createMutation.isPending} onClick={() => createMutation.mutate()}>
          + Create
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Unit</th>
              <th className="px-2 py-1 text-left">Level</th>
              <th className="px-2 py-1 text-left">Outcome</th>
              <th className="px-2 py-1 text-left">CSA Pts</th>
              <th className="px-2 py-1 text-left">WO Spawned</th>
              <th className="px-2 py-1 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.dot_inspections ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.inspection_date ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.driver_id ?? "—")}</td>
                <td className="px-2 py-1">{String(row.unit_id ?? "—")}</td>
                <td className="px-2 py-1">{String(row.fmcsa_level ?? "—")}</td>
                <td className="px-2 py-1">{String(row.outcome ?? "—")}</td>
                <td className="px-2 py-1">{String(row.csa_points ?? "0")}</td>
                <td className="px-2 py-1">{String(row.auto_spawned_wo_id ?? "—")}</td>
                <td className="px-2 py-1">
                  <label className="mr-2 inline-flex cursor-pointer items-center text-blue-700 underline">
                    PDF
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        uploadMutation.mutate({ id: String(row.id), file });
                      }}
                    />
                  </label>
                  <button type="button" className="text-red-700 underline disabled:opacity-50" disabled={Boolean(row.voided_at) || voidMutation.isPending} onClick={() => voidMutation.mutate(String(row.id))}>
                    {row.voided_at ? "Voided" : "Void"}
                  </button>
                </td>
              </tr>
            ))}
            {(query.data?.dot_inspections ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-3 text-center text-slate-500">
                  No DOT inspections found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
