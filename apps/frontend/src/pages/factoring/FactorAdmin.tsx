import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { userFacingApiError } from "../../lib/api-error-message";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import {
  assignCustomerFactor,
  createFactor,
  createLetterOfRelease,
  deactivateFactor,
  getCustomerFactor,
  listFactors,
  listLetterOfReleases,
  updateFactor,
  type CustomerFactorAssignment,
  type Factor,
  type FactorBatchHistoryRow,
} from "../../api/factoring";
import { listCustomers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { Combobox } from "../../components/Combobox";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatUsdCents } from "../../lib/money";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../../components/shared/EntityLink";
import { DeactivateFactorConfirmModal } from "../../components/factoring/DeactivateFactorConfirmModal";
import { entityLabel } from "../../lib/entity-label";
import { useListState } from "../../components/list-state";
import { companyToday } from "../../lib/businessDate";

function formatPct(value: number) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function todayDate() {
  return companyToday();
}

// Display-only ParityTable columns — same order, labels, and cell formatting as the
// former hand-rolled tables (financial surface: rates/amount formatting preserved 1:1).
const FACTOR_COLUMNS: Array<ParityColumn<Factor>> = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    render: (factor) => <span className="font-medium text-gray-900">{factor.name}</span>,
  },
  { key: "advance_rate", label: "Advance Rate", sortable: true, render: (factor) => formatPct(factor.advance_rate) },
  { key: "fee_rate", label: "Fee Rate", sortable: true, render: (factor) => formatPct(factor.fee_rate) },
  { key: "reserve_rate", label: "Reserve Rate", sortable: true, render: (factor) => formatPct(factor.reserve_rate) },
  {
    // LIABILITY column-wave: factors.admin previously showed only contract-term percentages —
    // never the outstanding $ reserve/liability balance Faro currently holds per factor.
    key: "reserve_balance_cents",
    label: "Reserve Balance",
    sortable: true,
    sortValue: (factor) => factor.reserve_balance_cents ?? 0,
    render: (factor) =>
      factor.reserve_balance_cents != null ? formatUsdCents(factor.reserve_balance_cents) : "—",
  },
  { key: "recourse_days", label: "Recourse Days", sortable: true },
  { key: "active", label: "Active", sortable: true, render: (factor) => (factor.active ? "Yes" : "No"), sortValue: (factor) => (factor.active ? 1 : 0) },
  {
    key: "updated_at",
    label: "Updated",
    sortable: true,
    render: (factor) => formatDateUS(factor.updated_at),
    sortValue: (factor) => factor.updated_at,
  },
];

const ASSIGNMENT_COLUMNS: Array<ParityColumn<CustomerFactorAssignment>> = [
  {
    key: "customer_id",
    label: "Customer",
    sortable: true,
    render: (row) => (
      <EntityLink kind="customer" id={row.customer_id} label={entityLabel(undefined, row.customer_id, "Customer")} />
    ),
  },
  { key: "factor_name", label: "Factor", sortable: true },
  { key: "effective_from", label: "Effective From", sortable: true },
  {
    key: "effective_to",
    label: "Effective To",
    sortable: true,
    render: (row) => row.effective_to ?? "Active",
  },
];

const BATCH_COLUMNS: Array<ParityColumn<FactorBatchHistoryRow>> = [
  {
    key: "batch_number",
    label: "Batch",
    sortable: true,
    render: (row) => (
      // LINK-F5178: was kind="factoring_advance" (routed to /accounting/factoring/:id, the wrong
      // table); row.id is a real factoring.batch.id, which BatchDetail.tsx (/factoring/batches/:id)
      // expects.
      <EntityLink kind="factoring_batch" id={row.id} label={entityLabel(row.batch_number, row.id, "Batch")} />
    ),
  },
  { key: "status", label: "Status", sortable: true, render: (row) => <span className="capitalize">{row.status}</span> },
  {
    key: "submitted_at",
    label: "Submitted",
    sortable: true,
    render: (row) => (row.submitted_at ? formatDateUS(row.submitted_at) : "-"),
    sortValue: (row) => row.submitted_at ?? null,
  },
];

