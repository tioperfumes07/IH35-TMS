/**
 * @archived — Safety active-path (V6.4)
 * Superseded by `tabs/ComplaintsTab.tsx` (safetyV64 create/patch/void) at `/safety/complaints`.
 * ARCHIVE-not-DELETE: retained for reference / deprecated SafetyHome.tsx cluster only.
 * Do not re-mount in routes/manifest.tsx. Sunset: 2026-09-01.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createComplaint, getComplaints } from "../../api/safety";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { companyToday } from "../../lib/businessDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = {
  operatingCompanyId: string;
  role?: string;
};

type ComplaintRow = Record<string, unknown>;

export function ComplaintsPage({ operatingCompanyId, role }: Props) {
  // SAF-B30 drill-through: EntityLink routes here with ?complaint_id=, but nothing read it, so the link
  // navigated and then did nothing — a facade. Same highlight pattern as TransfersListPage
  // (?transfer_id=), which is the in-repo precedent for a table-only surface with no drawer.
  const [searchParams] = useSearchParams();
  const deepLinkComplaintId = searchParams.get("complaint_id")?.trim() || "";
  const canView = useMemo(() => ["Owner", "Administrator", "Safety"].includes(String(role ?? "")), [role]);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    complaint_date: companyToday(),
    complainant_type: "external",
    // P1 complaint_consistency_failed — these three keys are the CONTRACT names. They were
    // developer-named uuid keys the endpoint does not accept, and the complainant name did not exist, so this
    // page POSTed a body the endpoint could not accept: `complaint_type` is REQUIRED by the zod schema,
    // and `validateConsistency` needs `respondent_driver_id` (type=driver) plus `complainant_external_name`
    // (type=external). Every create from this page failed.
    complainant_external_name: "",
    // The complainant dropdown offers driver/customer/employee/external/anonymous, but the payload only
    // ever carried a NAME — so "from Jorge" (a DRIVER complainant) could never satisfy the contract and
    // came back complaint_consistency_failed. Each type needs its own id field.
    complainant_driver_id: "",
    complainant_user_id: "",
    complainant_customer_id: "",
    respondent_type: "driver",
    respondent_driver_id: "",
    complaint_type: "",
    summary: "",
    severity: "medium",
  });

  const query = useQuery({
    queryKey: ["safety", "complaints", operatingCompanyId],
    queryFn: () => getComplaints(operatingCompanyId),
    enabled: Boolean(operatingCompanyId && canView),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      // Send the CONTRACT, not the form object. `complaint_date` is a plain YYYY-MM-DD and the schema's
      // `filed_at` is `.datetime()` — posting the raw form would fail zod on that alone, and the server
      // already defaults filed_at to now(), so it is deliberately omitted.
      createComplaint(operatingCompanyId, {
        complainant_type: form.complainant_type,
        ...(form.complainant_type === "anonymous" ? {} : { [complainantIdentityKey]: complainantIdentityValue }),
        respondent_type: form.respondent_type,
        respondent_driver_id: form.respondent_driver_id,
        complaint_type: form.complaint_type,
        summary: form.summary,
        severity: form.severity,
      }),
    onSuccess: async () => {
      setForm((prev) => ({ ...prev, summary: "" }));
      await queryClient.invalidateQueries({ queryKey: ["safety", "complaints", operatingCompanyId] });
    },
  });

  // Which identity field the server requires depends entirely on complainant_type (validateConsistency).
  const complainantIdentityKey =
    form.complainant_type === "driver"
      ? "complainant_driver_id"
      : form.complainant_type === "employee"
        ? "complainant_user_id"
        : form.complainant_type === "customer"
          ? "complainant_customer_id"
          : "complainant_external_name";
  const complainantIdentityValue = String((form as Record<string, string>)[complainantIdentityKey] ?? "");
  const complainantIdentityPlaceholder =
    form.complainant_type === "external" ? "Complainant name" : `Complainant ${form.complainant_type} id`;
  const complainantReady = form.complainant_type === "anonymous" || Boolean(complainantIdentityValue);

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
        <div>
          <label className="sr-only" htmlFor="safety-complaint-date">Complaint date</label>
          <DatePicker id="safety-complaint-date" value={form.complaint_date} onChange={(next) => setForm((v) => ({ ...v, complaint_date: next }))} className="" />
        </div>
        <SelectCombobox value={form.complainant_type} onChange={(e) => setForm((v) => ({ ...v, complainant_type: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs">
          <option value="driver">driver</option>
          <option value="customer">customer</option>
          <option value="employee">employee</option>
          <option value="external">external</option>
          <option value="anonymous">anonymous</option>
        </SelectCombobox>
        {form.complainant_type === "anonymous" ? null : (
          <input
            value={complainantIdentityValue}
            placeholder={complainantIdentityPlaceholder}
            onChange={(e) => setForm((v) => ({ ...v, [complainantIdentityKey]: e.target.value }))}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          />
        )}
        <input value={form.respondent_driver_id} placeholder="Respondent driver id" onChange={(e) => setForm((v) => ({ ...v, respondent_driver_id: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.complaint_type} placeholder="Complaint type" onChange={(e) => setForm((v) => ({ ...v, complaint_type: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs" />
        <input value={form.summary} placeholder="Summary" onChange={(e) => setForm((v) => ({ ...v, summary: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs" />
        <SelectCombobox value={form.severity} onChange={(e) => setForm((v) => ({ ...v, severity: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs">
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </SelectCombobox>
        <button type="button" className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white" disabled={!complainantReady || !form.respondent_driver_id || !form.complaint_type || !form.summary || createMutation.isPending} onClick={() => createMutation.mutate()}>
          + Create Complaint
        </button>
        {createMutation.isError ? (
          <p className="w-full text-xs text-red-700" data-testid="complaint-create-error">
            {userFacingApiError(createMutation.error, "Could not create the complaint.")}
          </p>
        ) : null}
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
          rowClassName={(row) =>
            deepLinkComplaintId && String(row.id) === deepLinkComplaintId ? "bg-slate-100 ring-1 ring-slate-400" : ""
          }
          loading={query.isLoading}
          emptyText="No complaints found."
          storageKey="safety-complaints"
          exportFilename="complaints"
        />
      )}
    </div>
  );
}
