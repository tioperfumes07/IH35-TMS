import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../../components/shared/EntityLink";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createInternalFine, disputeInternalFine, getInternalFines, voidInternalFine } from "../../api/safety";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { listInternalFineReasons } from "../../api/catalogs-safety";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { companyToday } from "../../lib/businessDate";
import { entityLabel } from "../../lib/entity-label";
import { useAuth } from "../../auth/useAuth";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CappedListNotice } from "../../components/CappedListNotice";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { suggestExpenseLoad } from "../../api/maintenance";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { useStagedListFilters } from "../../components/table";
import { userFacingApiError } from "../../lib/api-error-message";

type InternalFineRow = Record<string, unknown>;

type Props = {
  operatingCompanyId: string;
};

const EMPTY_FILTERS = { driverId: "", loadId: "" };

export function InternalFinesPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const actionGenerationRef = useRef(0);
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedFineId = searchParams.get("fine_id");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const loadIdFromUrl = searchParams.get("load_id")?.trim() ?? "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  // LST-F5163L + LST-F5191: visible reverse filters must write URL params on Apply.
  // LV-SAFETY-INTERNAL-FINES-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  // SAF-F12: which fine a lifecycle action is open for, and which action.
  const [lifecycleTarget, setLifecycleTarget] = useState<{ row: InternalFineRow; action: "dispute" | "void" } | null>(null);
  const [createError, setCreateError] = useState<unknown>(null);
  const [form, setForm] = useState({
    driver_uuid: "",
    reason_uuid: "",
    related_load_uuid: "",
    amount: 25,
    imposed_date: companyToday(),
    status: "pending",
    notes: "",
  });
  /** Preserve an operator-selected load after the active-trip resolver has populated the field. */
  const [suggestionPinned, setSuggestionPinned] = useState(false);

  function patchSearchParam(next: { driverId: string; loadId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.driverId) p.set("driver_id", next.driverId);
    else p.delete("driver_id");
    if (next.loadId) p.set("load_id", next.loadId);
    else p.delete("load_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
    loadId: loadIdFromUrl,
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
    setApplied((prev) => ({
      ...prev,
      driverId: driverIdFromUrl,
      loadId: loadIdFromUrl,
    }));
  }, [driverIdFromUrl, loadIdFromUrl]);

  // Sibling verify-internal-fine-load-reverse asserts setter names + URL seed vars.
  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }
  function setLoadFilter(next: string) {
    staged.setDraft((d) => ({ ...d, loadId: next }));
  }

  const effectiveDriverId = applied.driverId.trim() || undefined;
  const effectiveLoadId = applied.loadId.trim() || undefined;

  const suggestionQuery = useQuery({
    queryKey: ["safety", "internal-fine-create", "suggest-load", operatingCompanyId, form.driver_uuid, form.imposed_date],
    queryFn: () =>
      suggestExpenseLoad({
        operating_company_id: operatingCompanyId,
        driver_id: form.driver_uuid || undefined,
        transaction_date: form.imposed_date,
      }),
    enabled: Boolean(operatingCompanyId && form.driver_uuid && form.imposed_date),
  });

  useEffect(() => {
    setSuggestionPinned(false);
  }, [form.driver_uuid, form.imposed_date]);

  useEffect(() => {
    if (form.related_load_uuid || suggestionPinned) return;
    const suggested = suggestionQuery.data?.data;
    if (!suggested?.load_id) return;
    setForm((previous) => ({ ...previous, related_load_uuid: suggested.load_id }));
    setSuggestionPinned(true);
  }, [form.related_load_uuid, suggestionPinned, suggestionQuery.data]);

  const query = useQuery({
    queryKey: ["safety", "internal-fines", operatingCompanyId, effectiveLoadId, effectiveDriverId, page],
    queryFn: () =>
      getInternalFines(operatingCompanyId, {
        load_id: effectiveLoadId,
        driver_id: effectiveDriverId,
        limit: pageSize,
        offset: page * pageSize,
      }),
    enabled: Boolean(operatingCompanyId),
  });
  const totalCount = query.isError ? 0 : query.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    setPage(0);
  }, [operatingCompanyId, effectiveLoadId, effectiveDriverId]);

  // FIX 1 — reason picker: owner-managed internal-fine-reasons catalog (active only).
  // SAF-B29 wave-5: server search — catalog can exceed a silent 200-cap page.
  const [reasonSearch, setReasonSearch] = useState("");
  const reasonsQuery = useQuery({
    queryKey: ["catalogs", "safety", "internal-fine-reasons", "picker", operatingCompanyId, reasonSearch],
    queryFn: () =>
      listInternalFineReasons(operatingCompanyId, {
        is_active: "true",
        limit: 200,
        search: reasonSearch || undefined,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const reasons = useMemo(() => reasonsQuery.data?.rows ?? [], [reasonsQuery.data?.rows]);

  const reasonOptions = useMemo(
    () =>
      reasons.map((r) => ({
        value: String(r.id),
        label: String(r.reason_name),
        type: String(r.reason_code),
      })),
    [reasons]
  );

  /** @matrix-built modules=safety cols=driver,load,gl_je,connectivity,reverse_link */
  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; body: Record<string, unknown> }) =>
      createInternalFine(input.companyId, input.body),
    onMutate: () => setCreateError(null),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setForm((prev) => ({ ...prev, notes: "", related_load_uuid: "" }));
      await queryClient.invalidateQueries({ queryKey: ["safety", "internal-fines", input.companyId] });
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setCreateError(error);
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    setLifecycleTarget(null);
    setCreateError(null);
    createMutation.reset();
  }, [operatingCompanyId]); // Mutation reset is stable; each company owns a fresh fine lifecycle.

  const missing = useMemo(() => {
    const parts: string[] = [];
    if (!form.driver_uuid) parts.push("a driver");
    if (!form.reason_uuid) parts.push("a reason");
    return parts;
  }, [form.driver_uuid, form.reason_uuid]);

  const canCreate = missing.length === 0 && !createMutation.isPending;
  const approverName = user?.email ?? user?.uuid ?? null;
  // SAF-F12 role gates mirror the server: dispute = Owner/Administrator/Safety, void = Owner/Administrator.
  const canDispute = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Safety";
  const canVoid = user?.role === "Owner" || user?.role === "Administrator";

  // Migrated to the shared QBO-parity grid — columns and order are preserved verbatim (§7 additive-only).
  const columns: Array<ParityColumn<InternalFineRow>> = [
    { key: "imposed_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.imposed_date) },
    {
      key: "driver_id",
      label: "Driver",
      render: (row) => (
        <EntityLink
          kind="driver"
          id={row.driver_id as string | undefined}
          label={entityLabel((row.driver_name as string | undefined)?.trim(), String(row.driver_id ?? ""), "Driver")}
        />
      ),
    },
    { key: "reason_code", label: "Reason", render: (row) => String(row.reason_code ?? row.reason_name ?? "—") },
    { key: "amount", label: "Amount", render: (row) => `$${Number(row.amount ?? 0).toFixed(2)}` },
    { key: "status", label: "Status", sortable: true, render: (row) => toStatusLabel(String(row.status ?? "pending")) },
    {
      key: "driver_liability_id",
      label: "Liability",
      render: (row) =>
        row.driver_liability_id ? (
          <EntityLink kind="liability" id={String(row.driver_liability_id)} label="Liability" />
        ) : (
          "—"
        ),
    },
    {
      // SAF-F12: the page had NO row action at all, so a fine imposed on a driver could never be
      // disputed or voided even though the schema has always accepted both states. Void is
      // Owner/Administrator-only (governance: void is reason-required and role-gated); dispute is
      // open to the safety desk. A fine already converted to a liability is refused by the server
      // and the error names the dependent liability — never a silent cascade.
      key: "actions",
      label: "Actions",
      render: (row) => {
        const isVoided = Boolean(row.voided_at) || String(row.status ?? "") === "voided";
        const isConverted = Boolean(row.driver_liability_id) || String(row.status ?? "") === "converted_to_liability";
        if (isVoided) return <span className="text-slate-400">Voided</span>;
        return (
          <div className="flex items-center gap-2">
            {canDispute && !isConverted ? (
              <button
                type="button"
                className="text-[#1f2a44] underline"
                data-testid={`internal-fine-dispute-${String(row.id ?? "")}`}
                onClick={() => setLifecycleTarget({ row, action: "dispute" })}
              >
                Dispute
              </button>
            ) : null}
            {canVoid && !isConverted ? (
              <button
                type="button"
                className="text-[#dc2626] underline"
                data-testid={`internal-fine-void-${String(row.id ?? "")}`}
                onClick={() => setLifecycleTarget({ row, action: "void" })}
              >
                Void
              </button>
            ) : null}
            {isConverted ? <span className="text-slate-400">Converted — reverse the liability first</span> : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="grid gap-2 md:grid-cols-6">
          <DriverPickerWithCreate
            operatingCompanyId={operatingCompanyId}
            value={form.driver_uuid || null}
            onChange={(next) => setForm((v) => ({ ...v, driver_uuid: next ?? "" }))}
            placeholder="Search by driver"
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          />
          {/*
            LST-PICKER-01: ReferenceSelect first-row create → POST catalogs.internal_fine_reasons
            (same table the picker lists). Options keyed by UUID (reason_uuid). Selecting a reason
            prefills the fine amount from catalog default_amount (cents → dollars).
          */}
          <ReferenceSelect
            value={form.reason_uuid || null}
            onChange={(next) => {
              const row = reasons.find((r) => String(r.id) === String(next ?? ""));
              const defaultDollars =
                row && Number.isFinite(Number(row.default_amount)) ? Number(row.default_amount) / 100 : null;
              setForm((v) => ({
                ...v,
                reason_uuid: next ?? "",
                ...(defaultDollars != null && defaultDollars > 0 ? { amount: defaultDollars } : {}),
              }));
            }}
            options={reasonOptions}
            createKind="internal_fine_reason"
            operatingCompanyId={operatingCompanyId}
            placeholder={reasonsQuery.isLoading ? "Loading reasons…" : "Select a reason"}
            loading={reasonsQuery.isLoading}
            onSearch={setReasonSearch}
            onOptionCreated={() => {
              void queryClient.invalidateQueries({
                queryKey: ["catalogs", "safety", "internal-fine-reasons", "picker", operatingCompanyId],
              });
              void reasonsQuery.refetch();
            }}
          />
          <CappedListNotice
            shown={reasons.length}
            limit={200}
            total={reasonsQuery.data?.total}
            hint="Type to search the full internal-fine-reason catalog."
            className="text-xs text-slate-600 md:col-span-6"
          />
          {/* M-1 (GUARD inline FAIL): this is the inline-create fine AMOUNT (sent to createInternalFine as
              dollars; display is $row.amount.toFixed(2)). dollars-mode MoneyInput; amount stays a DOLLAR
              number, byte-for-byte (the backend does Math.round(amount*100) for the liability). */}
          <MoneyInput valueDollars={form.amount || null} onChangeDollars={(d) => setForm((v) => ({ ...v, amount: d ?? 0 }))} ariaLabel="Fine amount (USD)" placeholder="Amount (USD)" />
          <div>
            <label className="sr-only" htmlFor="internal-fine-imposed-date">Imposed date</label>
            <DatePicker id="internal-fine-imposed-date" value={form.imposed_date} onChange={(next) => setForm((v) => ({ ...v, imposed_date: next }))} className="" />
          </div>
          <SelectCombobox value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
          </SelectCombobox>
          {/* SAF-B29: native <select> of limit:200 dispatch loads truncated silently. EntityPicker
              server-searches mdata.loads. CREATE chrome owes picker_law — allowCreate (+ Add new load). */}
          <EntityPicker
            kind="load"
            operatingCompanyId={operatingCompanyId}
            value={form.related_load_uuid || null}
            onChange={(next) => setForm((v) => ({ ...v, related_load_uuid: next ?? "" }))}
            allowCreate
            placeholder="Related load (optional)"
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
            dataTestId="internal-fine-related-load"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canCreate}
            title={missing.length > 0 ? "Select a driver and a reason" : undefined}
            onClick={() => {
              if (!canCreate) return;
              const body: Record<string, unknown> = {
                driver_uuid: form.driver_uuid,
                reason_uuid: form.reason_uuid,
                amount: form.amount,
                imposed_date: form.imposed_date,
                status: form.status,
              };
              if (form.related_load_uuid) body.related_load_uuid = form.related_load_uuid;
              const approverUuid = form.status === "approved" ? user?.uuid ?? undefined : undefined;
              if (approverUuid) body.approved_by_user_uuid = approverUuid;
              if (form.notes.trim()) body.notes = form.notes.trim();
              createMutation.mutate({ companyId: operatingCompanyId, generation: actionGenerationRef.current, body: { ...body } });
            }}
          >
            + Create Internal Fine
          </button>
          {/* FIX 2 — no silent dead control: explain WHY the button is disabled. */}
          {missing.length > 0 ? (
            <span className="text-[11px] text-gray-500">Select a driver and a reason to create the fine.</span>
          ) : null}
          {createError ? (
            <p className="w-full text-xs text-red-700" data-testid="internal-fine-create-error">
              {userFacingApiError(createError, "Could not create the internal fine.")}
            </p>
          ) : null}
          {/* FIX 3 (frontend) — approver transparency: approving instantly creates a driver liability. */}
          {form.status === "approved" && approverName ? (
            <span className="text-[11px] text-gray-600">Approving as {approverName} — creates a recoverable driver liability on save.</span>
          ) : null}
          {/* SAF-F24 / LST-PICKER-01: reason create is ReferenceSelect first-row (CatalogQuickCreateDrawer). */}
        </div>
      </div>

      {query.isError ? (
        <ListErrorBanner
          message="Internal fines could not be loaded."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable<InternalFineRow>
          columns={columns}
          rows={query.data?.fines ?? []}
          rowKey={(row) => String(row.id)}
          loading={query.isLoading}
          emptyText="No internal fines found."
          storageKey="safety-internal-fines"
          exportFilename="internal-fines"
          pageSize={pageSize}
          hidePager
          filterBar={
            <div className="relative flex flex-wrap items-end gap-2" data-testid="internal-fines-filters">
              <label className="text-[11px] text-slate-600">
                Driver
                <EntityPicker
                  kind="driver"
                  operatingCompanyId={operatingCompanyId}
                  value={draft.driverId || null}
                  onChange={(next) => setDriverFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All drivers"
                  className="mt-1"
                  dataTestId="internal-fines-filter-driver"
                />
              </label>
              <label className="text-[11px] text-slate-600">
                Load
                <EntityPicker
                  kind="load"
                  operatingCompanyId={operatingCompanyId}
                  value={draft.loadId || null}
                  onChange={(next) => setLoadFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All loads"
                  className="mt-1"
                  dataTestId="internal-fines-filter-load"
                />
              </label>
              <Button type="button" size="sm" data-testid="internal-fines-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
                Apply
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="internal-fines-filter-cancel"
                onClick={staged.cancel}
                disabled={!staged.dirty}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="internal-fines-filter-reset"
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
          rowClassName={(row) => String(row.id ?? "") === linkedFineId ? "bg-slate-100 ring-1 ring-inset ring-slate-300" : ""}
          rowTestId={(row) => String(row.id ?? "") === linkedFineId ? "linked-internal-fine" : `internal-fine-${String(row.id ?? "")}`}
        />
      )}
      {!query.isError && totalCount > 0 ? (
        <div className="flex items-center justify-end gap-2 text-xs" data-testid="internal-fines-server-pager">
          <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}</span>
          <Button type="button" size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
          <Button type="button" size="sm" variant="secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</Button>
        </div>
      ) : null}

      {/* SAF-F12: reason-required lifecycle shell, reused from the accounting void contract.
          postsReversingEntry={false} — a safety fine void posts no GL entry; claiming it would be a lie. */}
      <VoidReasonModal
        open={Boolean(lifecycleTarget)}
        title={lifecycleTarget?.action === "void" ? "Void Internal Fine" : "Dispute Internal Fine"}
        entityRef={
          lifecycleTarget
            ? `${String(lifecycleTarget.row.reason_code ?? lifecycleTarget.row.reason_name ?? "Internal fine")} · $${Number(
                lifecycleTarget.row.amount ?? 0
              ).toFixed(2)} · ${formatDateUS(lifecycleTarget.row.imposed_date)}`
            : undefined
        }
        minLength={3}
        postsReversingEntry={false}
        onClose={() => setLifecycleTarget(null)}
        onSubmit={async (reason) => {
          if (!lifecycleTarget) return;
          const input = {
            id: String(lifecycleTarget.row.id ?? ""),
            action: lifecycleTarget.action,
            companyId: operatingCompanyId,
            generation: actionGenerationRef.current,
          };
          try {
            if (input.action === "void") await voidInternalFine(input.id, input.companyId, reason);
            else await disputeInternalFine(input.id, input.companyId, reason);
          } catch (error) {
            if (input.generation === actionGenerationRef.current) throw error;
            return;
          }
          if (input.generation !== actionGenerationRef.current) return;
          await queryClient.invalidateQueries({ queryKey: ["safety", "internal-fines", input.companyId] });
          setLifecycleTarget(null);
        }}
      />
    </div>
  );
}

function toStatusLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "pending") return "Pending";
  if (normalized === "approved") return "Approved";
  if (normalized === "denied") return "Denied";
  if (normalized === "paid") return "Paid";
  if (normalized === "disputed") return "Disputed";
  if (normalized === "converted_to_liability") return "Converted to Liability";
  if (normalized === "voided") return "Voided";
  return value || "Pending";
}
