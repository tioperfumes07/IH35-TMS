/**
 * @archived — Safety active-path (V6.4)
 * Superseded by `tabs/ComplaintsTab.tsx` (safetyV64 create/patch/void) at `/safety/complaints`.
 * ARCHIVE-not-DELETE: retained for reference / deprecated SafetyHome.tsx cluster only.
 * Do not re-mount in routes/manifest.tsx. Sunset: 2026-09-01.
 */
import { useMemo, useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createComplaint, getComplaints } from "../../api/safety";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { companyToday } from "../../lib/businessDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";

type Props = {
  operatingCompanyId: string;
  role?: string;
};

type ComplaintRow = Record<string, unknown>;

export function ComplaintsPage({ operatingCompanyId, role }: Props) {
  const canView = useMemo(() => ["Owner", "Administrator", "Safety"].includes(String(role ?? "")), [role]);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    complaint_date: companyToday(),
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

  const columns = useMemo<Array<ParityColumn<ComplaintRow>>>(
    () => [
      { key: "complaint_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.complaint_date as string) },
      { key: "complainant_type", label: "Complainant", sortable: true, render: (row) => String(row.complainant_type ?? "—") },
      {
        key: "respondent_type",
        label: "Respondent",
        render: (row) => `${String(row.respondent_type ?? "—")} · ${String(row.respondent_id ?? "—")}`,
      },
      { key: "type_code", label: "Type", sortable: true, render: (row) => String(row.type_code ?? "—") },
      { key: "summary", label: "Summary", render: (row) => String(row.summary ?? "—") },
      { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "open") },
    ],
    [],
  );

  if (!canView) {
    return <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">Complaints tab is restricted to Owner/Admin/Safety.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-7">
        <DatePicker value={form.complaint_date} onChange={(next) => setForm((v) => ({ ...v, complaint_date: next }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs" />
        <SelectCombobox value={form.complainant_type} onChange={(e) => setForm((v) => ({ ...v, complainant_type: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs">
          <option value="driver">driver</option>
          <option value="customer">customer</option>
          <option value="employee">employee</option>
          <option value="external">external</option>
          <option value="anonymous">anonymous</option>
        </SelectCombobox>
        <input value={form.respondent_uuid} placeholder="respondent_uuid" onChange={(e) => setForm((v) => ({ ...v, respondent_uuid: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.complaint_type_uuid} placeholder="complaint_type_uuid" onChange={(e) => setForm((v) => ({ ...v, complaint_type_uuid: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.summary} placeholder="Summary" onChange={(e) => setForm((v) => ({ ...v, summary: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs" />
        <SelectCombobox value={form.severity} onChange={(e) => setForm((v) => ({ ...v, severity: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs">
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </SelectCombobox>
        <button type="button" className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white" disabled={!form.respondent_uuid || !form.complaint_type_uuid || !form.summary || createMutation.isPending} onClick={() => createMutation.mutate()}>
          + Create Complaint
        </button>
      </div>
      {query.isError ? (
        <ListErrorState
          title="Couldn't load complaints"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable<ComplaintRow>
          columns={columns}
          rows={query.data?.complaints ?? []}
          rowKey={(row) => String(row.id)}
          loading={query.isLoading}
          emptyText="No complaints found."
          storageKey="safety-complaints"
          exportFilename="complaints"
        />
      )}
    </div>
  );
}
