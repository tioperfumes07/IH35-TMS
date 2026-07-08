import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignCustomerFactor,
  createFactor,
  createLetterOfRelease,
  deactivateFactor,
  getCustomerFactor,
  listFactors,
  listLetterOfReleases,
  updateFactor,
  type Factor,
} from "../../api/factoring";
import { listCustomers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useListState } from "../../components/list-state";

function formatPct(value: number) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

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
    onError: (error) => pushToast(String((error as Error).message || "Failed to save NOA config"), "error"),
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
    onError: (error) => pushToast(String((error as Error).message || "Failed to record LOR"), "error"),
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
      const msg = String((error as Error).message || "");
      if (msg.includes("active_assignments_exist") || msg.includes("409")) {
        pushToast("Factor has active customer assignments. Record a Letter of Release first.", "error");
      } else {
        pushToast(msg || "Failed to deactivate factor", "error");
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
    onError: (error) => pushToast(String((error as Error).message || "Failed to create factor"), "error"),
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
    onError: (error) => pushToast(String((error as Error).message || "Failed to assign customer"), "error"),
  });

  const selectedCustomer = useMemo(
    () => (customersQuery.data ?? []).find((customer) => customer.id === detailCustomerId) ?? null,
    [customersQuery.data, detailCustomerId]
  );

  // Empty states render only once their backing query settles (never mid-fetch).
  const factorsListState = useListState(factorsQuery, (factorsQuery.data ?? []).length === 0);
  const assignmentsListState = useListState(
    customerFactorDetailQuery,
    (customerFactorDetailQuery.data?.assignments ?? []).filter((row) => row.factor_id === selectedFactor?.id).length === 0
  );
  const batchesListState = useListState(
    customerFactorDetailQuery,
    (customerFactorDetailQuery.data?.batches ?? []).length === 0
  );

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
            Add Factor
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Advance Rate</th>
              <th className="px-2 py-2">Fee Rate</th>
              <th className="px-2 py-2">Reserve Rate</th>
              <th className="px-2 py-2">Recourse Days</th>
              <th className="px-2 py-2">Active</th>
              <th className="px-2 py-2">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(factorsQuery.data ?? []).map((factor) => (
              <tr
                key={factor.id}
                onClick={() => setSelectedFactor(factor)}
                className={`cursor-pointer ${selectedFactor?.id === factor.id ? "bg-slate-100" : "hover:bg-gray-50"}`}
              >
                <td className="px-2 py-2 font-medium text-gray-900">{factor.name}</td>
                <td className="px-2 py-2">{formatPct(factor.advance_rate)}</td>
                <td className="px-2 py-2">{formatPct(factor.fee_rate)}</td>
                <td className="px-2 py-2">{formatPct(factor.reserve_rate)}</td>
                <td className="px-2 py-2">{factor.recourse_days}</td>
                <td className="px-2 py-2">{factor.active ? "Yes" : "No"}</td>
                <td className="px-2 py-2">{new Date(factor.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {factorsListState.isEmpty ? (
              <tr>
                <td className="px-2 py-4 text-gray-500" colSpan={7}>
                  No factors configured yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
                  onClick={() => {
                    if (!window.confirm(`Deactivate "${selectedFactor.name}"? A Letter of Release is required if the factor has active customer assignments.`)) return;
                    void deactivateFactorMutation.mutateAsync();
                  }}
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
            <input
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Search customer"
              className="w-56 rounded-sm border border-gray-300 px-2 py-1"
            />
            <select
              value={detailCustomerId}
              onChange={(event) => setDetailCustomerId(event.target.value)}
              className="w-80 rounded-sm border border-gray-300 px-2 py-1"
            >
              <option value="">Select customer for detail view</option>
              {(customersQuery.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.customer_code || customer.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>

          {detailCustomerId ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-sm border border-gray-200 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Assignment History {selectedCustomer ? `- ${selectedCustomer.name}` : ""}
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-2 py-2">Factor</th>
                        <th className="px-2 py-2">Effective From</th>
                        <th className="px-2 py-2">Effective To</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(customerFactorDetailQuery.data?.assignments ?? [])
                        .filter((row) => row.factor_id === selectedFactor.id)
                        .map((row) => (
                          <tr key={row.id}>
                            <td className="px-2 py-2">{row.factor_name}</td>
                            <td className="px-2 py-2">{row.effective_from}</td>
                            <td className="px-2 py-2">{row.effective_to ?? "Active"}</td>
                          </tr>
                        ))}
                      {assignmentsListState.isEmpty ? (
                        <tr>
                          <td className="px-2 py-3 text-gray-500" colSpan={3}>
                            No assignments found for this factor/customer.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-sm border border-gray-200 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Batch History</div>
                <div className="max-h-72 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-2 py-2">Batch</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(customerFactorDetailQuery.data?.batches ?? []).map((row) => (
                        <tr key={row.id}>
                          <td className="px-2 py-2">{row.batch_number}</td>
                          <td className="px-2 py-2 capitalize">{row.status}</td>
                          <td className="px-2 py-2">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : "-"}</td>
                        </tr>
                      ))}
                      {batchesListState.isEmpty ? (
                        <tr>
                          <td className="px-2 py-3 text-gray-500" colSpan={3}>
                            No batch history for this customer.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
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
                <div className="mb-1">Customer search</div>
                <input
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Type customer name"
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1">Customer</div>
                <select
                  value={assignCustomerId}
                  onChange={(event) => setAssignCustomerId(event.target.value)}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                >
                  <option value="">Select customer</option>
                  {(customersQuery.data ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1">Factor</div>
                <select
                  value={assignFactorId}
                  onChange={(event) => setAssignFactorId(event.target.value)}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                >
                  <option value="">Select factor</option>
                  {(factorsQuery.data ?? [])
                    .filter((factor) => factor.active)
                    .map((factor) => (
                      <option key={factor.id} value={factor.id}>
                        {factor.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1">Effective date</div>
                <DatePicker
                  value={assignEffectiveFrom}
                  onChange={setAssignEffectiveFrom}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
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
                  onChange={(v) => setLorForm((current) => ({ ...current, issued_date: v }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1 font-medium">Effective Release Date</div>
                <DatePicker
                  value={lorForm.effective_release_date}
                  onChange={(v) => setLorForm((current) => ({ ...current, effective_release_date: v }))}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1"
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
    </div>
  );
}
