import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { EntityLink } from "../../../components/shared/EntityLink";
import { formatDateUS } from "../../../lib/formatDate";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { createComplaintV64, listComplaints, patchComplaintV64, voidComplaintV64 } from "../../../api/safetyV64";
import { listComplaintTypes } from "../../../api/catalogs-safety";
import { useAuth } from "../../../auth/useAuth";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { useListState } from "../../../components/list-state";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

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

  // Complaint-types catalog (catalogs.complaint_types) — the same source as /lists/safety/complaint-types.
  // We store the stable type_code into the v6.4 complaint_type field.
  const complaintTypesQuery = useQuery({
    queryKey: ["safety-v64", "complaint-types", companyId],
    queryFn: () => listComplaintTypes(companyId, { is_active: "true", limit: 200 }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const complaintTypeByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of complaintTypesQuery.data?.rows ?? []) {
      map.set(String(t.type_code), String(t.type_name));
    }
    return map;
  }, [complaintTypesQuery.data]);

  const complaintTypeOptions = useMemo(
    () =>
      (complaintTypesQuery.data?.rows ?? []).map((t) => ({
        value: String(t.type_code),
        label: String(t.type_name),
        type: String(t.type_code),
      })),
    [complaintTypesQuery.data]
  );

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

  // SAF-F11: void is reason-required (owner-gated, evidentiary record).
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidComplaintV64(companyId, id, reason),
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

  // LIST-EMPTY: the empty message renders only after the complaints query settles.
  const listState = useListState(complaintsQuery, (complaintsQuery.data?.complaints ?? []).length === 0);

  function resolveRespondent(row: Record<string, unknown>) {
    const driverId = row.respondent_driver_id ? String(row.respondent_driver_id) : "";
    if (driverId) {
      return <EntityLink kind="driver" id={driverId} />;
    }
    if (row.respondent_user_id) return <span>{String(row.respondent_user_id)}</span>;
    return <span>—</span>;
  }

  function resolveType(row: Record<string, unknown>) {
    const code = row.complaint_type ? String(row.complaint_type) : "";
    if (!code) return "—";
    return complaintTypeByCode.get(code) ?? code;
  }

  const columns: Array<ParityColumn<Record<string, unknown>>> = [
    { key: "filed_at", label: "Filed", sortable: true, render: (row) => formatDateUS(row.filed_at) },
    { key: "complainant_external_name", label: "Complainant", sortable: true, render: (row) => String(row.complainant_external_name ?? row.complainant_type ?? "—") },
    { key: "respondent", label: "Respondent", render: (row) => resolveRespondent(row) },
    { key: "complaint_type", label: "Type", sortable: true, render: (row) => resolveType(row) },
    { key: "severity", label: "Severity", sortable: true, render: (row) => String(row.severity ?? "—") },
    { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "open") },
    {
      key: "action",
      label: "Actions",
      render: (row) =>
        isOwner ? (
          <>
            <button
              type="button"
              className="mr-2 text-slate-700 underline disabled:opacity-60"
              disabled={patchMutation.isPending}
              onClick={() => patchMutation.mutate({ id: String(row.id), status: "resolved" })}
            >
              Resolve
            </button>
            <button
              type="button"
              className="text-red-700 underline disabled:opacity-60"
              disabled={voidMutation.isPending || Boolean(row.voided_at)}
              onClick={() => setVoidTargetId(String(row.id))}
            >
              {row.voided_at ? "Voided" : "Void"}
            </button>
          </>
        ) : (
          <span className="text-slate-400">Owner-only</span>
        ),
    },
  ];

  if (isPrivacyGateError(complaintsQuery.error)) {
    return (
      <div className="rounded-sm border border-slate-200 bg-slate-50 p-6 text-center">
        <Lock className="mx-auto h-5 w-5 text-slate-700" />
        <p className="mt-2 text-sm font-semibold text-slate-700">This area is restricted to Owner / Admin / Safety roles. Contact your administrator if you need access.</p>
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
            <DriverPickerWithCreate
              operatingCompanyId={companyId}
              value={form.respondent_driver_id || null}
              onChange={(next) => setForm((v) => ({ ...v, respondent_driver_id: next ?? "" }))}
              placeholder="Respondent driver"
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
            />
            {/*
              LST-PICKER-01: ReferenceSelect first-row create → POST catalogs.complaint_types.
              Options keyed by type_code (createdValueField=code) — v6.4 stores the code.
            */}
            <ReferenceSelect
              value={form.complaint_type || null}
              onChange={(next) => setForm((v) => ({ ...v, complaint_type: next ?? "" }))}
              options={complaintTypeOptions}
              createKind="complaint_type"
              operatingCompanyId={companyId}
              createdValueField="code"
              placeholder={complaintTypesQuery.isLoading ? "Loading types…" : "Type"}
              loading={complaintTypesQuery.isLoading}
              onOptionCreated={() => {
                void queryClient.invalidateQueries({ queryKey: ["safety-v64", "complaint-types", companyId] });
              }}
            />
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

      <ParityTable<Record<string, unknown>>
        columns={columns}
        rows={complaintsQuery.data?.complaints ?? []}
        rowKey={(row) => String(row.id)}
        loading={listState.isLoading}
        emptyText="No complaints found."
        storageKey="safety-complaints"
        exportFilename="complaints"
      />
      <VoidReasonModal
        open={voidTargetId !== null}
        title="Void Complaint"
        entityRef={voidTargetId ? `Complaint ${voidTargetId}` : undefined}
        postsReversingEntry={false}
        onClose={() => setVoidTargetId(null)}
        onSubmit={async (reason) => {
          if (!voidTargetId) return;
          await voidMutation.mutateAsync({ id: voidTargetId, reason });
          setVoidTargetId(null);
        }}
      />
    </div>
  );
}
