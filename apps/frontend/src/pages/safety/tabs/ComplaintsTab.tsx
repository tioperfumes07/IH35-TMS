import { Lock } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../../components/shared/EntityLink";
import { formatDateUS } from "../../../lib/formatDate";
import { entityLabel } from "../../../lib/entity-label";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { createComplaintV64, listComplaints, patchComplaintV64, voidComplaintV64 } from "../../../api/safetyV64";
import { listComplaintTypes } from "../../../api/catalogs-safety";
import { listAssignableUsers } from "../../../api/identity";
import { useAuth } from "../../../auth/useAuth";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { useListState } from "../../../components/list-state";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { CappedListNotice } from "../../../components/CappedListNotice";
import { Button } from "../../../components/Button";
import { useStagedListFilters } from "../../../components/table";
import { userFacingApiError } from "../../../lib/api-error-message";

function isPrivacyGateError(error: unknown) {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== 403) return false;
  return String((error.data as { error?: string })?.error ?? "") === "E_COMPLAINT_PRIVACY_GATED";
}

type ComplainantType = "external" | "driver" | "employee" | "customer" | "anonymous";
type RespondentType = "driver" | "employee";

const EMPTY_FILTERS = { driverId: "" };
const EMPTY_COMPLAINT_FORM = {
  complainant_type: "external" as ComplainantType,
  complainant_external_name: "",
  complainant_driver_id: "",
  complainant_user_id: "",
  complainant_customer_id: "",
  respondent_type: "driver" as RespondentType,
  respondent_driver_id: "",
  respondent_user_id: "",
  complaint_type_id: "",
  summary: "",
  severity: "medium" as "low" | "medium" | "high" | "critical",
};

