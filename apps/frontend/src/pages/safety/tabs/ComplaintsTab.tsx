import { Lock } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { createComplaintV64, listComplaints, patchComplaintV64, voidComplaintV64 } from "../../../api/safetyV64";
import { useAuth } from "../../../auth/useAuth";
import { useCompanyContext } from "../../../contexts/CompanyContext";

function isPrivacyGateError(error: unknown) {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== 403) return false;
  return String((error.data as { error?: string })?.error ?? "") === "E_COMPLAINT_PRIVACY_GATED";
}

export function ComplaintsTab() {
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const isOwner = auth.user?.role === "Owner";
  const canCreate = ["Owner", "Administrator", "Safety"].includes(String(auth.user?.role ?? ""));
  const [form, setForm] = useState({
    complainant_external_name: "",
    respondent_driver_id: "",
    complaint_type: "",
    summary: "",
    severity: "medium" as "low" | "medium" | "high" | "critical",
  });

  const complaintsQuery = useQuery({
    queryKey: ["safety-v64", "complaints", companyId],
    queryFn: () => listComplaints(companyId),
    enabled: Boolean(companyId),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createComplaintV64(companyId, {
        complainant_type: "external",
        complainant_external_name: form.complainant_external_name,
        respondent_type: "driver",
        respondent_driver_id: form.respondent_driver_id,
        complaint_type: form.complaint_type,
        summary: form.summary,
        severity: form.severity,
      }),
    onSuccess: async () => {
      setForm((prev) => ({ ...prev, complaint_type: "", summary: "" }));
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "complaints", companyId] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => patchComplaintV64(companyId, id, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "complaints", companyId] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidComplaintV64(companyId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "complaints", companyId] });
    },
  });

  if (isPrivacyGateError(complaintsQuery.error)) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-6 text-center">
        <Lock className="mx-auto h-5 w-5 text-amber-700" />
        <p className="mt-2 text-sm font-semibold text-amber-900">This area is restricted to Owner / Admin / Safety roles. Contact your administrator if you need access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-xs">
        <Lock className="h-4 w-4 text-slate-500" />
        <span className="font-semibold text-slate-700">Privacy-gated complaints workflow</span>
      </div>
      {canCreate ? (
        <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-6">
          <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Complainant" value={form.complainant_external_name} onChange={(e) => setForm((v) => ({ ...v, complainant_external_name: e.target.value }))} />
          <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Respondent driver_id" value={form.respondent_driver_id} onChange={(e) => setForm((v) => ({ ...v, respondent_driver_id: e.target.value }))} />
          <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Type" value={form.complaint_type} onChange={(e) => setForm((v) => ({ ...v, complaint_type: e.target.value }))} />
          <input className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Summary" value={form.summary} onChange={(e) => setForm((v) => ({ ...v, summary: e.target.value }))} />
          <select className="rounded border border-gray-300 px-2 py-1 text-xs" value={form.severity} onChange={(e) => setForm((v) => ({ ...v, severity: e.target.value as typeof form.severity }))}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
          <button type="button" className="rounded bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60" disabled={!form.complainant_external_name || !form.respondent_driver_id || !form.complaint_type || !form.summary || createMutation.isPending} onClick={() => createMutation.mutate()}>
            + Create
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Filed</th>
              <th className="px-2 py-1 text-left">Complainant</th>
              <th className="px-2 py-1 text-left">Respondent</th>
              <th className="px-2 py-1 text-left">Type</th>
              <th className="px-2 py-1 text-left">Severity</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(complaintsQuery.data?.complaints ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.filed_at ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.complainant_external_name ?? row.complainant_type ?? "—")}</td>
                <td className="px-2 py-1">{String(row.respondent_driver_id ?? row.respondent_user_id ?? "—")}</td>
                <td className="px-2 py-1">{String(row.complaint_type ?? "—")}</td>
                <td className="px-2 py-1">{String(row.severity ?? "—")}</td>
                <td className="px-2 py-1">{String(row.status ?? "open")}</td>
                <td className="px-2 py-1">
                  {isOwner ? (
                    <>
                      <button type="button" className="mr-2 text-blue-700 underline disabled:opacity-60" disabled={patchMutation.isPending} onClick={() => patchMutation.mutate({ id: String(row.id), status: "resolved" })}>
                        Resolve
                      </button>
                      <button type="button" className="text-red-700 underline disabled:opacity-60" disabled={voidMutation.isPending || Boolean(row.voided_at)} onClick={() => voidMutation.mutate(String(row.id))}>
                        {row.voided_at ? "Voided" : "Void"}
                      </button>
                    </>
                  ) : (
                    <span className="text-slate-400">Owner-only</span>
                  )}
                </td>
              </tr>
            ))}
            {(complaintsQuery.data?.complaints ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-slate-500">
                  No complaints found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
