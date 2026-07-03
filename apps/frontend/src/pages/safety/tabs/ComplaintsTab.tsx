import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDateUS } from "../../../lib/formatDate";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { createComplaintV64, listComplaints, patchComplaintV64, voidComplaintV64 } from "../../../api/safetyV64";
import { listComplaintTypes } from "../../../api/catalogs-safety";
import { listDrivers } from "../../../api/mdata";
import { useAuth } from "../../../auth/useAuth";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

function isPrivacyGateError(error: unknown) {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== 403) return false;
  return String((error.data as { error?: string })?.error ?? "") === "E_COMPLAINT_PRIVACY_GATED";
}

// "LAST, First" display for a driver row (mdata.drivers has first_name/last_name, never full_name).
function driverLabel(first?: string | null, last?: string | null) {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (l && f) return `${l.toUpperCase()}, ${f}`;
  if (l) return l.toUpperCase();
  if (f) return f;
  return "";
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

  // Company-scoped driver roster for the respondent picker. operating_company_id is REQUIRED and we
  // pass limit:200 so the roster is not silently truncated to the newest 50 (driver-picker 50-cap).
  const driversQuery = useQuery({
    queryKey: ["safety-v64", "complaints-driver-roster", companyId],
    queryFn: () => listDrivers({ operating_company_id: companyId, limit: 200 }),
    enabled: Boolean(companyId),
    retry: false,
  });

  // Complaint-types catalog (catalogs.complaint_types) — the same source as /lists/safety/complaint-types.
  // We store the stable type_code into the v6.4 complaint_type field.
  const complaintTypesQuery = useQuery({
    queryKey: ["safety-v64", "complaint-types", companyId],
    queryFn: () => listComplaintTypes(companyId, { is_active: "true", limit: 200 }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const driverById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of driversQuery.data?.drivers ?? []) {
      map.set(String(d.id), driverLabel(d.first_name, d.last_name) || String(d.id));
    }
    return map;
  }, [driversQuery.data]);

  const driverOptions = useMemo(() => {
    return (driversQuery.data?.drivers ?? [])
      .map((d) => ({ id: String(d.id), label: driverLabel(d.first_name, d.last_name) || String(d.id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [driversQuery.data]);

  const complaintTypeByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of complaintTypesQuery.data?.rows ?? []) {
      map.set(String(t.type_code), String(t.type_name));
    }
    return map;
  }, [complaintTypesQuery.data]);

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
      setForm((prev) => ({ ...prev, respondent_driver_id: "", complaint_type: "", summary: "" }));
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

  // No silent disable: enumerate which required fields are still missing so the disabled + Create
  // control always explains itself (locked rule — a disabled control must state why).
  const missingFields: string[] = [];
  if (!form.complainant_external_name) missingFields.push("Complainant");
  if (!form.respondent_driver_id) missingFields.push("Respondent driver");
  if (!form.complaint_type) missingFields.push("Type");
  if (!form.summary) missingFields.push("Summary");
  const createDisabled = missingFields.length > 0 || createMutation.isPending;

  function resolveRespondent(row: Record<string, unknown>) {
    const driverId = row.respondent_driver_id ? String(row.respondent_driver_id) : "";
    if (driverId) {
      const name = driverById.get(driverId);
      if (name) return <span>{name}</span>;
      return (
        <span className="text-slate-500" title={driverId}>
          {driverId.slice(0, 8)}…
        </span>
      );
    }
    if (row.respondent_user_id) return <span>{String(row.respondent_user_id)}</span>;
    return <span>—</span>;
  }

  function resolveType(row: Record<string, unknown>) {
    const code = row.complaint_type ? String(row.complaint_type) : "";
    if (!code) return "—";
    return complaintTypeByCode.get(code) ?? code;
  }

  if (isPrivacyGateError(complaintsQuery.error)) {
    return (
      <div className="rounded-sm border border-amber-200 bg-amber-50 p-6 text-center">
        <Lock className="mx-auto h-5 w-5 text-amber-700" />
        <p className="mt-2 text-sm font-semibold text-amber-900">This area is restricted to Owner / Admin / Safety roles. Contact your administrator if you need access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs">
        <Lock className="h-4 w-4 text-slate-500" />
        <span className="font-semibold text-slate-700">Privacy-gated complaints workflow</span>
      </div>
      {canCreate ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="grid gap-2 md:grid-cols-6">
            <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" placeholder="Complainant" value={form.complainant_external_name} onChange={(e) => setForm((v) => ({ ...v, complainant_external_name: e.target.value }))} />
            <SelectCombobox className="rounded-sm border border-gray-300 px-2 py-1 text-xs" value={form.respondent_driver_id} onChange={(e) => setForm((v) => ({ ...v, respondent_driver_id: e.target.value }))}>
              <option value="" disabled>
                {driversQuery.isLoading ? "Loading drivers…" : "Respondent driver"}
              </option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </SelectCombobox>
            <SelectCombobox className="rounded-sm border border-gray-300 px-2 py-1 text-xs" value={form.complaint_type} onChange={(e) => setForm((v) => ({ ...v, complaint_type: e.target.value }))}>
              <option value="" disabled>
                {complaintTypesQuery.isLoading ? "Loading types…" : "Type"}
              </option>
              {(complaintTypesQuery.data?.rows ?? []).map((t) => (
                <option key={t.id} value={t.type_code}>
                  {t.type_name}
                </option>
              ))}
            </SelectCombobox>
            <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" placeholder="Summary" value={form.summary} onChange={(e) => setForm((v) => ({ ...v, summary: e.target.value }))} />
            <SelectCombobox className="rounded-sm border border-gray-300 px-2 py-1 text-xs" value={form.severity} onChange={(e) => setForm((v) => ({ ...v, severity: e.target.value as typeof form.severity }))}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </SelectCombobox>
            <button type="button" className="rounded-sm bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60" disabled={createDisabled} onClick={() => createMutation.mutate()}>
              + Create
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            {missingFields.length > 0 ? (
              <span className="text-slate-500">Add {missingFields.join(", ")} to file this complaint.</span>
            ) : (
              <span className="text-slate-400">Ready to file.</span>
            )}
            <Link to="/lists/safety/complaint-types" className="text-slate-700 underline">
              Manage types
            </Link>
          </div>
          {createMutation.isError ? (
            <p className="mt-1 text-[11px] text-red-700">
              {createMutation.error instanceof ApiError ? String((createMutation.error.data as { error?: string })?.error ?? "Could not file complaint.") : "Could not file complaint."}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
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
                <td className="px-2 py-1">{formatDateUS(row.filed_at)}</td>
                <td className="px-2 py-1">{String(row.complainant_external_name ?? row.complainant_type ?? "—")}</td>
                <td className="px-2 py-1">{resolveRespondent(row)}</td>
                <td className="px-2 py-1">{resolveType(row)}</td>
                <td className="px-2 py-1">{String(row.severity ?? "—")}</td>
                <td className="px-2 py-1">{String(row.status ?? "open")}</td>
                <td className="px-2 py-1">
                  {isOwner ? (
                    <>
                      <button type="button" className="mr-2 text-slate-700 underline disabled:opacity-60" disabled={patchMutation.isPending} onClick={() => patchMutation.mutate({ id: String(row.id), status: "resolved" })}>
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