export function ComplaintsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedComplaintId = searchParams.get("complaint_id")?.trim() ?? "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  // LST-F5163I + LST-F5191: visible reverse driver filter must write ?driver_id= on Apply.
  // LV-SAFETY-COMPLAINTS-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  function patchSearchParam(next: { driverId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.driverId) p.set("driver_id", next.driverId);
    else p.delete("driver_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchSearchParam(next);
    },
  });
  const draft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({ ...prev, driverId: driverIdFromUrl }));
  }, [driverIdFromUrl]);

  // Sibling verify-complaints-driver-names asserts setDriverFilter name — stages draft only.
  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }

  const effectiveDriverId = applied.driverId.trim() || undefined;
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const isOwner = auth.user?.role === "Owner";
  const canCreate = ["Owner", "Administrator", "Safety"].includes(String(auth.user?.role ?? ""));
  const [form, setForm] = useState(EMPTY_COMPLAINT_FORM);
  const lifecycleGenerationRef = useRef(0);
  const pageSize = 25;
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [companyId, effectiveDriverId]);

  const complaintsQuery = useQuery({
    queryKey: ["safety-v64", "complaints", companyId, effectiveDriverId, page],
    queryFn: () =>
      listComplaints(companyId, {
        driver_id: effectiveDriverId,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const [complaintTypeSearch, setComplaintTypeSearch] = useState("");
  const complaintTypesQuery = useQuery({
    queryKey: ["safety-v64", "complaint-types", companyId, complaintTypeSearch],
    queryFn: () =>
      listComplaintTypes(companyId, {
        is_active: "true",
        limit: 200,
        search: complaintTypeSearch || undefined,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  // SAF-F6979: never retain cached complaint-type choices after the current
  // company-scoped search fails. Retry must succeed before selection resumes.
  const complaintTypeRows = complaintTypesQuery.isError ? [] : (complaintTypesQuery.data?.rows ?? []);

  const usersQuery = useQuery({
    queryKey: ["identity", "assignable-users", "complaints", companyId],
    queryFn: ({ signal }) => listAssignableUsers(companyId, signal),
    enabled: canCreate && Boolean(companyId),
    staleTime: 60_000,
  });

  const complaintTypeByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of complaintTypeRows) {
      map.set(String(t.type_code), String(t.type_name));
    }
    return map;
  }, [complaintTypeRows]);

  const complaintTypeOptions = useMemo(
    () =>
      complaintTypeRows.map((t) => ({
        value: String(t.id),
        label: String(t.type_name),
        type: String(t.type_code),
      })),
    [complaintTypeRows]
  );

  const userOptions = useMemo(
    () =>
      (usersQuery.data?.users ?? [])
        .filter((u) => !u.deactivated_at)
        .map((u) => ({
          value: String(u.id),
          label: entityLabel(u.name || u.email, u.id, "User"),
        })),
    [usersQuery.data]
  );

  const complainantIdentityKey =
    form.complainant_type === "driver"
      ? "complainant_driver_id"
      : form.complainant_type === "employee"
        ? "complainant_user_id"
        : form.complainant_type === "customer"
          ? "complainant_customer_id"
          : "complainant_external_name";
  const complainantIdentityValue = String((form as Record<string, string>)[complainantIdentityKey] ?? "");
  const complainantReady = form.complainant_type === "anonymous" || Boolean(complainantIdentityValue);
  const respondentReady =
    form.respondent_type === "driver" ? Boolean(form.respondent_driver_id) : Boolean(form.respondent_user_id);

  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; payload: Record<string, unknown> }) =>
      createComplaintV64(input.companyId, input.payload),
    onSuccess: async (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      setForm(EMPTY_COMPLAINT_FORM);
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "complaints", input.companyId] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: (input: { id: string; status: string; companyId: string; generation: number }) => patchComplaintV64(input.companyId, input.id, { status: input.status }),
    onSuccess: async (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "complaints", input.companyId] });
    },
  });

  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const voidMutation = useMutation({
    mutationFn: (input: { id: string; reason: string; companyId: string; generation: number }) => voidComplaintV64(input.companyId, input.id, input.reason),
    onSuccess: async (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "complaints", input.companyId] });
    },
  });

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    createMutation.reset();
    patchMutation.reset();
    voidMutation.reset();
    setForm(EMPTY_COMPLAINT_FORM);
    setComplaintTypeSearch("");
    setVoidTargetId(null);
  }, [companyId]); // Mutation reset functions are stable; company transitions own fresh complaint state.

  const createErrorCurrent =
    createMutation.isError &&
    createMutation.variables?.companyId === companyId &&
    createMutation.variables?.generation === lifecycleGenerationRef.current;
  const patchErrorCurrent =
    patchMutation.isError &&
    patchMutation.variables?.companyId === companyId &&
    patchMutation.variables?.generation === lifecycleGenerationRef.current;
  const voidErrorCurrent =
    voidMutation.isError &&
    voidMutation.variables?.companyId === companyId &&
    voidMutation.variables?.generation === lifecycleGenerationRef.current;

  function buildComplaintPayload() {
    const payload: Record<string, unknown> = {
      complainant_type: form.complainant_type,
      respondent_type: form.respondent_type,
      complaint_type_id: form.complaint_type_id,
      summary: form.summary,
      severity: form.severity,
    };
    if (form.complainant_type !== "anonymous") payload[complainantIdentityKey] = complainantIdentityValue;
    if (form.respondent_type === "driver") payload.respondent_driver_id = form.respondent_driver_id;
    else payload.respondent_user_id = form.respondent_user_id;
    return payload;
  }

  const missingFields: string[] = [];
  if (!complainantReady) missingFields.push("Complainant");
  if (!respondentReady) missingFields.push(form.respondent_type === "driver" ? "Respondent driver" : "Respondent employee");
  if (!form.complaint_type_id) missingFields.push("Type");
  if (!form.summary) missingFields.push("Summary");
  const createDisabled = missingFields.length > 0 || createMutation.isPending;

  const listState = useListState(complaintsQuery, (complaintsQuery.data?.complaints ?? []).length === 0);
  const complaintTotal = complaintsQuery.isError ? 0 : complaintsQuery.data?.total_count ?? 0;
  const complaintPageCount = Math.max(1, Math.ceil(complaintTotal / pageSize));

  function resolveUserLabel(userId: string) {
    return userOptions.find((u) => u.value === userId)?.label ?? "Employee";
  }

  function resolveComplainant(row: Record<string, unknown>) {
    // FAIL-CP1: pass the resolved name. Without a label EntityLink prints the raw uuid.
    if (row.complainant_driver_id)
      return (
        <EntityLink
          kind="driver"
          id={String(row.complainant_driver_id)}
          label={entityLabel(
            row.complainant_driver_name ? String(row.complainant_driver_name) : null,
            row.complainant_driver_id ? String(row.complainant_driver_id) : null,
            "Driver"
          )}
        />
      );
    // FAIL-CP1 residual: this was the one EntityLink still handed no label, nine lines under the
    // comment saying an unlabelled EntityLink prints the raw uuid. A complaint filed BY a customer
    // is precisely the row where "who complained" is the content.
    if (row.complainant_customer_id)
      return (
        <EntityLink
          kind="customer"
          id={String(row.complainant_customer_id)}
          label={entityLabel(
            row.complainant_customer_name ? String(row.complainant_customer_name) : null,
            row.complainant_customer_id ? String(row.complainant_customer_id) : null,
            "Customer"
          )}
        />
      );
    if (row.complainant_user_id) {
      const employeeLabel = resolveUserLabel(String(row.complainant_user_id));
      return <EntityLink kind="user" id={String(row.complainant_user_id)} label={employeeLabel} />;
    }
    if (row.complainant_external_name) return <span>{String(row.complainant_external_name)}</span>;
    return <span>{String(row.complainant_type ?? "—")}</span>;
  }

  function resolveRespondent(row: Record<string, unknown>) {
    const driverId = row.respondent_driver_id ? String(row.respondent_driver_id) : "";
    // FAIL-CP1: same fix on the respondent side — one uuid appeared in BOTH columns.
    if (driverId)
      return (
        <EntityLink
          kind="driver"
          id={driverId}
          label={entityLabel(
            row.respondent_driver_name ? String(row.respondent_driver_name) : null,
            driverId || null,
            "Driver"
          )}
        />
      );
    if (row.respondent_user_id) {
      const employeeLabel = resolveUserLabel(String(row.respondent_user_id));
      return <EntityLink kind="user" id={String(row.respondent_user_id)} label={employeeLabel} />;
    }
    return <span>—</span>;
  }

  function resolveType(row: Record<string, unknown>) {
    const code = row.complaint_type ? String(row.complaint_type) : "";
    if (!code) return "—";
    return complaintTypeByCode.get(code) ?? code;
  }

  const columns: Array<ParityColumn<Record<string, unknown>>> = [
    { key: "filed_at", label: "Filed", sortable: true, render: (row) => formatDateUS(row.filed_at) },
    { key: "complainant", label: "Complainant", render: (row) => resolveComplainant(row) },
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
              onClick={() => patchMutation.mutate({ id: String(row.id), status: "resolved", companyId, generation: lifecycleGenerationRef.current })}
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
          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
            <SelectCombobox
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={form.complainant_type}
              onChange={(e) =>
                setForm((v) => ({
                  ...v,
                  complainant_type: e.target.value as ComplainantType,
                  complainant_external_name: "",
                  complainant_driver_id: "",
                  complainant_user_id: "",
                  complainant_customer_id: "",
                }))
              }
            >
              <option value="external">Complainant: external</option>
              <option value="driver">Complainant: driver</option>
              <option value="employee">Complainant: employee</option>
              <option value="customer">Complainant: customer</option>
              <option value="anonymous">Complainant: anonymous</option>
            </SelectCombobox>

            {form.complainant_type === "anonymous" ? (
              <span className="rounded-sm border border-dashed border-gray-300 px-2 py-1 text-xs text-slate-500">No identity</span>
            ) : form.complainant_type === "driver" ? (
              <DriverPickerWithCreate
                operatingCompanyId={companyId}
                value={form.complainant_driver_id || null}
                onChange={(next) => setForm((v) => ({ ...v, complainant_driver_id: next ?? "" }))}
                placeholder="Complainant driver"
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              />
            ) : form.complainant_type === "employee" ? (
              <SelectCombobox
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                value={form.complainant_user_id}
                onChange={(e) => setForm((v) => ({ ...v, complainant_user_id: e.target.value }))}
              >
                <option value="">{usersQuery.isLoading ? "Loading…" : "Complainant employee"}</option>
                {userOptions.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </SelectCombobox>
            ) : form.complainant_type === "customer" ? (
              <EntityPicker
                kind="customer"
                operatingCompanyId={companyId}
                value={form.complainant_customer_id || null}
                onChange={(next) => setForm((v) => ({ ...v, complainant_customer_id: next ?? "" }))}
                enabled={canCreate}
                allowCreate
                placeholder="Complainant customer"
              />
            ) : (
              <input
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                placeholder="Complainant name"
                value={form.complainant_external_name}
                onChange={(e) => setForm((v) => ({ ...v, complainant_external_name: e.target.value }))}
              />
            )}

            <SelectCombobox
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={form.respondent_type}
              onChange={(e) =>
                setForm((v) => ({
                  ...v,
                  respondent_type: e.target.value as RespondentType,
                  respondent_driver_id: "",
                  respondent_user_id: "",
                }))
              }
            >
              <option value="driver">Respondent: driver</option>
              <option value="employee">Respondent: employee</option>
            </SelectCombobox>

            {form.respondent_type === "driver" ? (
              <DriverPickerWithCreate
                operatingCompanyId={companyId}
                value={form.respondent_driver_id || null}
                onChange={(next) => setForm((v) => ({ ...v, respondent_driver_id: next ?? "" }))}
                placeholder="Respondent driver"
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              />
            ) : (
              <SelectCombobox
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                value={form.respondent_user_id}
                onChange={(e) => setForm((v) => ({ ...v, respondent_user_id: e.target.value }))}
              >
                <option value="">{usersQuery.isLoading ? "Loading…" : "Respondent employee"}</option>
                {userOptions.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </SelectCombobox>
            )}

            <ReferenceSelect
              value={form.complaint_type_id || null}
              onChange={(next) => setForm((v) => ({ ...v, complaint_type_id: next ?? "" }))}
              options={complaintTypeOptions}
              createKind="complaint_type"
              operatingCompanyId={companyId}
              placeholder={complaintTypesQuery.isLoading ? "Loading types…" : "Type"}
              loading={complaintTypesQuery.isLoading}
              disabled={complaintTypesQuery.isError}
              onSearch={setComplaintTypeSearch}
              onOptionCreated={() => {
                void queryClient.invalidateQueries({ queryKey: ["safety-v64", "complaint-types", companyId] });
              }}
            />
            {complaintTypesQuery.isError ? (
              <ListErrorState
                status={0}
                message="Complaint types could not be loaded."
                onRetry={() => void complaintTypesQuery.refetch()}
              />
            ) : null}
            <CappedListNotice
              shown={complaintTypeOptions.length}
              limit={200}
              total={complaintTypesQuery.data?.total}
              hint="Type to search the full complaint-type catalog."
              className="text-xs text-slate-600"
            />
            <input
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              placeholder="Summary"
              value={form.summary}
              onChange={(e) => setForm((v) => ({ ...v, summary: e.target.value }))}
            />
            <SelectCombobox
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={form.severity}
              onChange={(e) => setForm((v) => ({ ...v, severity: e.target.value as typeof form.severity }))}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </SelectCombobox>
            <button
              type="button"
              className="rounded-sm bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
              disabled={createDisabled}
              onClick={() => createMutation.mutate({ companyId, generation: lifecycleGenerationRef.current, payload: buildComplaintPayload() })}
            >
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
          {createErrorCurrent ? (
            <p className="mt-1 text-[11px] text-red-700">
              {createMutation.error instanceof ApiError
                ? String((createMutation.error.data as { error?: string })?.error ?? "Could not file complaint.")
                : "Could not file complaint."}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* CLS-LIST-ERROR-STATE-UNGUARDED: failed complaintsQuery must not fall through to emptyText
          "No complaints found." — outage presenting as a clean complaint history. */}
      {listState.isError ? (
        <div data-testid="complaints-query-error">
          <ListErrorState
            title="Couldn't load complaints"
            status={0}
            message={(complaintsQuery.error as Error)?.message}
            onRetry={() => void complaintsQuery.refetch()}
          />
        </div>
      ) : (
      <ParityTable<Record<string, unknown>>
        columns={columns}
        rows={complaintsQuery.data?.complaints ?? []}
        rowKey={(row) => String(row.id)}
        loading={listState.isLoading}
        emptyText="No complaints found."
        storageKey="safety-complaints"
        exportFilename="complaints"
        hidePager
        filterBar={
          <div className="relative flex flex-wrap items-end gap-2" data-testid="complaints-filters">
            <label className="text-[11px] text-slate-600">
              Driver
              <EntityPicker
                kind="driver"
                operatingCompanyId={companyId}
                value={draft.driverId || null}
                onChange={(next) => setDriverFilter(next ?? "")}
                allowCreate={false}
                placeholder="All drivers"
                className="mt-1"
                dataTestId="complaints-filter-driver"
              />
            </label>
            <Button type="button" size="sm" data-testid="complaints-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="complaints-filter-cancel"
              onClick={staged.cancel}
              disabled={!staged.dirty}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="complaints-filter-reset"
              onClick={() => {
                staged.cancel();
                setApplied(EMPTY_FILTERS);
                patchSearchParam(EMPTY_FILTERS);
              }}
            >
              Reset
            </Button>
          </div>
        }
        rowClassName={(row) =>
          highlightedComplaintId && String(row.id) === highlightedComplaintId
            ? "bg-slate-100 ring-1 ring-inset ring-slate-300"
            : ""
        }
      />
      )}
      {!listState.isError && complaintTotal > pageSize ? (
        <div className="flex items-center justify-end gap-2 text-xs" data-testid="complaints-tab-server-pager">
          <Button size="sm" variant="secondary" disabled={page <= 1 || complaintsQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous complaints</Button>
          <span className="text-slate-600">Page {page} of {complaintPageCount} · {complaintTotal} complaints</span>
          <Button size="sm" variant="secondary" disabled={page >= complaintPageCount || complaintsQuery.isFetching} onClick={() => setPage((current) => Math.min(complaintPageCount, current + 1))}>Next complaints</Button>
        </div>
      ) : null}
      {patchErrorCurrent ? (
        <p className="text-xs text-red-700" data-testid="complaint-resolve-error">
          {userFacingApiError(patchMutation.error, "Could not resolve the complaint.")}
        </p>
      ) : null}
      {voidErrorCurrent ? (
        <p className="text-xs text-red-700" role="alert" data-testid="complaint-void-error">
          {userFacingApiError(voidMutation.error, "Could not void the complaint.")}
        </p>
      ) : null}
      <VoidReasonModal
        open={voidTargetId !== null}
        title="Void Complaint"
        entityRef={voidTargetId ? entityLabel(null, voidTargetId, "Complaint") : undefined}
        postsReversingEntry={false}
        onClose={() => setVoidTargetId(null)}
        onSubmit={async (reason) => {
          if (!voidTargetId) return;
          await voidMutation.mutateAsync({ id: voidTargetId, reason, companyId, generation: lifecycleGenerationRef.current });
          setVoidTargetId(null);
        }}
      />
    </div>
  );
}