type AddFactorForm = {
  name: string;
  advance_rate: string;
  fee_rate: string;
  reserve_rate: string;
  recourse_days: string;
};

export function FactorAdmin() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [showAddFactorModal, setShowAddFactorModal] = useState(false);
  const [showAssignCustomerModal, setShowAssignCustomerModal] = useState(false);
  const [showNoaModal, setShowNoaModal] = useState(false);
  const [showLorModal, setShowLorModal] = useState(false);
  const [selectedFactor, setSelectedFactor] = useState<Factor | null>(null);
  // NO-NATIVE-DIALOGS-U6 — window.confirm freezes Live Chrome browser automation; reuses the same
  // typed-confirmation shell FactoringHome.tsx already uses for the sibling "deactivate active
  // factor" action, same danger class.
  const [showDeactivateFactorModal, setShowDeactivateFactorModal] = useState(false);
  const [detailCustomerId, setDetailCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [assignCustomerId, setAssignCustomerId] = useState("");
  const [assignFactorId, setAssignFactorId] = useState("");
  const [assignEffectiveFrom, setAssignEffectiveFrom] = useState(todayDate());
  const [noaForm, setNoaForm] = useState({
    noa_stamp_text: "",
    noa_remit_to_name: "",
    noa_remit_to_addr: "",
    noa_remit_to_wire_ref: "",
  });
  const [lorForm, setLorForm] = useState({
    issued_date: todayDate(),
    effective_release_date: todayDate(),
    notes: "",
  });
  const [addForm, setAddForm] = useState<AddFactorForm>({
    name: "",
    advance_rate: "0.95",
    fee_rate: "0.025",
    reserve_rate: "0.10",
    recourse_days: "90",
  });

  const factorsQuery = useQuery({
    queryKey: ["factoring", "factors", companyId],
    queryFn: () => listFactors(companyId).then((res) => res.factors),
    enabled: Boolean(companyId),
  });

  // LINK reverse_link: EntityLink kind="factor" resolves to /factoring/factors?factor_id= — this
  // page previously never read that param, so a reverse link into a factor landed on the list with
  // nothing selected. selectedFactor needs the FULL Factor object (used by every mutation below), so
  // the effect waits for factorsQuery to resolve and looks the id up rather than setting a bare id.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkFactorId = searchParams.get("factor_id");
  useEffect(() => {
    if (!deepLinkFactorId || !factorsQuery.data) return;
    const match = factorsQuery.data.find((factor) => factor.id === deepLinkFactorId);
    if (match) setSelectedFactor(match);
  }, [deepLinkFactorId, factorsQuery.data]);

  // LINK-F5171/LINK-F5178 — factoring:factors.admin + batches.detail reverse_link: CustomerDetail's
  // new CustomerFactoringReverseSection links here as /factoring/factors?customer_id=<id>, but
  // detailCustomerId (drives customerFactorDetailQuery below, which already returns factor +
  // assignments + batches for that customer) was combobox-only state — a hand-typed or EntityLink
  // customer_id param was silently ignored, same defect class as deepLinkFactorId above.
  const deepLinkCustomerId = searchParams.get("customer_id");
  useEffect(() => {
    if (!deepLinkCustomerId) return;
    setDetailCustomerId(deepLinkCustomerId);
  }, [deepLinkCustomerId]);

  // LST-F5201 — selection writes URL so reverse deep-links round-trip.
  function patchSearchParam(key: "customer_id" | "factor_id", next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set(key, next);
        else params.delete(key);
        return params;
      },
      { replace: true }
    );
  }
  function selectFactor(factor: Factor | null) {
    setSelectedFactor(factor);
    patchSearchParam("factor_id", factor?.id ?? "");
  }
  function selectDetailCustomer(next: string) {
    setDetailCustomerId(next);
    patchSearchParam("customer_id", next);
  }

  const customersQuery = useQuery({
    queryKey: ["factoring", "factor-admin", "customers", companyId, customerSearch],
    queryFn: () =>
      listCustomers({
        operating_company_id: companyId,
        status: "active",
        search: customerSearch || undefined,
      }).then((res) => res.customers),
    enabled: Boolean(companyId),
  });

  const customerFactorDetailQuery = useQuery({
    queryKey: ["factoring", "customer-factor-detail", companyId, detailCustomerId],
    queryFn: () => getCustomerFactor(detailCustomerId, companyId),
    enabled: Boolean(companyId && detailCustomerId),
  });

  const lorQuery = useQuery({
    queryKey: ["factoring", "lor", companyId, selectedFactor?.id],
    queryFn: () => listLetterOfReleases(selectedFactor!.id, companyId).then((res) => res.letters_of_release),
    enabled: Boolean(companyId && selectedFactor?.id),
  });

  const updateNoaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFactor) return;
      return updateFactor(selectedFactor.id, companyId, {
        noa_stamp_text: noaForm.noa_stamp_text || null,
        noa_remit_to_name: noaForm.noa_remit_to_name || null,
        noa_remit_to_addr: noaForm.noa_remit_to_addr || null,
        noa_remit_to_wire_ref: noaForm.noa_remit_to_wire_ref || null,
      });
    },
    onSuccess: async (updated) => {
      setShowNoaModal(false);
      if (updated) setSelectedFactor(updated);
      pushToast("NOA config saved", "success");
      await queryClient.invalidateQueries({ queryKey: ["factoring", "factors", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to save NOA config"), "error"),
  });

  const createLorMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFactor) return;
      return createLetterOfRelease(selectedFactor.id, companyId, {
        issued_date: lorForm.issued_date,
        effective_release_date: lorForm.effective_release_date,
        notes: lorForm.notes || null,
      });
    },
    onSuccess: async () => {
      setShowLorModal(false);
      setLorForm({ issued_date: todayDate(), effective_release_date: todayDate(), notes: "" });
      pushToast("Letter of Release recorded", "success");
      await queryClient.invalidateQueries({ queryKey: ["factoring", "lor", companyId, selectedFactor?.id] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to record LOR"), "error"),
  });

  const deactivateFactorMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFactor) return;
      return deactivateFactor(selectedFactor.id, companyId);
    },
    onSuccess: async (updated) => {
      if (updated) setSelectedFactor(updated);
      pushToast("Factor deactivated", "success");
      await queryClient.invalidateQueries({ queryKey: ["factoring", "factors", companyId] });
    },
    onError: (error) => {
      const msg = userFacingApiError(error, "Failed to deactivate factor");
      if (msg.includes("active_assignments_exist") || msg.includes("409")) {
        pushToast("Factor has active customer assignments. Record a Letter of Release first.", "error");
      } else {
        pushToast(msg, "error");
      }
    },
  });

  const addFactorMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: addForm.name.trim(),
        advance_rate: Number(addForm.advance_rate),
        fee_rate: Number(addForm.fee_rate),
        reserve_rate: Number(addForm.reserve_rate),
        recourse_days: Number(addForm.recourse_days),
      };
      return createFactor(companyId, payload);
    },
    onSuccess: async () => {
      setShowAddFactorModal(false);
      setAddForm({ name: "", advance_rate: "0.95", fee_rate: "0.025", reserve_rate: "0.10", recourse_days: "90" });
      pushToast("Factor created", "success");
      await queryClient.invalidateQueries({ queryKey: ["factoring", "factors", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to create factor"), "error"),
  });

  const assignMutation = useMutation({
    mutationFn: async () =>
      assignCustomerFactor(assignCustomerId, companyId, {
        factor_id: assignFactorId,
        effective_from: assignEffectiveFrom,
      }),
    onSuccess: async () => {
      pushToast("Customer assignment saved", "success");
      setShowAssignCustomerModal(false);
      setDetailCustomerId(assignCustomerId);
      await queryClient.invalidateQueries({ queryKey: ["factoring", "customer-factor-detail", companyId, assignCustomerId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to assign customer"), "error"),
  });

  const selectedCustomer = useMemo(
    () => (customersQuery.data ?? []).find((customer) => customer.id === detailCustomerId) ?? null,
    [customersQuery.data, detailCustomerId]
  );

  const customerOptions = useMemo(
    () =>
      (customersQuery.data ?? []).map((customer) => ({
        value: customer.id,
        label: customer.name,
        type: customer.customer_code ?? undefined,
      })),
    [customersQuery.data]
  );

  const assignFactorOptions = useMemo(
    () =>
      (factorsQuery.data ?? [])
        .filter((factor) => factor.active)
        .map((factor) => ({ value: factor.id, label: factor.name })),
    [factorsQuery.data],
  );

  const factorRows = factorsQuery.data ?? [];
  const assignmentRows = useMemo(
    () => (customerFactorDetailQuery.data?.assignments ?? []).filter((row) => row.factor_id === selectedFactor?.id),
    [customerFactorDetailQuery.data?.assignments, selectedFactor?.id]
  );
  const batchRows = customerFactorDetailQuery.data?.batches ?? [];

  // Empty states render only once their backing query settles (never mid-fetch).
  const factorsListState = useListState(factorsQuery, factorRows.length === 0);
  const assignmentsListState = useListState(customerFactorDetailQuery, assignmentRows.length === 0);
  const batchesListState = useListState(customerFactorDetailQuery, batchRows.length === 0);

  return (
    <div className="space-y-3">
      <PageHeader
        backHref="/factoring"
        breadcrumb={["Factoring", "Factors"]}
        title="Factor Administration"
        subtitle="Manage factors, assign customers, and review assignment/batch history"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">Factor Administration</div>
          <div className="text-xs text-gray-600">Manage factors, assign customers, and review assignment/batch history.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowAssignCustomerModal(true)}>
            Assign Customer
          </Button>
          <Button size="sm" onClick={() => setShowAddFactorModal(true)}>
            + Create Factor
          </Button>
        </div>
      </div>

      {factorsListState.isError ? (
        <ListErrorState
          title="Couldn't load factors"
          status={factorsQuery.error instanceof ApiError ? factorsQuery.error.status : 0}
          message={(factorsQuery.error as Error | undefined)?.message}
          onRetry={() => void factorsQuery.refetch()}
        />
      ) : (
        <ParityTable<Factor>
          columns={FACTOR_COLUMNS}
          rows={factorRows}
          rowKey={(factor) => factor.id}
          loading={factorsListState.isLoading}
          onRowClick={(factor) => selectFactor(factor)}
          rowClassName={(factor) => (selectedFactor?.id === factor.id ? "bg-slate-100" : "")}
          // Settled-only empty text (LIST-EMPTY-1): supplied once the query resolves to "empty".
          emptyText={factorsListState.isEmpty ? "No factors configured yet." : undefined}
          storageKey="factor-admin-factors"
          tableTestId="factor-admin-factors-table"
        />
      )}

      {selectedFactor ? (
        <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900">{selectedFactor.name} details</div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setNoaForm({
                    noa_stamp_text: selectedFactor.noa_stamp_text ?? "",
                    noa_remit_to_name: selectedFactor.noa_remit_to_name ?? "",
                    noa_remit_to_addr: selectedFactor.noa_remit_to_addr ?? "",
                    noa_remit_to_wire_ref: selectedFactor.noa_remit_to_wire_ref ?? "",
                  });
                  setShowNoaModal(true);
                }}
              >
                Edit NOA Config
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowLorModal(true)}>
                + Letter of Release
              </Button>
              {selectedFactor.active ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={deactivateFactorMutation.isPending}
                  onClick={() => setShowDeactivateFactorModal(true)}
                >
                  Deactivate
                </Button>
              ) : null}
            </div>
          </div>

          {/* NOA config status */}
          <div className="rounded-sm border border-gray-100 bg-gray-50 p-2 text-xs">
            <div className="mb-1 font-medium text-gray-700">NOA / Remit-To Config</div>
            {selectedFactor.noa_stamp_text || selectedFactor.noa_remit_to_name ? (
              <div className="space-y-0.5 text-gray-700">
                {selectedFactor.noa_remit_to_name ? <div><span className="text-gray-500">Remit to: </span>{selectedFactor.noa_remit_to_name}</div> : null}
                {selectedFactor.noa_remit_to_addr ? <div><span className="text-gray-500">Address: </span>{selectedFactor.noa_remit_to_addr}</div> : null}
                {selectedFactor.noa_remit_to_wire_ref ? <div><span className="text-gray-500">Wire ref: </span>{selectedFactor.noa_remit_to_wire_ref}</div> : null}
                {selectedFactor.noa_stamp_text ? <div className="mt-1 rounded bg-white p-1 text-gray-600 italic">{selectedFactor.noa_stamp_text.slice(0, 120)}{selectedFactor.noa_stamp_text.length > 120 ? "…" : ""}</div> : null}
              </div>
            ) : (
              <div className="text-red-600">Not configured — invoices for assigned customers will be blocked until NOA fields are set.</div>
            )}
          </div>

          {/* LOR history */}
          {(lorQuery.data ?? []).length > 0 ? (
            <div className="rounded-sm border border-gray-100 p-2 text-xs">
              <div className="mb-1 font-medium text-gray-700">Letters of Release</div>
              <div className="space-y-1">
                {(lorQuery.data ?? []).slice(0, 5).map((lor) => (
                  <div key={lor.id} className="flex items-center gap-3 text-gray-700">
                    <span>Issued: {lor.issued_date}</span>
                    <span>Effective: {lor.effective_release_date}</span>
                    {lor.notes ? <span className="text-gray-500">{lor.notes}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* CLS-CUST-BARE-SELECT: ReferenceSelect createKind=customer (EntityPicker has no customer kind). */}
            <div className="w-80" data-testid="factor-admin-filter-customer">
              <ReferenceSelect
                value={detailCustomerId || null}
                onChange={(next) => selectDetailCustomer(next ?? "")}
                options={customerOptions}
                createKind="customer"
                operatingCompanyId={companyId}
                placeholder="Select customer for detail view"
                disabled={!companyId}
                loading={customersQuery.isLoading}
                onSearch={setCustomerSearch}
              />
            </div>
          </div>

          {detailCustomerId ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-sm border border-gray-200 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Assignment History {selectedCustomer ? `- ${selectedCustomer.name}` : ""}
                </div>
                {assignmentsListState.isError ? (
                  <ListErrorState
                    title="Couldn't load assignment history"
                    status={customerFactorDetailQuery.error instanceof ApiError ? customerFactorDetailQuery.error.status : 0}
                    message={(customerFactorDetailQuery.error as Error | undefined)?.message}
                    onRetry={() => void customerFactorDetailQuery.refetch()}
                  />
                ) : (
                  <ParityTable<CustomerFactorAssignment>
                    columns={ASSIGNMENT_COLUMNS}
                    rows={assignmentRows}
                    rowKey={(row) => row.id}
                    loading={assignmentsListState.isLoading}
                    emptyText={assignmentsListState.isEmpty ? "No assignments found for this factor/customer." : undefined}
                    storageKey="factor-admin-assignments"
                    tableTestId="factor-admin-assignments-table"
                  />
                )}
              </div>

              <div className="rounded-sm border border-gray-200 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Batch History</div>
                {batchesListState.isError ? (
                  <ListErrorState
                    title="Couldn't load batch history"
                    status={customerFactorDetailQuery.error instanceof ApiError ? customerFactorDetailQuery.error.status : 0}
                    message={(customerFactorDetailQuery.error as Error | undefined)?.message}
                    onRetry={() => void customerFactorDetailQuery.refetch()}
                  />
                ) : (
                  <ParityTable<FactorBatchHistoryRow>
                    columns={BATCH_COLUMNS}
                    rows={batchRows}
                    rowKey={(row) => row.id}
                    loading={batchesListState.isLoading}
                    emptyText={batchesListState.isEmpty ? "No batch history for this customer." : undefined}
                    storageKey="factor-admin-batches"
                    tableTestId="factor-admin-batches-table"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-600">Select a customer to view assignment and batch history.</div>
          )}
        </div>
      ) : null}

      {showAddFactorModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded-sm border border-gray-200 bg-white p-4 shadow-xl">
            <div className="mb-3 text-sm font-semibold text-gray-900">Add Factor</div>
            <div className="space-y-2 text-xs">
              <label className="block">
                <div className="mb-1">Name</div>
                <input
                  value={addForm.name}
                  onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1">Advance Rate (0-1)</div>
                <input
                  value={addForm.advance_rate}
                  onChange={(event) => setAddForm((current) => ({ ...current, advance_rate: event.target.value }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1">Fee Rate (0-1)</div>
                <input
                  value={addForm.fee_rate}
                  onChange={(event) => setAddForm((current) => ({ ...current, fee_rate: event.target.value }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1">Reserve Rate (0-1)</div>
                <input
                  value={addForm.reserve_rate}
                  onChange={(event) => setAddForm((current) => ({ ...current, reserve_rate: event.target.value }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1">Recourse Days</div>
                <input
                  value={addForm.recourse_days}
                  onChange={(event) => setAddForm((current) => ({ ...current, recourse_days: event.target.value }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowAddFactorModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={addFactorMutation.isPending}
                onClick={() => {
                  if (!addForm.name.trim()) {
                    pushToast("Factor name is required", "error");
                    return;
                  }
                  void addFactorMutation.mutateAsync();
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showAssignCustomerModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded-sm border border-gray-200 bg-white p-4 shadow-xl">
            <div className="mb-3 text-sm font-semibold text-gray-900">Assign Customer to Factor</div>
            <div className="space-y-2 text-xs">
              <label className="block">
                <div className="mb-1">Customer</div>
                <ReferenceSelect
                  value={assignCustomerId || null}
                  onChange={(next) => setAssignCustomerId(next ?? "")}
                  options={customerOptions}
                  createKind="customer"
                  operatingCompanyId={companyId}
                  placeholder="Select customer"
                  disabled={!companyId}
                  loading={customersQuery.isLoading}
                  onSearch={setCustomerSearch}
                />
              </label>
              <label className="block" data-testid="factor-admin-assign-factor-picker">
                <div className="mb-1">Factor</div>
                {/* LST-F149: bare <select> had no + Add new — operators left the assign flow to create a factor. */}
                <Combobox
                  options={assignFactorOptions}
                  value={assignFactorId || null}
                  onChange={(next) => setAssignFactorId(next ?? "")}
                  placeholder="Select factor"
                  loading={factorsQuery.isLoading}
                  allowAddNew={{
                    label: "+ Add new factor",
                    onAdd: () => setShowAddFactorModal(true),
                  }}
                />
              </label>
              <label className="block">
                <div className="mb-1">Effective date</div>
                <DatePicker
                  value={assignEffectiveFrom}
                  onChange={setAssignEffectiveFrom}
                  className="w-full"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowAssignCustomerModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={assignMutation.isPending}
                onClick={() => {
                  if (!assignCustomerId || !assignFactorId || !assignEffectiveFrom) {
                    pushToast("Customer, factor, and effective date are required", "error");
                    return;
                  }
                  void assignMutation.mutateAsync();
                }}
              >
                Assign
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showNoaModal && selectedFactor ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-lg rounded-sm border border-gray-200 bg-white p-4 shadow-xl">
            <div className="mb-3 text-sm font-semibold text-gray-900">NOA Config — {selectedFactor.name}</div>
            <div className="space-y-2 text-xs">
              <label className="block">
                <div className="mb-1 font-medium">NOA Stamp Text (printed on invoice)</div>
                <textarea
                  rows={4}
                  value={noaForm.noa_stamp_text}
                  onChange={(event) => setNoaForm((current) => ({ ...current, noa_stamp_text: event.target.value }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1 font-mono text-xs"
                  placeholder="NOTICE OF ASSIGNMENT: Pursuant to UCC 9-406, payment must be remitted to..."
                />
              </label>
              <label className="block">
                <div className="mb-1 font-medium">Remit-To Name (factor lockbox/ACH name)</div>
                <input
                  value={noaForm.noa_remit_to_name}
                  onChange={(event) => setNoaForm((current) => ({ ...current, noa_remit_to_name: event.target.value }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  placeholder="Faro Capital LLC Lockbox"
                />
              </label>
              <label className="block">
                <div className="mb-1 font-medium">Remit-To Address</div>
                <input
                  value={noaForm.noa_remit_to_addr}
                  onChange={(event) => setNoaForm((current) => ({ ...current, noa_remit_to_addr: event.target.value }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  placeholder="PO Box 12345, Dallas TX 75201"
                />
              </label>
              <label className="block">
                <div className="mb-1 font-medium">Wire / ACH Reference</div>
                <input
                  value={noaForm.noa_remit_to_wire_ref}
                  onChange={(event) => setNoaForm((current) => ({ ...current, noa_remit_to_wire_ref: event.target.value }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  placeholder="ABA 021000021 · Acct 4567890123 · Ref: [Invoice #]"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowNoaModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={updateNoaMutation.isPending}
                onClick={() => { void updateNoaMutation.mutateAsync(); }}
              >
                Save NOA Config
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showLorModal && selectedFactor ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded-sm border border-gray-200 bg-white p-4 shadow-xl">
            <div className="mb-1 text-sm font-semibold text-gray-900">Letter of Release — {selectedFactor.name}</div>
            <div className="mb-3 text-xs text-gray-600">Records that this factor has released its security interest. Required before deactivating a factor with active customer assignments.</div>
            <div className="space-y-2 text-xs">
              <label className="block">
                <div className="mb-1 font-medium">Issued Date</div>
                <DatePicker
                  value={lorForm.issued_date}
                  onChange={(next) => setLorForm((current) => ({ ...current, issued_date: next }))}
                  className="w-full"
                />
              </label>
              <label className="block">
                <div className="mb-1 font-medium">Effective Release Date</div>
                <DatePicker
                  value={lorForm.effective_release_date}
                  onChange={(next) => setLorForm((current) => ({ ...current, effective_release_date: next }))}
                  className="w-full"
                />
              </label>
              <label className="block">
                <div className="mb-1 font-medium">Notes (optional)</div>
                <input
                  value={lorForm.notes}
                  onChange={(event) => setLorForm((current) => ({ ...current, notes: event.target.value }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                  placeholder="Reference LOR document # or comments"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowLorModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={createLorMutation.isPending}
                onClick={() => {
                  if (!lorForm.issued_date || !lorForm.effective_release_date) {
                    pushToast("Issued date and effective release date are required", "error");
                    return;
                  }
                  void createLorMutation.mutateAsync();
                }}
              >
                Record LOR
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <DeactivateFactorConfirmModal
        open={showDeactivateFactorModal}
        loading={deactivateFactorMutation.isPending}
        onClose={() => setShowDeactivateFactorModal(false)}
        onConfirm={() => {
          void deactivateFactorMutation
            .mutateAsync()
            .then(() => setShowDeactivateFactorModal(false))
            .catch(() => undefined); // onError above already surfaces the toast; avoid an unhandled rejection
        }}
      />
    </div>
  );
}
